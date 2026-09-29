"""CF4 corrigido: reconstrução local sem distâncias SNIa e comparação Pantheon+.

A reconstrução é definida nesta receita, não é o campo HMC/Wiener do EDD.
Uma reconstrução só não decide os dois contratos que exigem duas independentes.
"""
import gzip
import hashlib
import io
import json
import os
import urllib.error
import urllib.request

import numpy as np
import pandas as pd
from scipy.integrate import cumulative_trapezoid
from scipy.linalg import cho_factor, cho_solve


C = 299792.458
CF4_VERSION = "Tully et al. 2023, ApJ 944/94; CDS archive 28-Jan-2025"
PPLUS_COMMIT = "c447f0fea703fcd0fff57de5000947b5ca81286b"
PPLUS_BASE = ("https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/"
              + PPLUS_COMMIT + "/Pantheon%2B_Data/4_DISTANCES_AND_COVAR/")
SOURCES = {
    "cf4_readme": ("https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe",
                   "2cfed1418147d5a626dee1fa37c47252124477c9828490508d9bbe511d34edb4"),
    "cf4_groups": ("https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table3.dat.gz",
                   "1c02e2b3829b0b323524a5f3671a5f530cbdccae3c10b432db0c2e2fe09672fe"),
    "cf4_velocities": ("https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table4.dat.gz",
                       "be91d4fae6fa01552ab3bc85db695411fca3249eeae08b566a712e6ea790bd99"),
    "pantheon_plus": (PPLUS_BASE + "Pantheon%2BSH0ES.dat",
                      "1cb0fc379ef066afdc2ffd1857681cc478024570d8a3eba284fb645775198cf8"),
    "pantheon_covariance": (PPLUS_BASE + "Pantheon%2BSH0ES_STAT%2BSYS.cov",
                            "abf806d966485e64afdb359c87bffc0ecc00d05eff0a31ced66f247385df0fdc"),
}


class InputUnavailable(Exception):
    def __init__(self, decision, reason):
        self.decision, self.reason = decision, reason
        super().__init__(reason)


def fetch(name):
    url, expected = SOURCES[name]
    try:
        with urllib.request.urlopen(url, timeout=180) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise InputUnavailable("DATA_UNAVAILABLE", f"Fonte oficial indisponível: {name}: {exc}") from exc
    if hashlib.sha256(data).hexdigest() != expected:
        raise InputUnavailable("DATA_HASH_MISMATCH", f"O arquivo {name} mudou; SHA256 diverge do release congelado.")
    return data


def fixed_rows(data, columns):
    # CDS byte-by-byte descriptions use 1-based inclusive intervals.
    rows = []
    for line in gzip.decompress(data).decode("ascii").splitlines():
        rows.append([float(line[start - 1:end].strip() or "nan") for start, end in columns])
    return np.asarray(rows, dtype=float)


def load_cf4(z_min, z_max):
    fetch("cf4_readme")
    # Table 3: 1PGC, SNIa distance modulus. A blank count alone does not prove absence.
    methods = fixed_rows(fetch("cf4_groups"), [(1, 7), (101, 106)])
    sn_groups = set(methods[np.isfinite(methods[:, 1]), 0].astype(int))
    # Table 4: ID, eDM, V3k, fV3k, Vpwf, RA, DEC (CMB velocities, km/s).
    rows = fixed_rows(fetch("cf4_velocities"),
                      [(1, 7), (16, 20), (40, 44), (46, 50), (59, 63), (84, 91), (93, 100)])
    z = rows[:, 2] / C
    eligible = np.isfinite(rows).all(axis=1) & (rows[:, 1] > 0) & (z >= z_min) & (z < z_max)
    overlaps = np.isin(rows[:, 0].astype(int), list(sn_groups))
    rows = rows[eligible & ~overlaps]
    # Watkins-Feldman log-distance estimator; its Gaussian error follows eDM.
    sigma = rows[:, 3] / (1 + rows[:, 2] / C) * np.log(10) / 5 * rows[:, 1]
    return rows, sigma, {"total_groups": len(methods), "groups_with_snia": len(sn_groups),
                         "excluded_snia_in_depth": int(np.sum(eligible & overlaps)),
                         "used_non_snia_groups": len(rows)}


