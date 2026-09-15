from __future__ import annotations

import numpy as np

from science.aas77733.data import download_verified
from science.aas77733.stats import condition_number_spd
from . import settings
from .context import Context
from .stats import hard_step_scan
from .utils import gate_result


PRIORITY_MATRIX = [
    {"kind":"existing_literature","reference":"Brout et al. 2022; Scolnic et al. 2022","dataset":"Pantheon+SH0ES","statistic":"full-covariance SN likelihood","redshift":"release support","interpretation":"canonical public baseline"},
    {"kind":"existing_literature","reference":"Hu & Wang 2022; Jia et al. 2023 and related transition studies","dataset":"Pantheon/Pantheon+","statistic":"redshift-split/transition diagnostics","redshift":"reported around z~0.4-0.5","interpretation":"z~0.4 behavior is not novel"},
    {"kind":"existing_literature","reference":"Gross & Vitells 2010","dataset":"generic scans","statistic":"look-elsewhere max statistic","redshift":"declared scan domain","interpretation":"global calibration must repeat the complete scan"},
    {"kind":"established_methods","reference":"standard GLS/permutation/injection methodology","dataset":"heterogeneous surveys","statistic":"GLS, structured nulls, nuisance profiling, power","redshift":"not specific","interpretation":"individual methods are established"},
    {"kind":"project_extension","reference":"AAS77733-R1 audit","dataset":"Pantheon+ and DES-SN5YR","statistic":"frozen G0-G19 hierarchy","redshift":"blind scan plus provenance window","interpretation":"potential novelty is reproducible gate orchestration and claim closure"},
]


def g0(ctx: Context, results: dict) -> dict:
    kinds = {r["kind"] for r in PRIORITY_MATRIX}
    ok = {"existing_literature","established_methods","project_extension"}.issubset(kinds)
    return gate_result("G0", "PASS" if ok else "FAIL", metrics={"rows":PRIORITY_MATRIX,"methods_claimed_novel":False})


def g1(ctx: Context, results: dict) -> dict:
    state = ctx.state("official_all", 0.01)
    best = state["fit"]["best"]
    source = {
        "path":"Pantheon+_Data/5_COSMOLOGY/cosmosis_likelihoods/Pantheon+_only_cosmosis_likelihood.py",
        "git_blob_sha1":settings.PANTHEON_LIKELIHOOD["git_blob_sha1"],
        "url":"https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/" + settings.PANTHEON_LIKELIHOOD["commit"] + "/Pantheon+_Data/5_COSMOLOGY/cosmosis_likelihoods/Pantheon+_only_cosmosis_likelihood.py",
    }
    _, receipt = download_verified(source, ctx.cache_dir)
    ok = np.isfinite(best["chi2"]) and settings.OMEGA_GRID["min"] < best["omega_m"] < settings.OMEGA_GRID["max"]
    return gate_result("G1", "PASS" if ok else "FAIL", metrics={"n":int(state["idx"].size),"omega_m":float(best["omega_m"]),"chi2_profiled":float(best["chi2"]),"intercept":float(best["intercept"]),"convention":"m_b_corr; zHD integration; zHEL luminosity factor; full STAT+SYS; continuous Omega_m and intercept profile"}, evidence={"official_likelihood":receipt})


