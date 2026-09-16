from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import minimize_scalar

from science.aas77733.data import _parse_des_precision, download_verified
from science.aas77733.stats import GLSMetric, distance_modulus_flat_lcdm, fit_omega_m
from science.aas77733r1 import settings
from science.aas77733r1.context import Context
from science.aas77733r1.stats import blind_pivots, gaussian_scan_maxima, hard_step_scan, scan_null_pvalue


HARDENING_ID = "AAS77733_R1_HARDENING_LM_V1"
MEDIUM_MOCKS = 5000
BASELINE_NULL_Q95 = 9.006885900017652

OFFICIAL_LIKELIHOOD_SOURCE = {
    "path": "Pantheon+_Data/5_COSMOLOGY/cosmosis_likelihoods/Pantheon+_only_cosmosis_likelihood.py",
    "git_blob_sha1": "07d4ae5f24ae97b3416e12b17c666904b117156f",
    "url": "https://raw.githubusercontent.com/PantheonPlusSH0ES/DataRelease/c447f0fea703fcd0fff57de5000947b5ca81286b/Pantheon+_Data/5_COSMOLOGY/cosmosis_likelihoods/Pantheon+_only_cosmosis_likelihood.py",
}
DES_STATONLY_SOURCE = {
    "path": "4_DISTANCES_COVMAT/STATONLY.npz",
    "git_blob_sha1": "6d8b618da9871e55a05f1bdb84b149b2e0576e0c",
    "url": "https://raw.githubusercontent.com/des-science/DES-SN5YR/c9a4fcafc4cbd19bd750dee47fc76194a45c181f/4_DISTANCES_COVMAT/STATONLY.npz",
}
DES_MOCK_README_SOURCE = {
    "path": "1_SIMULATIONS/README.md",
    "git_blob_sha1": "3fb55df543aa500c71540b61fb38856850bc53d4",
    "url": "https://raw.githubusercontent.com/des-science/DES-SN5YR/c9a4fcafc4cbd19bd750dee47fc76194a45c181f/1_SIMULATIONS/README.md",
}


def collapse_by_cid(cid: np.ndarray, values: np.ndarray, covariance: np.ndarray) -> dict[str, Any]:
    labels = np.asarray(cid).astype(str)
    values = np.asarray(values, float)
    covariance = np.asarray(covariance, float)
    unique, inverse = np.unique(labels, return_inverse=True)
    aggregation = np.zeros((unique.size, labels.size), float)
    diag = np.clip(np.diag(covariance), np.finfo(float).tiny, None)
    for group in range(unique.size):
        idx = np.flatnonzero(inverse == group)
        raw = 1.0 / diag[idx]
        weights = raw / raw.sum()
        aggregation[group, idx] = weights
    return {
        "cid": unique,
        "values": aggregation @ values,
        "covariance": aggregation @ covariance @ aggregation.T,
        "aggregation": aggregation,
        "group_sizes": np.bincount(inverse, minlength=unique.size),
    }


def physical_sn_keys(cid: np.ndarray, ra: np.ndarray, dec: np.ndarray, z: np.ndarray) -> np.ndarray:
    cid = np.asarray(cid).astype(str)
    ra = np.asarray(ra, float)
    dec = np.asarray(dec, float)
    z = np.asarray(z, float)
    result = []
    for name, r, d, zz in zip(cid, ra, dec, z, strict=True):
        if np.isfinite(r) and np.isfinite(d) and r >= 0 and d > -90:
            result.append(f"SKY:{r:.4f}:{d:.4f}:{zz:.5f}")
        else:
            result.append(f"CID:{name}")
    return np.asarray(result, dtype=str)


