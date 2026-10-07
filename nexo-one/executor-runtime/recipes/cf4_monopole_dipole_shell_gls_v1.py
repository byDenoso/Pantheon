"""CF4 shell Hubble monopole vs dipole test for T-H0LCDM26-002-R2-CF4-ENV-MONOPOLE.

The recipe implements the frozen TEST contract only. It reads the corrected
Cosmicflows-4 group catalog, fits H_i = monopole + dipole dot n independently
in fixed distance shells with published distance-modulus uncertainties, and
compares the 40-120 Mpc joint monopole against the fixed 120-160 Mpc reference.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np


CF4_VERSION = "CDS archive 28-Jan-2025 / J/ApJ/944/94"
SOURCES = {
    "CF4 ReadMe": {
        "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe",
        "sha256": "2cfed1418147d5a626dee1fa37c47252124477c9828490508d9bbe511d34edb4",
    },
    "CF4 table3.dat.gz": {
        "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table3.dat.gz",
        "sha256": "1c02e2b3829b0b323524a5f3671a5f530cbdccae3c10b432db0c2e2fe09672fe",
    },
    "CF4 table4.dat.gz": {
        "url": "https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table4.dat.gz",
        "sha256": "be91d4fae6fa01552ab3bc85db695411fca3249eeae08b566a712e6ea790bd99",
    },
}
SHELLS = ((20.0, 40.0), (40.0, 60.0), (60.0, 80.0), (80.0, 120.0), (120.0, 160.0))
REFERENCE = (120.0, 160.0)
JOINT = (40.0, 120.0)
CONFIDENCE_Z = 1.959963984540054


class InputUnavailable(RuntimeError):
    def __init__(self, decision: str, reason: str):
        self.decision = decision
        self.reason = reason
        super().__init__(reason)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_frozen_inputs() -> None:
    """When the production runner supplies INPUTS_PATH, require the exact Tower binding."""
    if os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS") != "1":
        return
    path = os.environ.get("INPUTS_PATH")
    if not path:
        raise InputUnavailable("INPUT_BINDING_MISSING", "O runner exigiu inputs congelados, mas INPUTS_PATH não foi fornecido.")
    try:
        rows = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError) as exc:
        raise InputUnavailable("INPUT_BINDING_INVALID", f"Não foi possível ler o binding congelado: {exc}") from exc
    if not isinstance(rows, list):
        raise InputUnavailable("INPUT_BINDING_INVALID", "O binding congelado não é uma lista de inputs.")
    observed = {(str(row.get("url") or ""), str(row.get("sha256") or "")) for row in rows if isinstance(row, dict)}
    required = {(item["url"], item["sha256"]) for item in SOURCES.values()}
    if not required.issubset(observed):
        raise InputUnavailable("INPUT_BINDING_MISMATCH", "Os URLs/SHA256 do runner não reproduzem os três inputs CF4 congelados.")


def fetch_source(name: str) -> bytes:
    source = SOURCES[name]
    try:
        with urllib.request.urlopen(source["url"], timeout=180) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise InputUnavailable("DATA_UNAVAILABLE", f"Fonte oficial indisponível: {name}: {exc}") from exc
    if _sha256(data) != source["sha256"]:
        raise InputUnavailable("DATA_HASH_MISMATCH", f"Os bytes de {name} não correspondem ao SHA256 congelado.")
    return data


def _float_field(line: str, start: int, end: int) -> float:
    value = line[start - 1:end].strip()
    return float(value) if value else math.nan


def _int_field(line: str, start: int, end: int) -> int:
    value = line[start - 1:end].strip()
    return int(value) if value else 0


def parse_method_flags(raw: bytes) -> dict[int, tuple[bool, bool]]:
    """Return 1PGC -> (has_FP, has_TF) from table3 method-count fields."""
    out: dict[int, tuple[bool, bool]] = {}
    for line in gzip.decompress(raw).decode("ascii").splitlines():
        if not line.strip():
            continue
        pgc = _int_field(line, 1, 7)
        fp_count = _int_field(line, 114, 116)
        tf_count = _int_field(line, 131, 132)
        if pgc:
            out[pgc] = (fp_count > 0, tf_count > 0)
    return out


def parse_hubble_groups(raw: bytes, method_flags: dict[int, tuple[bool, bool]]) -> dict[str, np.ndarray]:
    """Parse table4 published group H_i and uncertainty-carrying distance modulus."""
    rows = []
    for line in gzip.decompress(raw).decode("ascii").splitlines():
        if not line.strip():
            continue
        pgc = _int_field(line, 1, 7)
        edm = _float_field(line, 16, 20)
        distance = _float_field(line, 22, 26)
        hi = _float_field(line, 71, 75)
        ra = _float_field(line, 84, 91)
        dec = _float_field(line, 93, 100)
        fp, tf = method_flags.get(pgc, (False, False))
        rows.append((pgc, edm, distance, hi, ra, dec, fp, tf))
    arr = np.asarray(rows, dtype=float)
    if arr.ndim != 2 or arr.shape[1] != 8:
        raise InputUnavailable("DATA_SCHEMA_INVALID", "table4 não pôde ser interpretada no schema CF4 congelado.")
    pgc, edm, distance, hi, ra, dec = (arr[:, i] for i in range(6))
    valid = (np.isfinite(edm) & np.isfinite(distance) & np.isfinite(hi) & np.isfinite(ra) & np.isfinite(dec)
             & (edm > 0) & (distance > 0) & (hi > 0) & (dec >= -90) & (dec <= 90))
    sigma_hi = np.abs(hi) * (math.log(10.0) / 5.0) * edm
    valid &= np.isfinite(sigma_hi) & (sigma_hi > 0)
    return {
        "pgc": pgc[valid].astype(np.int64),
        "distance": distance[valid],
        "hi": hi[valid],
        "sigma_hi": sigma_hi[valid],
        "ra": ra[valid],
        "dec": dec[valid],
        "has_fp": arr[valid, 6].astype(bool),
        "has_tf": arr[valid, 7].astype(bool),
    }


def unit_vectors(ra_deg: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    ra = np.deg2rad(np.mod(ra_deg, 360.0))
    dec = np.deg2rad(dec_deg)
    cosd = np.cos(dec)
    return np.column_stack((cosd * np.cos(ra), cosd * np.sin(ra), np.sin(dec)))


def healpix_nside1_ring(ra_deg: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    """Exact HEALPix RING ang2pix for Nside=1, translated from HEALPix loc2pix."""
    phi = np.deg2rad(np.mod(ra_deg, 360.0))
    z = np.sin(np.deg2rad(dec_deg))
    out = np.empty(len(z), dtype=np.int64)
    for index, (zz, pp) in enumerate(zip(z, phi)):
        za = abs(float(zz))
        tt = (float(pp) / (0.5 * math.pi)) % 4.0
        if za <= 2.0 / 3.0:
            temp1 = 0.5 + tt
            temp2 = float(zz) * 0.75
            jp = int(temp1 - temp2)
            jm = int(temp1 + temp2)
            ir = 2 + jp - jm
            kshift = 1 - (ir & 1)
            t1 = jp + jm - 1 + kshift + 1 + 8
            ip = (t1 >> 1) % 4
            out[index] = (ir - 1) * 4 + ip
        else:
            tp = tt - int(tt)
            tmp = math.sqrt(3.0 * (1.0 - za))
            jp = int(tp * tmp)
            jm = int((1.0 - tp) * tmp)
            ir = jp + jm + 1
            ip = int(tt * ir)
            out[index] = 2 * ir * (ir - 1) + ip if zz > 0 else 12 - 2 * ir * (ir + 1) + ip
    if np.any((out < 0) | (out >= 12)):
        raise InputUnavailable("HEALPIX_PARTITION_INVALID", "A partição HEALPix Nside=1 produziu índice fora de 0..11.")
    return out


def _shell_mask(distance: np.ndarray, bounds: tuple[float, float], *, include_high: bool = False) -> np.ndarray:
    lo, hi = bounds
    return (distance >= lo) & ((distance <= hi) if include_high else (distance < hi))


def fit_monopole_dipole(groups: dict[str, np.ndarray], mask: np.ndarray) -> dict:
    indices = np.flatnonzero(mask)
    if len(indices) < 4:
        raise InputUnavailable("SHELL_UNDERSAMPLED", f"Shell contém apenas {len(indices)} grupos; são necessários ao menos 4 para monopolo+dipolo.")
    directions = unit_vectors(groups["ra"][indices], groups["dec"][indices])
    design = np.column_stack((np.ones(len(indices)), directions))
    y = groups["hi"][indices]
    sigma = groups["sigma_hi"][indices]
    weight = 1.0 / np.square(sigma)
    normal = design.T @ (weight[:, None] * design)
    condition = float(np.linalg.cond(normal))
    if not np.isfinite(condition) or condition > 1e12:
        raise InputUnavailable("SKY_GEOMETRY_DEGENERATE", f"Matriz GLS mal condicionada: cond={condition:.3g}.")
    covariance = np.linalg.inv(normal)
    beta = covariance @ (design.T @ (weight * y))
    residual = y - design @ beta
    chi2 = float(np.sum(np.square(residual / sigma)))
    dipole = beta[1:]
    dipole_cov = covariance[1:, 1:]
    dipole_sn2 = float(dipole @ np.linalg.solve(dipole_cov, dipole))
    return {
        "n": int(len(indices)),
        "monopole_km_s_mpc": float(beta[0]),
        "monopole_se_km_s_mpc": float(math.sqrt(covariance[0, 0])),
        "dipole_components_km_s_mpc": [float(value) for value in dipole],
        "dipole_amplitude_km_s_mpc": float(np.linalg.norm(dipole)),
        "dipole_sn": float(math.sqrt(max(0.0, dipole_sn2))),
        "chi2": chi2,
        "dof": int(len(indices) - 4),
        "normal_condition": condition,
    }


def contrast(fit: dict, reference: dict) -> dict:
    delta = fit["monopole_km_s_mpc"] - reference["monopole_km_s_mpc"]
    se = math.sqrt(fit["monopole_se_km_s_mpc"] ** 2 + reference["monopole_se_km_s_mpc"] ** 2)
    return {
        "delta_h_km_s_mpc": float(delta),
        "se_km_s_mpc": float(se),
        "lower95_km_s_mpc": float(delta - CONFIDENCE_Z * se),
        "upper95_km_s_mpc": float(delta + CONFIDENCE_Z * se),
    }


def _fit_pair(groups: dict[str, np.ndarray], keep: np.ndarray | None = None) -> tuple[dict, dict, dict]:
    if keep is None:
        keep = np.ones(len(groups["distance"]), dtype=bool)
    joint_mask = keep & _shell_mask(groups["distance"], JOINT)
    ref_mask = keep & _shell_mask(groups["distance"], REFERENCE, include_high=True)
    joint = fit_monopole_dipole(groups, joint_mask)
    reference = fit_monopole_dipole(groups, ref_mask)
    return joint, reference, contrast(joint, reference)


def analyze(groups: dict[str, np.ndarray], params: dict) -> dict:
    expected = {
        "shells_mpc": [[20, 40], [40, 60], [60, 80], [80, 120], [120, 160]],
        "reference_shell_mpc": [120, 160],
        "joint_shell_mpc": [40, 120],
        "healpix_nside": 1,
        "promotion_delta_min": 1.5,
        "promotion_lower95_min": 0.5,
        "promotion_positive_loo_min": 10,
        "h2_monopole_max": 0.5,
        "h2_dipole_sn_min": 3.0,
        "h2_shells_min": 2,
        "kill_abs_delta_max": 0.5,
        "kill_upper95_max": 1.0,
    }
    if params != expected:
        raise InputUnavailable("FROZEN_PARAMS_MISMATCH", "Os parâmetros não reproduzem exatamente shells, referência e critérios congelados do TEST.")

    distances = groups["distance"]
    base = (distances >= 20.0) & (distances <= 160.0)
    shell_results = []
    reference_fit = fit_monopole_dipole(groups, base & _shell_mask(distances, REFERENCE, include_high=True))
    for bounds in SHELLS:
        fitted = fit_monopole_dipole(groups, base & _shell_mask(distances, bounds, include_high=(bounds == REFERENCE)))
        if bounds == REFERENCE:
            vs_reference = {
                "delta_h_km_s_mpc": 0.0,
                "se_km_s_mpc": 0.0,
                "lower95_km_s_mpc": 0.0,
                "upper95_km_s_mpc": 0.0,
                "self_reference": True,
            }
        else:
            vs_reference = {**contrast(fitted, reference_fit), "self_reference": False}
        shell_results.append({"shell_mpc": list(bounds), "fit": fitted, "vs_reference": vs_reference})

    joint_fit, _, joint_contrast = _fit_pair(groups, base)

    pixels = healpix_nside1_ring(groups["ra"], groups["dec"])
    regional = []
    for pixel in range(12):
        keep = base & (pixels != pixel)
        joint_loo, ref_loo, delta_loo = _fit_pair(groups, keep)
        regional.append({
            "excluded_pixel_ring": pixel,
            "joint_n": joint_loo["n"],
            "reference_n": ref_loo["n"],
            **delta_loo,
        })
    positive_loo = sum(row["delta_h_km_s_mpc"] > 0 for row in regional)

    method_loo = []
    for label, flag in (("FP", groups["has_fp"]), ("TF", groups["has_tf"])):
        identified = int(np.sum(base & flag))
        if identified == 0:
            continue
        joint_loo, ref_loo, delta_loo = _fit_pair(groups, base & ~flag)
        method_loo.append({
            "excluded_method_family": label,
            "identified_groups": identified,
            "joint_n": joint_loo["n"],
            "reference_n": ref_loo["n"],
            **delta_loo,
        })

    decision_shells = [row for row in shell_results if row["shell_mpc"] in ([40.0, 60.0], [60.0, 80.0], [80.0, 120.0])]
    dipole_shells_ge3 = sum(row["fit"]["dipole_sn"] >= 3.0 for row in decision_shells)
    delta = joint_contrast["delta_h_km_s_mpc"]
    lower95 = joint_contrast["lower95_km_s_mpc"]
    upper95 = joint_contrast["upper95_km_s_mpc"]

    if delta >= 1.5 and lower95 > 0.5 and positive_loo >= 10:
        verdict, decision = "PROMOTED", "PROMOTED_LOCAL_MONOPOLE"
        meaning = "O contraste monopolar 40-120 versus 120-160 Mpc satisfaz o limiar congelado e permanece positivo em pelo menos 10 das 12 retiradas HEALPix."
    elif delta < 0.5 and dipole_shells_ge3 >= 2:
        verdict, decision = "REJECTED", "CLASSIFY_ANISOTROPIC_H2"
        meaning = "O monopolo conjunto fica abaixo de +0,5 km/s/Mpc enquanto o dipolo atinge S/N>=3 em pelo menos dois shells; o padrão favorece a alternativa anisotrópica H2 sobre o monopolo H1."
    elif abs(delta) < 0.5 and upper95 < 1.0 and dipole_shells_ge3 == 0:
        verdict, decision = "REJECTED", "REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT"
        meaning = "O contraste monopolar é menor que 0,5 km/s/Mpc em módulo, seu limite superior de 95% fica abaixo de +1,0 e nenhum shell 40-120 tem dipolo S/N>=3."
    else:
        verdict, decision = "INCONCLUSIVE", "CF4_ENVIRONMENT_CRITERIA_NOT_DECISIVE"
        meaning = "Os dados foram ajustados pelo contrato congelado, mas não satisfazem integralmente os critérios pré-registrados de promoção, classificação H2 ou rejeição."

    return {
        "verdict": verdict,
        "decision": decision,
        "summary": (f"CF4 shells: DeltaH(40-120 vs 120-160)={delta:.3f} km/s/Mpc, "
                    f"95%=[{lower95:.3f},{upper95:.3f}], LOO positivo={positive_loo}/12, "
                    f"shells com dipolo S/N>=3={dipole_shells_ge3}/3."),
        "statistics": {
            "groups_20_160": int(np.sum(base)),
            "shells": shell_results,
            "joint_40_120": {"fit": joint_fit, "vs_reference": joint_contrast},
            "reference_120_160": reference_fit,
            "healpix": {"nside": 1, "ordering": "RING", "frame": "ICRS", "leave_one_region_out": regional,
                        "positive_contrast_count": int(positive_loo)},
            "leave_one_method_family_out": method_loo,
            "decision_components": {"dipole_shells_sn_ge_3": int(dipole_shells_ge3)},
            "uncertainty_model": "diagonal GLS; sigma_H/H = ln(10)/5 * e_DMzp from published CF4 group modulus uncertainty",
            "no_correlated_shell_significance_sum": True,
        },
        "semantic": {"result_meaning": meaning},
    }


def run(params: dict) -> dict:
    _validate_frozen_inputs()
    fetch_source("CF4 ReadMe")
    method_flags = parse_method_flags(fetch_source("CF4 table3.dat.gz"))
    groups = parse_hubble_groups(fetch_source("CF4 table4.dat.gz"), method_flags)
    result = analyze(groups, params)
    result["statistics"]["sources"] = {
        name: {"url": item["url"], "sha256": item["sha256"], "version": CF4_VERSION}
        for name, item in SOURCES.items()
    }
    result["statistics"]["catalog_groups_valid"] = int(len(groups["distance"]))
    return result


def main() -> None:
    exit_code = 0
    try:
        params = json.loads(Path(os.environ["PARAMS_PATH"]).read_text(encoding="utf-8"))
        result = run(params)
    except (InputUnavailable, OSError, ValueError, KeyError, json.JSONDecodeError, np.linalg.LinAlgError) as exc:
        exit_code = 1
        decision = exc.decision if isinstance(exc, InputUnavailable) else "INPUT_OR_FIT_UNAVAILABLE"
        result = {
            "execution_status": "INPUT_OR_FIT_UNAVAILABLE",
            "error": str(exc),
            "decision": decision,
            "statistics": {
                "test_id": TEST_ID,
                "prereg_hash": PREREG_HASH,
                "recovery_work_id": RECOVERY_WORK_ID,
                "recipe_family": RECIPE_FAMILY,
            },
        }
    Path(os.environ["RESULT_PATH"]).write_text(
        json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2), encoding="utf-8")
    print(result.get("summary") or result.get("error"))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