def unit_vectors(ra, dec):
    lon, lat = np.deg2rad(ra), np.deg2rad(dec)
    return np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))


def distance_grid(omega_m, h0):
    z = np.linspace(0, 0.2, 10001)
    e = np.sqrt(omega_m * (1 + z) ** 3 + 1 - omega_m)
    return z, C / h0 * cumulative_trapezoid(1 / e, z, initial=0), e


def reconstruct(group_positions, group_directions, velocities, variances, positions, directions,
                smoothing_mpc, min_effective_groups):
    """Gaussian-local GLS bulk vectors, projected on each SN line of sight.

    A is the exact linear map from measured CF4 radial velocities to predictions.
    A diag(sigma^2) A^T preserves shared-group covariance between SNe.
    """
    operators, effective = [], []
    for position, direction in zip(positions, directions):
        radius2 = np.sum((group_positions - position) ** 2, axis=1)
        weights = np.exp(-radius2 / (2 * smoothing_mpc ** 2)) / variances
        neff = weights.sum() ** 2 / (weights @ weights)
        normal = group_directions.T @ (weights[:, None] * group_directions)
        if neff < min_effective_groups or np.linalg.cond(normal) > 1e5:
            raise InputUnavailable("RECONSTRUCTION_UNDERSAMPLED",
                                   f"Cobertura local insuficiente: N efetivo={neff:.1f}; nenhuma SN foi substituída ou descartada.")
        operators.append(direction @ np.linalg.solve(normal, group_directions.T * weights))
        effective.append(float(neff))
    operator = np.asarray(operators)
    return operator @ velocities, (operator * variances) @ operator.T, np.asarray(effective)


def gls_metrics(residual, covariance, directions):
    factor = cho_factor(covariance)
    one = np.ones(len(residual))
    solved_one = cho_solve(factor, one)
    offset = float(residual @ solved_one / (one @ solved_one))
    centered = residual - offset
    design = np.column_stack((one, directions))
    inverse_design = cho_solve(factor, design)
    normal = design.T @ inverse_design
    if np.linalg.cond(normal) > 1e8:
        raise InputUnavailable("SKY_GEOMETRY_DEGENERATE", "O céu selecionado não permite medir monopolo e dipolo separadamente.")
    fit = np.linalg.solve(normal, design.T @ cho_solve(factor, residual))
    return {"offset_mag": offset, "offset_error_mag": float((one @ solved_one) ** -0.5),
            "residual_rms_mag": float(np.sqrt(np.mean(centered ** 2))),
            "residual_variance_mag2": float(np.mean(centered ** 2)),
            "chi2_after_monopole": float(centered @ cho_solve(factor, centered)),
            "dipole_magnitude_mag": float(np.linalg.norm(fit[1:])),
            "dipole_equatorial_components_mag": fit[1:].tolist()}


def compare(residual_standard, residual_cf4, covariance, directions, h0):
    standard = gls_metrics(residual_standard, covariance, directions)
    corrected = gls_metrics(residual_cf4, covariance, directions)
    offset_change = corrected["offset_mag"] - standard["offset_mag"]
    return {"standard": standard, "cf4": corrected,
            "variance_fraction_reduced": 1 - corrected["residual_variance_mag2"] / standard["residual_variance_mag2"],
            "dipole_fraction_reduced": 1 - corrected["dipole_magnitude_mag"] / standard["dipole_magnitude_mag"],
            "delta_h0_at_reference_km_s_mpc": float(h0 * np.expm1(-np.log(10) / 5 * offset_change)),
            "h0_ratio_cf4_to_standard": float(np.exp(-np.log(10) / 5 * offset_change))}


