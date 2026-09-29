"""DESI DR1 full-shape: official REPT model, windows and systematic covariance.

Profiles DESI nuisance parameters at cosmologies frozen in ``cases``. This is
not an MCMC or a substitute for a preregistered multi-probe test. See
``docs/desi_dr1_fullshape.md`` for the geometry/growth split and Planck prior.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.error
import urllib.request

import numpy as np
from scipy.optimize import minimize

DATA_BASE = "https://data.desi.lbl.gov/public/dr1/vac/dr1/full-shape-bao-clustering/v1.0/data/likelihood/"
SOURCE_COMMIT = "7d51f4f86dc3bee6bf10f1a684913c943a89a844"
SOURCE_BASE = f"https://raw.githubusercontent.com/cosmodesi/desi-kp-cosmological-likelihoods/{SOURCE_COMMIT}/dr1/cobaya/"
SOURCE_HASHES = {
    "desi_fs_bao_all": "bd38dbd94aa57ff0230a167d98efd2e78d92da197b21af4ccd8c19cad8c2d8cd",
    "reptvelocileptors": "da867a7430fac3ea33122a1657ca8488d444638f05eb4601d196c0d1bc5a7c49",
}
# Published SHA256 manifest in the official v1.0 release (2026-02-11).
BINS = {
    "LRG_z0": ("LRG", "0.4-0.6", "9ee36802183942595ea54b09b61686dedb337a5655ec1003889843082aaa949b"),
    "LRG_z1": ("LRG", "0.6-0.8", "a72c9f8019ce43e47c812cf645df723c84f960c4c17e40bef2869e4b5d0ab81b"),
    "LRG_z2": ("LRG", "0.8-1.1", "b7b8b17e78a3a666bd34a5406cb311c4279a948826a39cbbe0393c7022e71caf"),
    "ELG_z1": ("ELG_LOPnotqso", "1.1-1.6", "a4e942eac71e89192ee1028c78d9e5c6c69c54bf082068ef73fd06b1a047fe59"),
    "QSO_z0": ("QSO", "0.8-2.1", "b4bca859502271d09ea900b4bed4228f43303097658a38b57ac345ed395b782f"),
}
PLANCK_URL = "https://arxiv.org/pdf/1807.06209v3"
PLANCK_SHA256 = "cfaccea46f78543bbae92cc16f1012034de9914f3e45a76c0a31a36d3a9c8de5"
# Planck 2018 VI, Table 2: TT,TE,EE+lowE+lensing, 100 theta_*.
PLANCK_MEAN, PLANCK_SIGMA = 1.04110, 0.00031
COMMON_DEFAULTS = {
    "H0": 67.36, "omega_b": 0.02237, "omega_cdm": 0.12,
    "A_s": 2.0989e-9, "n_s": 0.9649, "m_ncdm": 0.06,
    "N_eff": 3.044, "tau_reio": 0.0544,
}
LATE_DEFAULTS = {"w0_fld": -1.0, "wa_fld": 0.0}


class MissingInput(Exception):
    pass


def verified_bytes(url, expected_hash):
    with urllib.request.urlopen(url, timeout=180) as response:
        raw = response.read()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected_hash:
        raise MissingInput(f"SHA256 divergiu no arquivo oficial: {url}")
    return raw


def official_module(name, directory):
    path = directory / (name + ".py")
    path.write_bytes(verified_bytes(SOURCE_BASE + name + ".py", SOURCE_HASHES[name]))
    spec = importlib.util.spec_from_file_location("nexo_desi_official_" + name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def cosmologies(case, mode, redshifts):
    from cosmoprimo import Cosmology
    common = COMMON_DEFAULTS | case.get("cosmology", {})
    unknown = set(common) - set(COMMON_DEFAULTS)
    if unknown:
        raise ValueError(f"Parâmetros cosmológicos desconhecidos: {sorted(unknown)}")
    geometry = LATE_DEFAULTS | case.get("geometry", {})
    growth = geometry if mode == "tracer" else LATE_DEFAULTS | case.get("growth", {})
    for late in (geometry, growth):
        if set(late) != set(LATE_DEFAULTS) or late["w0_fld"] + late["wa_fld"] >= 0:
            raise ValueError("O split admite só w0_fld e wa_fld tardios, com w0+wa<0.")
    if mode == "tracer" and "growth" in case:
        raise ValueError("Use geometry_growth para separar a cosmologia de crescimento.")
    options = {"engine": "camb", "dark_energy_model": "ppf", "z_pk": list(redshifts), "kmax_pk": 100.0}
    geo = Cosmology(**common, **geometry, **options)
    gro = geo if geometry == growth else Cosmology(**common, **growth, **options)
    return geo, gro, common, geometry, growth


class SpectrumProvider:
    """Cobaya provider interface; CAMB power in physical Mpc units, AP from geometry.

    Early parameters and H0 are shared. Only late w0/wa are split; this preserves
    the h conversion expected by the unchanged official REPT implementation.
    """
    def __init__(self, geometry, growth, theory):
        self.geometry, self.growth, self.theory = geometry, growth, theory
        self.params = {"H0": growth["H0"], "ombh2": growth["omega_b"],
                       "omch2": growth["omega_cdm"], "ns": growth["n_s"]}
        self.pk_cache = {}

    def get_Hubble(self, z, units="km/s/Mpc"):
        return 100.0 * self.geometry["h"] * self.geometry.get_background().efunc(z)

    def get_angular_diameter_distance(self, z):
        return self.geometry.get_background().angular_diameter_distance(z) / self.geometry["h"]

    def get_param(self, name):
        if name != "rdrag":
            raise ValueError(name)
        return self.growth.get_thermodynamics().rs_drag / self.growth["h"]

    def get_Omega_b(self, z):
        return self.growth["Omega_b"]

    def get_Omega_cdm(self, z):
        return self.growth["Omega_cdm"]

    def get_Omega_nu_massive(self, z):
        return np.sum(self.growth["Omega_ncdm"])

    def get_Pk_grid(self, var_pair, nonlinear=False):
        if nonlinear:
            raise ValueError("REPT exige o espectro linear como entrada.")
        if var_pair not in self.pk_cache:
            fields = {"delta_nonu": "delta_cb", "v_newtonian_baryon": "theta_b", "v_newtonian_cdm": "theta_cdm"}
            z = np.asarray(self.theory.z)
            h = self.growth["h"]
            interpolator = self.growth.get_fourier().pk_interpolator(of=tuple(fields[x] for x in var_pair))
            kh = np.asarray(interpolator.k)
            kh = kh[(kh >= interpolator.extrap_kmin) & (kh <= interpolator.extrap_kmax)]
            k = kh * h
            power = interpolator(kh, z) / h**3
            if not np.all(np.isfinite(power)):
                raise MissingInput("CAMB retornou espectro não finito na grade requerida.")
            self.pk_cache[var_pair] = k, z, np.asarray(power).reshape(len(k), len(z)).T
        return self.pk_cache[var_pair]

    def get_pkpoles(self, *args, **kwargs):
        return self.theory.get_pkpoles(*args, **kwargs)


def fit_bias(likelihood):
    namespace = "pre_" + likelihood.zbins[0][2] + "."
    names = ("b1p", "b2p", "bsp")

    def objective(values):
        parameters = {namespace + key: float(value) for key, value in zip(names, values)}
        parameters[namespace + "b3p"] = 0.0
        # Official Gaussian priors on physical b2p, bsp, sigma=5.
        return float(-2.0 * likelihood.logp(**parameters) + (values[1] / 5.0)**2 + (values[2] / 5.0)**2)

    fits = [minimize(objective, [b1, 0.0, 0.0], method="L-BFGS-B",
                     bounds=[(0.0, 3.0), (None, None), (None, None)],
                     options={"maxiter": 300, "ftol": 1e-10, "gtol": 1e-6}) for b1 in (0.6, 1.0, 1.5)]
    good = [fit for fit in fits if fit.success and np.isfinite(fit.fun)]
    if not good:
        raise MissingInput("O ajuste dos parâmetros de viés não convergiu.")
    best = min(good, key=lambda fit: fit.fun)
    if best.x[0] < 1e-4 or best.x[0] > 3.0 - 1e-4:
        raise MissingInput("O viés atingiu o limite do prior oficial; ajuste degenerado.")
    return float(best.fun), dict(zip(names, map(float, best.x)))


def decision(cases, criterion):
    if not criterion or set(cases) != {"null", "rival"}:
        return "INCONCLUSIVE", "NO_FROZEN_COMPARISON", "A likelihood foi calculada; faltam os dois modelos e um critério de comparação congelados.", {}
    if set(criterion) != {"promote_delta_chi2", "reject_delta_chi2", "min_blocks"}:
        raise ValueError("criterion exige promote_delta_chi2, reject_delta_chi2 e min_blocks.")
    high, low, need = float(criterion["promote_delta_chi2"]), float(criterion["reject_delta_chi2"]), int(criterion["min_blocks"])
    if high <= low or low < 0 or need < 1:
        raise ValueError("Critério inválido: promote > reject >=0 e min_blocks >=1.")
    delta = cases["null"]["profile_chi2"] - cases["rival"]["profile_chi2"]
    per_block = {key: cases["null"]["blocks"][key]["profile_chi2"] - cases["rival"]["blocks"][key]["profile_chi2"] for key in cases["null"]["blocks"]}
    stats = {"delta_chi2": delta, "delta_chi2_by_block": per_block, "criterion": criterion}
    if len(per_block) < need:
        return "INCONCLUSIVE", "TOO_FEW_BLOCKS", "Há poucos blocos de redshift para o critério congelado.", stats
    if delta >= high and sum(value > 0 for value in per_block.values()) >= need:
        return "PROMOTED", "FROZEN_RIVAL_IMPROVES", "O modelo rival congelado melhorou o ajuste conjunto e os blocos exigidos pelo critério.", stats
    if delta <= low or sum(value > 0 for value in per_block.values()) < need:
        return "REJECTED", "FROZEN_RIVAL_FAILS", "O modelo rival congelado não alcançou o ganho e a concordância entre blocos exigidos.", stats
    return "INCONCLUSIVE", "INTERMEDIATE_GAIN", "O ganho do modelo rival ficou entre os limiares congelados.", stats


def run(params):
    mode = params.get("mode", "tracer")
    if mode not in {"tracer", "geometry_growth"}:
        raise ValueError("mode deve ser tracer ou geometry_growth.")
    selected = params.get("bins")
    if selected is None:
        tracers = params.get("tracers", ["LRG", "ELG", "QSO"])
        if not tracers or set(tracers) - {"LRG", "ELG", "QSO"}:
            raise ValueError("tracers admite LRG, ELG, QSO.")
        selected = [name for name in BINS if name.split("_")[0] in tracers]
    if not selected or len(set(selected)) != len(selected) or set(selected) - set(BINS):
        raise ValueError("bins deve conter bins oficiais distintos.")
    cases_input = params.get("cases", {"null": {}})
    if not cases_input or set(cases_input) - {"null", "rival"}:
        raise ValueError("cases admite somente null e rival.")
    provenance = []
    verified_bytes(PLANCK_URL, PLANCK_SHA256)
    provenance.append({"url": PLANCK_URL, "sha256": PLANCK_SHA256, "version": "1807.06209v3, Table 2"})
    with tempfile.TemporaryDirectory(prefix="nexo-desi-dr1-") as work:
        directory = Path(work)
        official_likelihood = official_module("desi_fs_bao_all", directory)
        official_theory = official_module("reptvelocileptors", directory)
        for name, sha in SOURCE_HASHES.items():
            provenance.append({"url": SOURCE_BASE + name + ".py", "sha256": sha, "commit": SOURCE_COMMIT})
        likes = {}
        for name in selected:
            tracer, zrange, sha = BINS[name]
            filename = f"likelihood_spectrum-poles-rotated_syst-rotation-hod-photo_{tracer}_GCcomb_z{zrange}_thetacut0.05.h5"
            (directory / filename).write_bytes(verified_bytes(DATA_BASE + filename, sha))
            provenance.append({"url": DATA_BASE + filename, "sha256": sha, "version": "DESI DR1 VAC v1.0"})
            like = official_likelihood.desi_fs_bao_all({"observable_name": "spectrum-poles-rotated", "tracers": [name.lower()], "data_dir": str(directory), "solve": "best"})
            if len(like.flatdata[0]) < 20:
                raise MissingInput("O vetor de dados contém menos de 20 medições.")
            np.linalg.cholesky(like.precision[0])
            likes[name] = like
        requirements = dict(next(iter(likes.values())).get_requirements()["pkpoles"])
        requirements["z"] = [like.get_requirements()["pkpoles"]["z"][0] for like in likes.values()]
        for like in likes.values():
            if not np.array_equal(like.kin, requirements["k"]):
                raise MissingInput("As grades oficiais de k dos traçadores são incompatíveis.")
        theory = official_theory.reptvelocileptors()
        theory.must_provide(pkpoles=requirements)
        cases = {}
        for label, case in cases_input.items():
            if set(case) - {"cosmology", "geometry", "growth"}:
                raise ValueError(f"Campos desconhecidos no modelo {label}.")
            geo, gro, common, geometry, growth = cosmologies(case, mode, theory.z)
            provider = SpectrumProvider(geo, gro, theory)
            theory.provider = provider
            state = {}
            theory.calculate(state)
            theory._current_state = state
            theta = float(100.0 * geo.get_thermodynamics().theta_star_noreion)
            planck_chi2 = ((theta - PLANCK_MEAN) / PLANCK_SIGMA)**2
            blocks = {}
            for index, (name, like) in enumerate(likes.items()):
                like.provider = provider
                chi2, nuisance = fit_bias(like)
                blocks[name] = {"profile_chi2": chi2, "nuisance": nuisance, "measurements": len(like.flatdata[0]),
                                "window_shape": list(like.window[0].shape), "zeff": float(theory.z[index]),
                                "sigma8": float(state["sigma8"][index]), "fsigma8": float(state["fsigma8"][index])}
            cases[label] = {"profile_chi2": planck_chi2 + sum(row["profile_chi2"] for row in blocks.values()),
                            "planck_chi2": planck_chi2, "theta_star_100": theta, "blocks": blocks,
                            "cosmology": common, "geometry": geometry, "growth": growth}
    verdict, code, meaning, comparison = decision(cases, params.get("criterion"))
    return {"verdict": verdict, "decision": code, "summary": f"DESI DR1 full-shape: {len(selected)} blocos reais; {code}.",
            "statistics": {"mode": mode, "cases": cases, "comparison": comparison, "provenance": provenance,
                           "sigma8_convention": "cold dark matter + baryons (delta_cb), as in the official REPT theory",
                           "planck_compression": {"observables": ["theta_star_100"], "mean": [PLANCK_MEAN], "covariance": [[PLANCK_SIGMA**2]]},
                           "scope": "Comparação de cosmologias congeladas, com nuisance perfilado; sem posterior-predictive, lensing ou validação de estabilidade."},
            "semantic": {"result_meaning": meaning}}


def main():
    params = json.loads(Path(os.environ["PARAMS_PATH"]).read_text(encoding="utf-8"))
    try:
        payload = run(params)
    except (MissingInput, urllib.error.URLError, TimeoutError) as error:
        payload = {"verdict": "INCONCLUSIVE", "decision": "OFFICIAL_INPUT_UNAVAILABLE", "summary": str(error),
                   "statistics": {"mode": params.get("mode"), "reason": str(error)},
                   "semantic": {"result_meaning": "O dado oficial ou o ajuste válido não ficou disponível: " + str(error)}}
    Path(os.environ["RESULT_PATH"]).write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(payload["summary"])


if __name__ == "__main__":
    main()