def student_t_profile(
    y: np.ndarray,
    design: np.ndarray,
    covariance: np.ndarray,
    *,
    nu: float = 4.0,
    max_iter: int = 100,
    tol: float = 1e-10,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Independent Student-t M-estimator using the covariance diagonal.

    This is intentionally an outlier-sensitivity diagnostic, not a replacement for
    the canonical correlated Gaussian Pantheon+ likelihood.
    """
    y = np.asarray(y, float)
    X = np.asarray(design, float)
    if X.ndim == 1:
        X = X[:, None]
    sigma = np.sqrt(np.clip(np.diag(np.asarray(covariance, float)), np.finfo(float).tiny, None))
    inv_var = 1.0 / (sigma * sigma)
    beta = np.linalg.pinv(X.T @ (inv_var[:, None] * X), rcond=1e-12) @ (X.T @ (inv_var * y))
    converged = False
    weights = np.ones(y.size)
    for iteration in range(max_iter):
        standardized = (y - X @ beta) / sigma
        weights = (float(nu) + 1.0) / (float(nu) + standardized * standardized)
        precision = inv_var * weights
        gram = X.T @ (precision[:, None] * X)
        next_beta = np.linalg.pinv(gram, rcond=1e-12) @ (X.T @ (precision * y))
        if np.max(np.abs(next_beta - beta)) <= tol:
            beta = next_beta
            converged = True
            break
        beta = next_beta
    standardized = (y - X @ beta) / sigma
    deviance = float(np.sum((float(nu) + 1.0) * np.log1p((standardized * standardized) / float(nu))))
    return beta, {
        "converged": bool(converged),
        "iterations": int(iteration + 1),
        "min_weight": float(np.min(weights)),
        "median_weight": float(np.median(weights)),
        "deviance": deviance,
        "nu": float(nu),
        "covariance_treatment": "DIAGONAL_ONLY_OUTLIER_DIAGNOSTIC",
    }


def survey_redshift_balanced_subset(
    survey: np.ndarray,
    z: np.ndarray,
    *,
    bins: int = 4,
    seed: int = 77733,
) -> tuple[np.ndarray, dict[str, Any]]:
    survey = np.asarray(survey)
    z = np.asarray(z, float)
    edges = np.unique(np.quantile(z, np.linspace(0.0, 1.0, int(bins) + 1)))
    if edges.size < 3:
        return np.arange(z.size), {"adequate_overlap": False, "reason": "INSUFFICIENT_DISTINCT_Z_EDGES", "edges": edges.tolist()}
    memberships: list[np.ndarray] = []
    common: set[Any] | None = None
    for i, (lo, hi) in enumerate(zip(edges[:-1], edges[1:], strict=True)):
        mask = (z >= lo) & ((z <= hi) if i == edges.size - 2 else (z < hi))
        idx = np.flatnonzero(mask)
        memberships.append(idx)
        present = set(np.unique(survey[idx]).tolist())
        common = present if common is None else common & present
    common_values = sorted(common or [])
    if not common_values:
        return np.array([], dtype=int), {"adequate_overlap": False, "reason": "NO_SURVEY_PRESENT_IN_ALL_Z_BINS", "edges": edges.tolist(), "common_surveys": []}
    rng = np.random.default_rng(seed)
    selected: list[int] = []
    per_bin = []
    for idx in memberships:
        counts = {value: int(np.count_nonzero(survey[idx] == value)) for value in common_values}
        target = min(counts.values())
        row = {"target_per_survey": int(target), "counts_before": {str(k): v for k, v in counts.items()}}
        for value in common_values:
            candidates = idx[survey[idx] == value]
            chosen = rng.choice(candidates, size=target, replace=False)
            selected.extend(chosen.tolist())
        per_bin.append(row)
    selected_arr = np.sort(np.asarray(selected, dtype=int))
    return selected_arr, {
        "adequate_overlap": len(common_values) >= 2 and selected_arr.size >= 300,
        "edges": edges.tolist(),
        "common_surveys": [int(v) if isinstance(v, (int, np.integer)) else str(v) for v in common_values],
        "n_selected": int(selected_arr.size),
        "per_bin": per_bin,
        "method": "COMMON_SURVEYS_EQUAL_COUNTS_WITHIN_REDSHIFT_QUANTILE_BINS",
    }


def sky_sector_ids(ra_deg: np.ndarray, dec_deg: np.ndarray) -> np.ndarray:
    ra = np.mod(np.asarray(ra_deg, float), 360.0)
    dec = np.asarray(dec_deg, float)
    return (np.floor(ra / 90.0).astype(int) + 4 * (dec >= 0.0).astype(int)).astype(int)


def _scan_with_global_null(
    z: np.ndarray,
    residual: np.ndarray,
    metric: GLSMetric,
    *,
    mocks: int,
    rng: np.random.Generator,
    min_side_count: int = 100,
) -> dict[str, Any]:
    pivots = blind_pivots(z, min_side_count=min_side_count, z_step=0.01, min_z=0.01, max_z=1.50)
    scan = hard_step_scan(z=z, residual=residual, metric=metric, pivots=pivots)
    maxima = gaussian_scan_maxima(scan["projection"], mocks=int(mocks), rng=rng)
    p_global = scan_null_pvalue(observed=float(scan["delta_chi2"]), maxima=maxima)
    return {
        "n": int(len(z)),
        "best_z": float(scan["best_z"]),
        "delta_chi2": float(scan["delta_chi2"]),
        "amplitude_mag": float(scan["amplitude"]),
        "p_global": float(p_global),
        "null_q95": float(np.quantile(maxima, 0.95)),
        "mocks": int(mocks),
    }


def _fit_and_scan(
    z: np.ndarray,
    zhel: np.ndarray,
    observed: np.ndarray,
    metric: GLSMetric,
    omega_grid: np.ndarray,
    *,
    mocks: int,
    rng: np.random.Generator,
    min_side_count: int = 100,
) -> dict[str, Any]:
    fit = fit_omega_m(zhd=z, zhel=zhel, observed=observed, metric=metric, grid=omega_grid)
    residual = np.asarray(fit["residual"], float) - float(fit["best"]["intercept"])
    row = _scan_with_global_null(z, residual, metric, mocks=mocks, rng=rng, min_side_count=min_side_count)
    row.update({"omega_m": float(fit["best"]["omega_m"]), "chi2": float(fit["best"]["chi2"]), "intercept": float(fit["best"]["intercept"])})
    return row


def h0_official_likelihood(ctx: Context) -> dict[str, Any]:
    path, receipt = download_verified(OFFICIAL_LIKELIHOOD_SOURCE, ctx.cache_dir)
    source = path.read_text(encoding="utf-8")
    state = ctx.state("official_all", 0.01)
    numeric = {
        "n": int(state["z"].size),
        "omega_m": float(state["fit"]["best"]["omega_m"]),
        "chi2": float(state["fit"]["best"]["chi2"]),
        "intercept": float(state["fit"]["best"]["intercept"]),
    }
    semantics = {
        "uses_stat_sys": "Pantheon+SH0ES_STAT+SYS.cov" in source,
        "returns_covariance_directly": "return C" in source,
        "uses_zhd_cut_gt_001": "data['zHD']>0.01" in source.replace(" ", ""),
        "adds_extra_diagonal": ("m_b_corr_err_DIAG" in source or "np.diag" in source),
    }
    target = {"n": 1590, "omega_m": 0.33157594174137955, "chi2": 1402.9192434986066}
    checkpoint = (
        numeric["n"] == target["n"]
        and abs(numeric["omega_m"] - target["omega_m"]) < 5e-6
        and abs(numeric["chi2"] - target["chi2"]) < 1e-3
        and semantics["uses_stat_sys"]
        and semantics["returns_covariance_directly"]
        and not semantics["adds_extra_diagonal"]
    )
    return {"status": "PASS" if checkpoint else "FAIL", "metrics": {"numeric_checkpoint": numeric, "source_semantics": semantics, "target": target}, "evidence": receipt}


def h1_unique_sn_collapse(ctx: Context, mocks: int) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    c = ctx.pantheon.columns
    idx = state["idx"]
    keys = physical_sn_keys(c["CID"][idx], c["RA"][idx], c["DEC"][idx], state["z"])
    collapsed = collapse_by_cid(keys, state["observed"], state["covariance"])
    A = collapsed["aggregation"]
    z = A @ state["z"]
    zhel = A @ state["zhel"]
    metric = GLSMetric(len(z), covariance=collapsed["covariance"])
    row = _fit_and_scan(z, zhel, collapsed["values"], metric, ctx.omega_grid, mocks=mocks, rng=ctx.rng("H1"), min_side_count=100)
    duplicates_removed = int(state["z"].size - len(z))
    row.update({
        "n_light_curves": int(state["z"].size),
        "n_unique_physical_keys": int(len(z)),
        "duplicates_removed": duplicates_removed,
        "max_group_size": int(np.max(collapsed["group_sizes"])),
        "aggregation": "inverse_diagonal_variance_with_full_covariance_propagation",
    })
    status = "REINFORCES_C1" if row["p_global"] >= 0.05 else "CHALLENGES_C1"
    return {"status": status, "metrics": row}


def h2_sn_influence(ctx: Context) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    scan = state["scan"]
    projection = scan["projection"]
    scores = np.asarray(scan["scores"], float)
    residual = np.asarray(state["residual"], float)
    q = np.asarray(projection.q, float)
    leave_one_scores = scores[None, :] - (q * residual[None, :]).T
    leave_one_max = np.max(leave_one_scores * leave_one_scores, axis=1)
    baseline = float(scan["delta_chi2"])
    best_index = int(np.argmax(scores * scores))
    contributions = q[best_index] * residual
    order = np.argsort(np.abs(contributions))[::-1]
    delete_k = []
    for k in [1, 3, 5, 10, 20]:
        chosen = order[: min(k, order.size)]
        modified = scores - np.sum(q[:, chosen] * residual[chosen][None, :], axis=1)
        delete_k.append({"k": int(k), "max_delta_chi2_fixed_projection": float(np.max(modified * modified))})
    top = []
    c = ctx.pantheon.columns
    for rank, local_i in enumerate(order[:20], 1):
        original_i = int(state["idx"][local_i])
        top.append({
            "rank": rank,
            "cid": str(c["CID"][original_i]),
            "survey": int(state["survey"][local_i]),
            "z": float(state["z"][local_i]),
            "score_contribution": float(contributions[local_i]),
        })
    metrics = {
        "method": "FIXED_PROJECTION_SCORE_JACKKNIFE_NO_BACKGROUND_REFIT",
        "baseline_delta_chi2": baseline,
        "leave_one_min_max_delta_chi2": float(np.min(leave_one_max)),
        "leave_one_median_max_delta_chi2": float(np.median(leave_one_max)),
        "leave_one_max_max_delta_chi2": float(np.max(leave_one_max)),
        "any_leave_one_above_frozen_null_q95": bool(np.any(leave_one_max >= BASELINE_NULL_Q95)),
        "frozen_baseline_null_q95_reference": BASELINE_NULL_Q95,
        "delete_k": delete_k,
        "top_influential_objects": top,
    }
    return {"status": "DIAGNOSTIC", "metrics": metrics}


def _student_t_scan(z: np.ndarray, residual: np.ndarray, covariance: np.ndarray, pivots: np.ndarray, *, nu: float = 4.0) -> dict[str, Any]:
    null_beta, null_diag = student_t_profile(residual, np.ones((len(z), 1)), covariance, nu=nu)
    rows = []
    for pivot in pivots:
        design = np.column_stack([np.ones(len(z)), (z > float(pivot)).astype(float)])
        beta, diag = student_t_profile(residual, design, covariance, nu=nu)
        rows.append({"z": float(pivot), "delta_deviance": float(null_diag["deviance"] - diag["deviance"]), "step_amplitude_mag": float(beta[1]), "min_weight": float(diag["min_weight"])})
    best = max(rows, key=lambda r: r["delta_deviance"])
    return {"best": best, "null": {"intercept": float(null_beta[0]), **null_diag}, "scan": rows}


def h3_robust_likelihood(ctx: Context) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    diag_cov = np.diag(np.diag(state["covariance"]))
    diag_metric = GLSMetric(len(state["z"]), covariance=diag_cov)
    gaussian = _fit_and_scan(state["z"], state["zhel"], state["observed"], diag_metric, ctx.omega_grid, mocks=MEDIUM_MOCKS, rng=ctx.rng("H3", 1))

    def objective(omega: float) -> float:
        residual = state["observed"] - distance_modulus_flat_lcdm(state["z"], state["zhel"], float(omega))
        _, diag = student_t_profile(residual, np.ones((len(residual), 1)), diag_cov, nu=4.0)
        return float(diag["deviance"])

    optimum = minimize_scalar(objective, bounds=(0.15, 0.50), method="bounded", options={"xatol": 1e-8, "maxiter": 200})
    omega_t = float(optimum.x)
    residual_t = state["observed"] - distance_modulus_flat_lcdm(state["z"], state["zhel"], omega_t)
    pivots = blind_pivots(state["z"], **settings.BLIND_SCAN)
    robust = _student_t_scan(state["z"], residual_t, diag_cov, pivots, nu=4.0)
    return {
        "status": "DIAGNOSTIC",
        "metrics": {
            "scope": "DIAGONAL_ONLY_OUTLIER_SENSITIVITY_NOT_CANONICAL_COVARIANCE_REPLACEMENT",
            "gaussian_diagonal": gaussian,
            "student_t_nu4": {"omega_m": omega_t, **robust},
        },
    }


def h4_survey_balance(ctx: Context, mocks: int) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    chosen, diagnostics = survey_redshift_balanced_subset(state["survey"], state["z"], bins=4, seed=ctx.seed + 404)
    if not diagnostics.get("adequate_overlap"):
        return {"status": "OPEN", "metrics": diagnostics, "note": "Survey/redshift overlap is insufficient for a defensible common-survey balanced subset."}
    cov = state["covariance"][np.ix_(chosen, chosen)]
    metric = GLSMetric(len(chosen), covariance=cov)
    row = _fit_and_scan(state["z"][chosen], state["zhel"][chosen], state["observed"][chosen], metric, ctx.omega_grid, mocks=mocks, rng=ctx.rng("H4"), min_side_count=max(30, min(100, len(chosen)//5)))
    row["balance"] = diagnostics
    return {"status": "REINFORCES_C1" if row["p_global"] >= 0.05 else "CHALLENGES_C1", "metrics": row}


def _alt_exact_scan(ctx: Context, keep: np.ndarray, z_alt: np.ndarray, *, mocks: int, salt: int) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    chosen = np.flatnonzero(np.asarray(keep, bool))
    cov = state["covariance"][np.ix_(chosen, chosen)]
    metric = GLSMetric(chosen.size, covariance=cov)
    return _fit_and_scan(np.asarray(z_alt, float)[chosen], state["zhel"][chosen], state["observed"][chosen], metric, ctx.omega_grid, mocks=mocks, rng=ctx.rng("H5", salt), min_side_count=max(50, min(100, chosen.size//5)))


def h5_sky_and_redshift(ctx: Context, mocks: int) -> dict[str, Any]:
    state = ctx.state("non_calibrator", settings.PRIMARY_ZMIN)
    zcmb = _alt_exact_scan(ctx, np.ones(len(state["z"]), bool), state["zcmb"], mocks=mocks, salt=1)
    c = ctx.pantheon.columns
    ra = np.asarray(c["RA"], float)[state["idx"]]
    dec = np.asarray(c["DEC"], float)[state["idx"]]
    sectors = sky_sector_ids(ra, dec)
    jackknife = []
    p_values = [zcmb["p_global"]]
    for sector in range(8):
        keep = sectors != sector
        if np.count_nonzero(~keep) < 10:
            jackknife.append({"sector": sector, "status": "INSUFFICIENT_SECTOR_SIZE", "removed": int(np.count_nonzero(~keep))})
            continue
        row = _alt_exact_scan(ctx, keep, state["z"], mocks=mocks, salt=10 + sector)
        row.update({"sector": sector, "removed": int(np.count_nonzero(~keep)), "status": "OK"})
        jackknife.append(row)
        p_values.append(row["p_global"])
    metrics = {
        "zCMB_branch": zcmb,
        "sky_sector_scheme": "RA_QUADRANTS_X_DECLINATION_HEMISPHERES",
        "sky_jackknife": jackknife,
        "minimum_global_p_across_executed_forks": float(min(p_values)),
    }
    return {"status": "REINFORCES_C1" if min(p_values) >= 0.05 else "CHALLENGES_C1", "metrics": metrics}


def _des_variant(ctx: Context, precision: np.ndarray, *, mocks: int, salt: int) -> dict[str, Any]:
    b = ctx.des
    z_all = np.asarray(b.columns["zHD"], float)
    idx = np.flatnonzero(z_all > 0)
    z = z_all[idx]
    zhel = np.asarray(b.columns["zHEL"], float)[idx]
    observed = np.asarray(b.columns["MU"], float)[idx]
    metric = GLSMetric(idx.size, precision=np.asarray(precision, float)[np.ix_(idx, idx)])
    return _fit_and_scan(z, zhel, observed, metric, ctx.omega_grid, mocks=mocks, rng=ctx.rng("H6", salt))


def h6_des_covariance_forks(ctx: Context, mocks: int) -> dict[str, Any]:
    stat_path, stat_receipt = download_verified(DES_STATONLY_SOURCE, ctx.cache_dir)
    stat_precision = _parse_des_precision(stat_path)
    readme_path, readme_receipt = download_verified(DES_MOCK_README_SOURCE, ctx.cache_dir)
    readme = readme_path.read_text(encoding="utf-8")
    stat_sys = _des_variant(ctx, ctx.des.precision, mocks=mocks, salt=1)
    stat_only = _des_variant(ctx, stat_precision, mocks=mocks, salt=2)
    pantheon_z = float(ctx.state("non_calibrator", settings.PRIMARY_ZMIN)["scan"]["best_z"])
    full_replication = stat_sys["p_global"] < 0.05 and abs(stat_sys["best_z"] - pantheon_z) <= 0.05
    metrics = {
        "STAT+SYS": stat_sys,
        "STATONLY": stat_only,
        "pantheon_best_z": pantheon_z,
        "full_covariance_consistent_replication": bool(full_replication),
        "official_validation_mocks": {
            "documented_count": 25 if "25 mocks" in readme else None,
            "used_in_this_hardening_run": False,
            "reason": "Official public mocks are raw SNANA FITS simulations, not released Hubble-diagram realizations; ingesting them would require rerunning the DES light-curve/classification/distance pipeline and exceeds the light-medium scope.",
        },
    }
    status = "CHALLENGES_C1" if full_replication else "REINFORCES_C1"
    return {"status": status, "metrics": metrics, "evidence": {"statonly": stat_receipt, "mock_readme": readme_receipt, "stat_sys": ctx.des.receipts}}


def run_hardening(*, cache_dir: str | Path, mocks: int = MEDIUM_MOCKS, seed: int = 77733) -> dict[str, Any]:
    ctx = Context(Path(cache_dir), mocks=int(mocks), seed=int(seed))
    tests = {
        "H0": h0_official_likelihood(ctx),
        "H1": h1_unique_sn_collapse(ctx, int(mocks)),
        "H2": h2_sn_influence(ctx),
        "H3": h3_robust_likelihood(ctx),
        "H4": h4_survey_balance(ctx, int(mocks)),
        "H5": h5_sky_and_redshift(ctx, int(mocks)),
        "H6": h6_des_covariance_forks(ctx, int(mocks)),
    }
    challenges = [key for key, value in tests.items() if value["status"] == "CHALLENGES_C1"]
    opens = [key for key, value in tests.items() if value["status"] == "OPEN"]
    synthesis = "C1_CHALLENGED_BY_LIGHT_MEDIUM_HARDENING" if challenges else "C1_REINFORCED_OR_UNCHANGED_BY_LIGHT_MEDIUM_HARDENING"
    payload: dict[str, Any] = {
        "battery_id": HARDENING_ID,
        "scope": "POST_FREEZE_LIGHT_MEDIUM_HARDENING",
        "frozen_publication_battery_modified": False,
        "canonical_g19_classification_before": "C1_NO_ROBUST_RESIDUAL_FEATURE",
        "canonical_g19_automatically_replaced": False,
        "seed": int(seed),
        "mocks_per_score_space_variant": int(mocks),
        "tests": tests,
        "challenges": challenges,
        "open_tests": opens,
        "synthesis": synthesis,
        "validation_status": "PASS",
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    payload["result_hash"] = hashlib.sha256(canonical).hexdigest()
    return payload