def run(params):
    mode = params.get("mode", "sn_crosscheck")
    if mode not in ("sn_crosscheck", "anchor_velocity"):
        raise ValueError("mode deve ser sn_crosscheck ou anchor_velocity")
    cuts = [float(value) for value in params.get("z_minima", [0.01, 0.023])]
    zmax = float(params.get("z_max", 0.05))
    smoothing = float(params.get("smoothing_mpc", 40))
    min_sn = int(params.get("min_unique_sn", 30))
    min_groups = int(params.get("min_effective_groups", 30))
    if len(cuts) < 2 or not 0 < min(cuts) < max(cuts) < zmax <= 0.1 or smoothing <= 0:
        raise ValueError("Congele pelo menos dois cortes 0 < z_min < z_max <= 0,1 e smoothing positivo")
    h0, omega_m = 74.6, 0.27  # CF4 table 4 conventions, not a fitted H0 measurement.
    groups, sigma, group_stats = load_cf4(0.005, 0.1)
    sn = pd.read_csv(io.BytesIO(fetch("pantheon_plus")), sep=r"\s+")
    raw_covariance = np.fromstring(fetch("pantheon_covariance").decode(), sep=" ")
    n = int(raw_covariance[0])
    if n != len(sn) or len(raw_covariance) != n * n + 1:
        raise InputUnavailable("DATA_SCHEMA_INVALID", "A covariância Pantheon+ não corresponde à tabela congelada.")
    covariance = raw_covariance[1:].reshape(n, n)
    selected = np.flatnonzero((sn.zCMB >= min(cuts)) & (sn.zCMB < zmax) & (sn.IS_CALIBRATOR == 0))
    sn = sn.iloc[selected].reset_index(drop=True)
    if sn.CID.nunique() < min_sn:
        raise InputUnavailable("SAMPLE_TOO_SMALL", f"Só {sn.CID.nunique()} SNe distintas; mínimo congelado {min_sn}.")
    zg, dg, eg = distance_grid(omega_m, h0)
    group_dirs = unit_vectors(groups[:, 5], groups[:, 6])
    directions = unit_vectors(sn.RA.to_numpy(), sn.DEC.to_numpy())
    group_positions = group_dirs * np.interp(groups[:, 2] / C, zg, dg)[:, None]
    positions = directions * np.interp(sn.zCMB, zg, dg)[:, None]
    velocity, velocity_covariance, effective = reconstruct(
        group_positions, group_dirs, groups[:, 4], sigma ** 2 + 250 ** 2, positions, directions,
        smoothing, min_groups)
    z_cf4 = (1 + sn.zCMB.to_numpy()) / (1 + velocity / C) - 1
    if np.any(z_cf4 <= 0) or not np.isfinite(z_cf4).all():
        raise InputUnavailable("INVALID_RECONSTRUCTED_REDSHIFT", "O campo reconstruído produz redshift cosmológico não positivo.")
    model = lambda redshift: 5 * np.log10((1 + sn.zHEL.to_numpy()) * np.interp(redshift, zg, dg)) + 25
    standard_residual = sn.m_b_corr.to_numpy() - model(sn.zHD)
    cf4_residual = sn.m_b_corr.to_numpy() - model(z_cf4)
    # dmu/dv: dchi/dz=C/(H0 E), dz/dv=-(1+zCMB)/(C(1+v/C)^2).
    # C cancels; the Jacobian has units mag/(km/s).
    jacobian = (-5 / np.log(10) / np.interp(z_cf4, zg, dg) / np.interp(z_cf4, zg, eg)
                / h0 * (1 + sn.zCMB.to_numpy()) / (1 + velocity / C) ** 2)
    field_covariance = jacobian[:, None] * velocity_covariance * jacobian[None, :]
    # Same covariance on BOTH central-value models: retain the published standard
    # PV errors and add CF4 prediction uncertainty. No undocumented subtraction.
    common_covariance = covariance[np.ix_(selected, selected)] + field_covariance
    regions = ((directions[:, 0] >= 0).astype(int) + 2 * (directions[:, 1] >= 0)
               + 4 * (directions[:, 2] >= 0))
    windows = []
    for cut in cuts:
        mask = (sn.zCMB.to_numpy() >= cut)
        if sn.loc[mask, "CID"].nunique() < min_sn:
            raise InputUnavailable("SAMPLE_TOO_SMALL", f"O corte zCMB >= {cut} tem menos de {min_sn} SNe distintas.")
        indices = np.flatnonzero(mask)
        result = compare(standard_residual[indices], cf4_residual[indices],
                         common_covariance[np.ix_(indices, indices)], directions[indices], h0)
        result.update({"z_min": cut, "z_max": zmax, "measurements": len(indices),
                       "unique_sn": int(sn.loc[mask, "CID"].nunique()), "leave_one_region_out": []})
        for region in range(8):
            hold = np.flatnonzero(mask & (regions != region))
            if sn.loc[hold, "CID"].nunique() < min_sn:
                raise InputUnavailable("SAMPLE_TOO_SMALL", f"Retirar região {region} deixa menos de {min_sn} SNe distintas.")
            result["leave_one_region_out"].append({"excluded_region": region,
                **compare(standard_residual[hold], cf4_residual[hold],
                          common_covariance[np.ix_(hold, hold)], directions[hold], h0)})
        windows.append(result)
    statistics = {"mode": mode, "cf4": group_stats, "windows": windows,
                  "smoothing_mpc": smoothing, "min_effective_groups_observed": float(effective.min()),
                  "predicted_velocity_min_max_km_s": [float(velocity.min()), float(velocity.max())],
                  "reconstruction": "Gaussian-local radial-velocity GLS; no SNIa groups",
                  "number_of_new_reconstructions": 1, "cf4_h0_km_s_mpc": h0, "cf4_omega_m": omega_m,
                  "covariance_policy": "published STAT+SYS plus propagated CF4; identical weights for both models",
                  "calibration_independence": False, "direct_snia_distance_overlap_excluded": True,
                  "sources": {name: {"url": url, "sha256": sha,
                                      "version": CF4_VERSION if name.startswith("cf4") else PPLUS_COMMIT}
                              for name, (url, sha) in SOURCES.items()}}
    if mode == "anchor_velocity":
        reason = ("A reconstrução CF4 foi calculada e cruzada com as mesmas SNe. Faltam uma segunda "
                  "reconstrução independente e os bindings públicos congelados de calibração Cepheid/TRGB "
                  "com covariância; os deslocamentos são relativos à referência H0=74,6.")
        decision = "MISSING_INDEPENDENT_FIELD_AND_ANCHORS"
    else:
        reason = ("O cruzamento real mede quanto uma reconstrução CF4 muda dispersão, dipolo e H0 relativo. "
                  "O contrato exige duas reconstruções independentes e previsão externa de densidade. "
                  "Este campo usa distâncias CF4, exclui grupos SNIa, mas conserva a calibração compartilhada.")
        decision = "SINGLE_DISTANCE_RECONSTRUCTION"
    return {"verdict": "INCONCLUSIVE", "decision": decision,
            "summary": f"CF4 corrigido: {len(groups)} grupos sem SNIa, {sn.CID.nunique()} SNe distintas, {len(windows)} cortes calculados.",
            "statistics": statistics, "semantic": {"result_meaning": reason}}


def main():
    with open(os.environ["PARAMS_PATH"], encoding="utf-8") as source:
        params = json.load(source)
    try:
        result = run(params)
    except InputUnavailable as exc:
        result = {"verdict": "INCONCLUSIVE", "decision": exc.decision, "summary": exc.reason,
                  "statistics": {}, "semantic": {"result_meaning": exc.reason}}
    with open(os.environ["RESULT_PATH"], "w", encoding="utf-8") as target:
        json.dump(result, target, ensure_ascii=False, allow_nan=False)
    print(result["summary"])


if __name__ == "__main__":
    main()