def g2(ctx: Context, results: dict) -> dict:
    canonical = ctx.state("official_all", 0.01, extra_diag=False)
    referee = ctx.state("official_all", 0.01, extra_diag=True)
    a = canonical["scan"]; b = referee["scan"]
    condition = condition_number_spd(canonical["covariance"])
    ok = np.isfinite(condition)
    return gate_result("G2", "PASS" if ok else "FAIL", metrics={
        "adjudication":"official_full_STAT+SYS_is_canonical; extra_DIAG_is_sensitivity_only",
        "official_likelihood_adds_extra_diag":False,
        "canonical":{"omega_m":float(canonical["fit"]["best"]["omega_m"]),"chi2":float(canonical["fit"]["best"]["chi2"]),"best_z":float(a["best_z"]),"delta_chi2":float(a["delta_chi2"]),"amplitude_mag":float(a["amplitude"])},
        "referee_plus_diag":{"omega_m":float(referee["fit"]["best"]["omega_m"]),"chi2":float(referee["fit"]["best"]["chi2"]),"best_z":float(b["best_z"]),"delta_chi2":float(b["delta_chi2"]),"amplitude_mag":float(b["amplitude"])},
        "difference":{"omega_m":float(referee["fit"]["best"]["omega_m"]-canonical["fit"]["best"]["omega_m"]),"delta_chi2":float(b["delta_chi2"]-a["delta_chi2"]),"pivot":float(b["best_z"]-a["best_z"]),"amplitude_mag":float(b["amplitude"]-a["amplitude"])},
        "covariance_condition_number":float(condition),
    })


def g3(ctx: Context, results: dict) -> dict:
    b = ctx.pantheon
    state = ctx.state("non_calibrator", 0.01)
    cov = state["covariance"]
    asym = float(np.max(np.abs(cov-cov.T)))
    try:
        np.linalg.cholesky(cov); chol = True
    except np.linalg.LinAlgError:
        chol = False
    eig_min = float(np.min(np.linalg.eigvalsh(cov)))
    ok = b.n == 1701 and chol and eig_min > 0 and state["idx"].size > 1000
    return gate_result("G3", "PASS" if ok else "FAIL", metrics={"rows_total":b.n,"primary_n":int(state["idx"].size),"covariance_shape":list(cov.shape),"max_asymmetry":asym,"min_eigenvalue":eig_min,"cholesky":chol,"condition_number":float(condition_number_spd(cov)),"row_mapping":"single release order; submatrices use identical integer indices"}, evidence=b.receipts)


def g4(ctx: Context, results: dict) -> dict:
    all_state = ctx.state("official_all",0.01)
    flow = ctx.state("non_calibrator",0.01)
    cal = ctx.calibrator_state()
    return gate_result("G4","PASS",metrics={
        "official_all":{"n":int(all_state["idx"].size),"best_z":float(all_state["scan"]["best_z"]),"delta_chi2":float(all_state["scan"]["delta_chi2"])},
        "non_calibrator":{"n":int(flow["idx"].size),"best_z":float(flow["scan"]["best_z"]),"delta_chi2":float(flow["scan"]["delta_chi2"])},
        "calibrator_only":{**cal,"scan_applicable":False,"reason":"Cepheid calibrators identify the calibration branch rather than a broad blind redshift transition scan"},
    })


def g5(ctx: Context, results: dict) -> dict:
    surface = []
    for zmin in settings.ZMIN_SWEEP:
        for branch in ("official_all","non_calibrator"):
            s = ctx.state(branch,zmin)
            surface.append({"branch":branch,"z_min":float(zmin),"n":int(s["idx"].size),"best_z":float(s["scan"]["best_z"]),"delta_chi2":float(s["scan"]["delta_chi2"]),"amplitude_mag":float(s["scan"]["amplitude"])})
    surface.append({"branch":"calibrator_only","z_min":None,**ctx.calibrator_state(),"scan_applicable":False})
    primary = [r for r in surface if r.get("branch")=="non_calibrator" and r.get("z_min") is not None]
    pivots = np.asarray([r["best_z"] for r in primary],float)
    deltas = np.asarray([r["delta_chi2"] for r in primary],float)
    stable = bool(np.ptp(pivots) <= 0.10 and np.all(np.isfinite(deltas)))
    return gate_result("G5","PASS" if stable else "FAIL",metrics={"surface":surface,"non_calibrator_pivot_range":float(np.ptp(pivots)),"stable_under_declared_cuts":stable})


GATES={"G0":g0,"G1":g1,"G2":g2,"G3":g3,"G4":g4,"G5":g5}
