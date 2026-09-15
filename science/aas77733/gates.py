from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np

from .data import (
    DESBundle,
    PantheonBundle,
    load_des5yr,
    load_pantheon,
    pantheon_primary_mask,
    pantheon_sensitivity_mask,
    subset_covariance,
)
from .stats import (
    GLSMetric,
    condition_number_spd,
    distance_modulus_flat_lcdm,
    fit_omega_m,
    gaussian_bump_projection,
    gaussian_scan_maxima,
    gaussian_score_draws,
    hard_step_scan,
    pivot_draws,
    scan_null_pvalue,
    structured_permutation_maxima,
    survey_nuisance_design,
    template_scan,
)


def gate_result(
    gate_id: str,
    status: str,
    *,
    metrics: dict[str, Any] | None = None,
    evidence: dict[str, Any] | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    if status not in {"PASS", "FAIL", "OPEN", "INCONCLUSIVE", "BLOCKED"}:
        raise ValueError(f"INVALID_GATE_STATUS:{status}")
    result: dict[str, Any] = {"gate_id": gate_id, "status": status, "metrics": metrics or {}}
    if evidence:
        result["evidence"] = evidence
    if note:
        result["note"] = note
    return result


def close_claim(results: dict[str, dict[str, Any]], manifest: dict[str, Any]) -> dict[str, Any]:
    """Frozen absorbing closure. It reads gate outputs; it never repairs or reinterprets them."""
    integrity = ["G1", "G2", "G3"]
    integrity_fail = [gate for gate in integrity if results.get(gate, {}).get("status") != "PASS"]
    if integrity_fail:
        return {
            "classification": "BLOCKED_INTEGRITY",
            "defeating_gates": integrity_fail,
            "open_gates": [],
            "physical_interpretation": False,
        }

    open_gates = [
        gate
        for gate in ["G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15", "G16", "G17", "G18"]
        if results.get(gate, {}).get("status") in {None, "OPEN", "INCONCLUSIVE", "BLOCKED"}
    ]
    defeating = [
        gate
        for gate in ["G5", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15", "G16", "G17"]
        if results.get(gate, {}).get("status") == "FAIL"
    ]

    feature = results.get("G6", {})
    feature_delta = float(feature.get("metrics", {}).get("delta_chi2", 0.0) or 0.0)
    if feature.get("status") == "FAIL" or feature_delta <= 0.0:
        return {
            "classification": "NO_ROBUST_FEATURE",
            "defeating_gates": sorted(set(defeating + ["G6"])),
            "open_gates": open_gates,
            "physical_interpretation": False,
        }
    if defeating:
        return {
            "classification": "RESIDUAL_DIAGNOSTIC_ONLY",
            "defeating_gates": defeating,
            "open_gates": open_gates,
            "physical_interpretation": False,
        }

    required_physical = ["G6", "G8", "G11", "G12", "G14", "G15", "G17"]
    if manifest.get("closure", {}).get("physical_support_requires_external_context", True):
        required_physical.append("G18")
    missing_physical = [gate for gate in required_physical if results.get(gate, {}).get("status") != "PASS"]
    if missing_physical or open_gates:
        return {
            "classification": "INCONCLUSIVE_OPEN_GATES",
            "defeating_gates": [],
            "open_gates": sorted(set(open_gates + missing_physical)),
            "physical_interpretation": False,
        }
    return {
        "classification": "PHYSICAL_TRANSITION_SUPPORTED",
        "defeating_gates": [],
        "open_gates": [],
        "physical_interpretation": True,
    }


@dataclass
class BatteryContext:
    manifest: dict[str, Any]
    cache_dir: Path
    mocks: int
    seed: int
    _pantheon: PantheonBundle | None = None
    _des: DESBundle | None = None
    memo: dict[str, Any] = field(default_factory=dict)

    def rng(self, gate_id: str, salt: int = 0) -> np.random.Generator:
        gate_number = int(gate_id[1:]) if gate_id.startswith("G") else 0
        return np.random.default_rng(self.seed + 1009 * gate_number + 7919 * salt)

    @property
    def pantheon(self) -> PantheonBundle:
        if self._pantheon is None:
            self._pantheon = load_pantheon(self.cache_dir)
        return self._pantheon

    @property
    def des(self) -> DESBundle:
        if self._des is None:
            self._des = load_des5yr(self.cache_dir)
        return self._des

    @property
    def pivots(self) -> np.ndarray:
        scan = self.manifest["pantheon"]["scan"]
        return np.round(np.arange(scan["z_min"], scan["z_max"] + scan["z_step"] / 2.0, scan["z_step"]), 10)

    @property
    def omega_grid(self) -> np.ndarray:
        spec = self.manifest["pantheon"]["omega_m_grid"]
        return np.round(np.arange(spec["min"], spec["max"] + spec["step"] / 2.0, spec["step"]), 10)

    def subset_state(self, kind: str = "primary") -> dict[str, Any]:
        key = f"state:{kind}"
        if key in self.memo:
            return self.memo[key]
        bundle = self.pantheon
        mask = pantheon_primary_mask(bundle) if kind == "primary" else pantheon_sensitivity_mask(bundle)
        idx = np.flatnonzero(mask)
        columns = bundle.columns
        covariance = bundle.covariance[np.ix_(idx, idx)]
        metric = GLSMetric(idx.size, covariance=covariance)
        fit = fit_omega_m(
            zhd=np.asarray(columns["zHD"], float)[idx],
            zhel=np.asarray(columns["zHEL"], float)[idx],
            observed=np.asarray(columns["m_b_corr"], float)[idx],
            metric=metric,
            grid=self.omega_grid,
        )
        scan = hard_step_scan(
            z=np.asarray(columns["zHD"], float)[idx],
            residual=fit["residual"],
            metric=metric,
            pivots=self.pivots,
        )
        state = {
            "mask": mask,
            "idx": idx,
            "z": np.asarray(columns["zHD"], float)[idx],
            "zhel": np.asarray(columns["zHEL"], float)[idx],
            "observed": np.asarray(columns["m_b_corr"], float)[idx],
            "survey": np.asarray(columns["IDSURVEY"], int)[idx],
            "host_mass": np.asarray(columns["HOST_LOGMASS"], float)[idx],
            "covariance": covariance,
            "metric": metric,
            "fit": fit,
            "residual": fit["residual"],
            "scan": scan,
        }
        self.memo[key] = state
        return state


def _g0(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    refs = ctx.manifest.get("priority_context", [])
    kinds = {item.get("kind") for item in refs}
    status = "PASS" if {"existing_literature", "established_methods", "project_extension"}.issubset(kinds) else "FAIL"
    return gate_result(
        "G0",
        status,
        metrics={"reference_count": len(refs), "methods_claimed_novel": False},
        evidence={"priority_context": refs},
        note="Existing literature/methods are separated from the project-specific gate orchestration.",
    )


def _g1(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    best = state["fit"]["best"]
    omega = float(best["omega_m"])
    bounds = ctx.manifest["pantheon"]["omega_m_grid"]
    interior = float(bounds["min"]) < omega < float(bounds["max"])
    status = "PASS" if interior and np.isfinite(best["chi2"]) else "FAIL"
    return gate_result(
        "G1",
        status,
        metrics={"n": int(state["idx"].size), "omega_m": omega, "chi2_profiled": float(best["chi2"]), "h0_reported": False},
        evidence={"likelihood_convention": "full STAT+SYS; m_b_corr; zHD/zHEL; intercept profiled"},
        note="SN-only absolute scale is not identified; H0 is deliberately not quoted.",
    )


def _g2(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    condition = condition_number_spd(state["covariance"])
    threshold = float(ctx.manifest["thresholds"]["max_covariance_condition_number"])
    status = "PASS" if np.isfinite(condition) and condition < threshold else "FAIL"
    return gate_result(
        "G2",
        status,
        metrics={"condition_number": float(condition), "threshold": threshold, "dimension": int(state["idx"].size), "cholesky": "PASS"},
        evidence={"covariance_semantics": "full_stat_plus_sys", "diagonal_fallback": False},
    )


def _g3(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    bundle = ctx.pantheon
    primary = pantheon_primary_mask(bundle)
    sensitivity = pantheon_sensitivity_mask(bundle)
    z = np.asarray(bundle.columns["zHD"], float)
    m = np.asarray(bundle.columns["m_b_corr"], float)
    survey = np.asarray(bundle.columns["IDSURVEY"], int)
    finite = bool(np.all(np.isfinite(z[primary])) and np.all(np.isfinite(m[primary])))
    status = "PASS" if bundle.n == 1701 and finite and int(primary.sum()) > 1000 and int(sensitivity.sum()) > 1000 else "FAIL"
    reference = ctx.manifest["reference_manuscript"]
    return gate_result(
        "G3",
        status,
        metrics={
            "rows_total": bundle.n,
            "primary_n": int(primary.sum()),
            "sensitivity_n": int(sensitivity.sum()),
            "primary_reference_n": int(reference["primary"]["n"]),
            "sensitivity_reference_n": int(reference["sensitivity"]["n"]),
            "primary_reference_match": int(primary.sum()) == int(reference["primary"]["n"]),
            "sensitivity_reference_match": int(sensitivity.sum()) == int(reference["sensitivity"]["n"]),
            "survey_families_primary": int(np.unique(survey[primary]).size),
            "finite_primary": finite,
        },
        evidence=ctx.pantheon.receipts,
        note="Reference-count mismatches are reported, not silently patched by undocumented masks.",
    )


def _g4(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    bundle = ctx.pantheon
    primary = ctx.subset_state("primary")
    columns = bundle.columns
    is_cal = np.asarray(columns["IS_CALIBRATOR"], int) == 1
    theory = distance_modulus_flat_lcdm(
        np.maximum(np.asarray(columns["zHD"], float), 1e-5),
        np.maximum(np.asarray(columns["zHEL"], float), 1e-5),
        float(primary["fit"]["best"]["omega_m"]),
    )
    theory[is_cal] = np.asarray(columns["CEPH_DIST"], float)[is_cal]
    residual = np.asarray(columns["m_b_corr"], float) - theory
    metric = GLSMetric(bundle.n, covariance=bundle.covariance)
    scan = hard_step_scan(z=np.asarray(columns["zHD"], float), residual=residual, metric=metric, pivots=ctx.pivots)
    status = "PASS" if np.isfinite(scan["delta_chi2"]) else "FAIL"
    return gate_result(
        "G4",
        status,
        metrics={
            "calibrator_count": int(is_cal.sum()),
            "all_rows_delta_chi2": float(scan["delta_chi2"]),
            "all_rows_best_z": float(scan["best_z"]),
            "primary_delta_chi2": float(primary["scan"]["delta_chi2"]),
            "primary_best_z": float(primary["scan"]["best_z"]),
        },
        note="Calibrators use released Cepheid host distances; non-calibrators use the smooth SN distance relation.",
    )


def _g5(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    bundle = ctx.pantheon
    primary = ctx.subset_state("primary")
    columns = bundle.columns
    omega = float(primary["fit"]["best"]["omega_m"])
    raw_delta = float(primary["scan"]["delta_chi2"])
    raw_pivot = float(primary["scan"]["best_z"])
    rows: list[dict[str, Any]] = []
    for zmin in ctx.manifest["pantheon"]["zmin_sweep"]:
        zmin = float(zmin)
        if abs(zmin - 0.01) < 1e-12:
            scan = primary["scan"]
            n = int(primary["idx"].size)
        else:
            mask = (np.asarray(columns["IS_CALIBRATOR"], int) == 0) & (np.asarray(columns["zHD"], float) > zmin)
            idx = np.flatnonzero(mask)
            cov = bundle.covariance[np.ix_(idx, idx)]
            metric = GLSMetric(idx.size, covariance=cov)
            residual = np.asarray(columns["m_b_corr"], float)[idx] - distance_modulus_flat_lcdm(
                np.asarray(columns["zHD"], float)[idx], np.asarray(columns["zHEL"], float)[idx], omega
            )
            scan = hard_step_scan(z=np.asarray(columns["zHD"], float)[idx], residual=residual, metric=metric, pivots=ctx.pivots)
            n = int(idx.size)
        rows.append({"z_min": zmin, "n": n, "best_z": float(scan["best_z"]), "delta_chi2": float(scan["delta_chi2"])})
    target = min(rows, key=lambda row: abs(row["z_min"] - 0.10))
    fraction = float(target["delta_chi2"] / raw_delta) if raw_delta > 0 else 0.0
    shift = abs(float(target["best_z"]) - raw_pivot)
    thresholds = ctx.manifest["thresholds"]
    survives = fraction >= float(thresholds["zmin_010_min_delta_fraction"]) and shift <= float(thresholds["zmin_010_max_pivot_shift"])
    return gate_result(
        "G5",
        "PASS" if survives else "FAIL",
        metrics={"sweep": rows, "zmin_010_delta_fraction": fraction, "zmin_010_pivot_shift": shift, "survives_low_z_excision": survives},
    )


def _g6(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    primary = ctx.subset_state("primary")
    sensitivity = ctx.subset_state("sensitivity")
    scan = primary["scan"]
    reference = ctx.manifest["reference_manuscript"]
    status = "PASS" if np.isfinite(scan["delta_chi2"]) and float(scan["delta_chi2"]) > 0.0 else "FAIL"
    return gate_result(
        "G6",
        status,
        metrics={
            "n": int(primary["idx"].size),
            "best_z": float(scan["best_z"]),
            "delta_chi2": float(scan["delta_chi2"]),
            "step_amplitude_mag": float(scan["amplitude"]),
            "sensitivity_n": int(sensitivity["idx"].size),
            "sensitivity_best_z": float(sensitivity["scan"]["best_z"]),
            "sensitivity_delta_chi2": float(sensitivity["scan"]["delta_chi2"]),
            "reference_primary_delta_difference": float(scan["delta_chi2"] - reference["primary"]["delta_chi2"]),
            "historical_value_used_as_target": False,
        },
    )


def _g7(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    scan = ctx.subset_state("primary")["scan"]
    values = scan["scan"]
    best = float(scan["best_z"])
    maximum = float(scan["delta_chi2"])
    near = [row["z"] for row in values if float(row["delta_chi2"]) >= maximum - 1.0]
    near_width = float(max(near) - min(near)) if near else float("nan")
    spec = ctx.manifest["pantheon"]["scan"]
    margin = float(ctx.manifest["thresholds"]["scan_boundary_margin"])
    interior = float(spec["z_min"]) + margin <= best <= float(spec["z_max"]) - margin
    return gate_result(
        "G7",
        "PASS" if interior else "FAIL",
        metrics={"best_z": best, "delta_chi2": maximum, "delta_chi2_minus1_width": near_width, "interior_maximum": interior, "scan": values},
    )


def _g8(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = state["scan"]["projection"]
    maxima = gaussian_scan_maxima(projection, mocks=ctx.mocks, rng=ctx.rng("G8"))
    p_global = scan_null_pvalue(observed=float(state["scan"]["delta_chi2"]), maxima=maxima)
    alpha = float(ctx.manifest["thresholds"]["global_alpha"])
    return gate_result(
        "G8",
        "PASS" if p_global < alpha else "FAIL",
        metrics={"p_global": p_global, "alpha": alpha, "mocks": ctx.mocks, "null_q95": float(np.quantile(maxima, 0.95))},
        note="Gaussian look-elsewhere calibration is performed in the covariance of the projected scan statistics.",
    )


def _g9(ctx: BatteryContext, results: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = gaussian_bump_projection(
        state["z"], metric=state["metric"], centers=ctx.pivots, widths=ctx.manifest["pantheon"]["gaussian_bump_widths"]
    )
    observed = template_scan(projection, state["residual"])
    maxima = gaussian_scan_maxima(projection, mocks=ctx.mocks, rng=ctx.rng("G9"))
    p_bump = scan_null_pvalue(observed=observed["delta_chi2"], maxima=maxima)
    if "G8" in results:
        p_hard = float(results["G8"]["metrics"]["p_global"])
    else:
        hard_projection = state["scan"]["projection"]
        hard_maxima = gaussian_scan_maxima(hard_projection, mocks=ctx.mocks, rng=ctx.rng("G9", 1))
        p_hard = scan_null_pvalue(observed=float(state["scan"]["delta_chi2"]), maxima=hard_maxima)
    alpha = float(ctx.manifest["thresholds"]["global_alpha"])
    consistent = (p_hard < alpha) == (p_bump < alpha)
    return gate_result(
        "G9",
        "PASS" if consistent else "FAIL",
        metrics={
            "hard_step_p_global": p_hard,
            "gaussian_bump_p_global": p_bump,
            "gaussian_bump_delta_chi2": float(observed["delta_chi2"]),
            "gaussian_bump_best": observed["metadata"],
            "decisive_story_consistent": consistent,
        },
    )


def _g10(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    fit = state["fit"]
    best_chi2 = float(fit["best"]["chi2"])
    rows: list[dict[str, Any]] = []
    for background in fit["grid"]:
        if float(background["chi2"]) > best_chi2 + 1.0:
            continue
        omega = float(background["omega_m"])
        residual = state["observed"] - distance_modulus_flat_lcdm(state["z"], state["zhel"], omega)
        evaluated = state["scan"]["projection"].evaluate(residual)
        rows.append({"omega_m": omega, "background_delta_chi2": float(background["chi2"] - best_chi2), "best_z": float(evaluated["metadata"]["z"]), "step_delta_chi2": float(evaluated["delta_chi2"])})
    pivot_range = float(max(row["best_z"] for row in rows) - min(row["best_z"] for row in rows)) if rows else float("inf")
    threshold = float(ctx.manifest["thresholds"]["cosmology_max_pivot_range"])
    return gate_result("G10", "PASS" if pivot_range <= threshold else "FAIL", metrics={"profile_rows": rows, "pivot_range": pivot_range, "threshold": threshold})


def _g11(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    nuisance = survey_nuisance_design(survey=state["survey"], z=state["z"], host_logmass=state["host_mass"])
    scan = hard_step_scan(z=state["z"], residual=state["residual"], metric=state["metric"], pivots=ctx.pivots, nuisance=nuisance)
    raw = float(state["scan"]["delta_chi2"])
    fraction = float(scan["delta_chi2"] / raw) if raw > 0 else 0.0
    threshold = float(ctx.manifest["thresholds"]["nuisance_min_delta_fraction"])
    survives = fraction >= threshold
    return gate_result(
        "G11",
        "PASS" if survives else "FAIL",
        metrics={"nuisance_columns": int(nuisance.shape[1]), "delta_chi2": float(scan["delta_chi2"]), "best_z": float(scan["best_z"]), "raw_delta_chi2": raw, "delta_fraction": fraction, "survives_nuisance": survives},
    )


def _g12(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = state["scan"]["projection"]
    observed = float(state["scan"]["delta_chi2"])
    rows: dict[str, float] = {}
    for salt, mode in enumerate(["redshift_shuffle", "intra_survey_shuffle"], start=1):
        maxima = structured_permutation_maxima(
            projection,
            residual=state["residual"],
            z=state["z"],
            survey=state["survey"],
            mocks=ctx.mocks,
            rng=ctx.rng("G12", salt),
            mode=mode,
        )
        rows[mode] = scan_null_pvalue(observed=observed, maxima=maxima)
    for salt, width in enumerate(ctx.manifest["pantheon"]["block_widths"], start=10):
        maxima = structured_permutation_maxima(
            projection,
            residual=state["residual"],
            z=state["z"],
            survey=state["survey"],
            mocks=ctx.mocks,
            rng=ctx.rng("G12", salt),
            mode="survey_redshift_block",
            block_width=float(width),
        )
        rows[f"survey_redshift_block_{float(width):.3f}"] = scan_null_pvalue(observed=observed, maxima=maxima)
    max_p = float(max(rows.values()))
    alpha = float(ctx.manifest["thresholds"]["global_alpha"])
    return gate_result("G12", "PASS" if max_p < alpha else "FAIL", metrics={"p_values": rows, "max_structured_p": max_p, "alpha": alpha, "mocks_per_null": ctx.mocks})


def _g13(ctx: BatteryContext, results: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    bundle = ctx.pantheon
    omega = float(state["fit"]["best"]["omega_m"])
    raw = float(state["scan"]["delta_chi2"])
    surveys, counts = np.unique(state["survey"], return_counts=True)
    order = np.argsort(counts)[::-1][:6]
    rows: list[dict[str, Any]] = []
    primary_mask = pantheon_primary_mask(bundle)
    for value in surveys[order]:
        mask = primary_mask & (np.asarray(bundle.columns["IDSURVEY"], int) != int(value))
        idx = np.flatnonzero(mask)
        cov = bundle.covariance[np.ix_(idx, idx)]
        metric = GLSMetric(idx.size, covariance=cov)
        z = np.asarray(bundle.columns["zHD"], float)[idx]
        residual = np.asarray(bundle.columns["m_b_corr"], float)[idx] - distance_modulus_flat_lcdm(z, np.asarray(bundle.columns["zHEL"], float)[idx], omega)
        scan = hard_step_scan(z=z, residual=residual, metric=metric, pivots=ctx.pivots)
        rows.append({"excluded_survey": int(value), "n": int(idx.size), "best_z": float(scan["best_z"]), "delta_chi2": float(scan["delta_chi2"])})
    minimum = min((row["delta_chi2"] for row in rows), default=raw)
    max_drop_fraction = float(max(0.0, raw - minimum) / raw) if raw > 0 else 1.0
    if "G11" in results:
        nuisance_fraction = float(results["G11"]["metrics"].get("delta_fraction", 0.0))
    else:
        nuisance = survey_nuisance_design(survey=state["survey"], z=state["z"], host_logmass=state["host_mass"])
        nuisance_scan = hard_step_scan(z=state["z"], residual=state["residual"], metric=state["metric"], pivots=ctx.pivots, nuisance=nuisance)
        nuisance_fraction = float(nuisance_scan["delta_chi2"] / raw) if raw > 0 else 0.0
    threshold_drop = float(ctx.manifest["thresholds"]["survey_max_leave_one_out_drop_fraction"])
    threshold_nuisance = float(ctx.manifest["thresholds"]["nuisance_min_delta_fraction"])
    robust = max_drop_fraction <= threshold_drop and nuisance_fraction >= threshold_nuisance
    return gate_result("G13", "PASS" if robust else "FAIL", metrics={"leave_one_survey_out": rows, "max_drop_fraction": max_drop_fraction, "nuisance_delta_fraction": nuisance_fraction, "robust_to_survey_attribution": robust})


def _g14(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    pivots = pivot_draws(state["scan"]["projection"], state["scan"]["scores"], mocks=ctx.mocks, rng=ctx.rng("G14"))
    p16, p84 = np.quantile(pivots, [0.16, 0.84])
    width = float(p84 - p16)
    nominal = float(state["scan"]["best_z"])
    halfwidth = float(ctx.manifest["thresholds"]["pivot_localization_halfwidth"])
    fraction = float(np.mean(np.abs(pivots - nominal) <= halfwidth))
    thresholds = ctx.manifest["thresholds"]
    stable = width <= float(thresholds["max_pivot_p16_p84_width"]) and fraction >= float(thresholds["minimum_localization_fraction"])
    return gate_result("G14", "PASS" if stable else "FAIL", metrics={"p16": float(p16), "p84": float(p84), "p16_p84_width": width, "nominal_z": nominal, "localization_halfwidth": halfwidth, "localization_fraction": fraction, "stable": stable, "mocks": ctx.mocks})


def _g15(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = state["scan"]["projection"]
    halfwidth = float(ctx.manifest["thresholds"]["pivot_localization_halfwidth"])
    rows: list[dict[str, Any]] = []
    reference_amp = float(ctx.manifest["reference_manuscript"]["primary"]["step_amplitude_mag"])
    reference_pivot = float(ctx.manifest["reference_manuscript"]["primary"]["z_t"])
    observed_level_recovery = 0.0
    for ai, amplitude in enumerate(ctx.manifest["pantheon"]["injection_amplitudes_mag"]):
        for pi, pivot in enumerate(ctx.manifest["pantheon"]["injection_pivots"]):
            injection = float(amplitude) * (state["z"] > float(pivot)).astype(float)
            mean_scores = projection.q @ injection
            draws = gaussian_score_draws(projection, mocks=ctx.mocks, rng=ctx.rng("G15", 10 * ai + pi + 1), mean_scores=mean_scores)
            indices = np.argmax(draws**2, axis=1)
            recovered = np.asarray([float(projection.metadata[index]["z"]) for index in indices])
            localization = float(np.mean(np.abs(recovered - float(pivot)) <= halfwidth))
            row = {"amplitude_mag": float(amplitude), "pivot": float(pivot), "localization_fraction": localization}
            rows.append(row)
            if abs(float(amplitude) - reference_amp) < 1e-8 and abs(float(pivot) - reference_pivot) < 1e-8:
                observed_level_recovery = localization
    threshold = float(ctx.manifest["thresholds"]["minimum_injection_recovery_fraction"])
    adequate = observed_level_recovery >= threshold
    return gate_result("G15", "PASS" if adequate else "FAIL", metrics={"recovery": rows, "observed_level_recovery_fraction": observed_level_recovery, "recovery_fraction": observed_level_recovery, "threshold": threshold, "adequate_power_at_observed_level": adequate})


def _g16(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = state["scan"]["projection"]
    observed = float(state["scan"]["delta_chi2"])
    offset = float(ctx.manifest["pantheon"]["survey_false_positive_offset_mag"])
    surveys, counts = np.unique(state["survey"], return_counts=True)
    selected = surveys[np.argsort(counts)[::-1][: min(8, len(surveys))]]
    mean_vectors: list[np.ndarray] = []
    labels: list[tuple[int, int]] = []
    for survey in selected:
        mask = (state["survey"] == survey).astype(float)
        for sign in (-1, 1):
            mean_vectors.append(projection.q @ (sign * offset * mask))
            labels.append((int(survey), int(sign)))
    rng = ctx.rng("G16")
    noise = gaussian_score_draws(projection, mocks=ctx.mocks, rng=rng)
    choice = rng.integers(0, len(mean_vectors), size=ctx.mocks)
    shifted = noise.copy()
    for row, index in enumerate(choice):
        shifted[row] += mean_vectors[int(index)]
    maxima = np.max(shifted**2, axis=1)
    fpr = scan_null_pvalue(observed=observed, maxima=maxima)
    threshold = float(ctx.manifest["thresholds"]["max_survey_false_positive_rate"])
    robust = fpr < threshold
    return gate_result("G16", "PASS" if robust else "FAIL", metrics={"offset_mag": offset, "survey_families": [int(v) for v in selected], "false_positive_rate": fpr, "threshold": threshold, "robust_to_survey_offsets": robust, "mocks": ctx.mocks})


def _g17(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    bundle = ctx.des
    mask = np.asarray(bundle.columns["zHD"], float) > 0.0
    idx = np.flatnonzero(mask)
    precision = bundle.precision[np.ix_(idx, idx)]
    metric = GLSMetric(idx.size, precision=precision)
    z = np.asarray(bundle.columns["zHD"], float)[idx]
    zhel = np.asarray(bundle.columns["zHEL"], float)[idx]
    observed = np.asarray(bundle.columns["MU"], float)[idx]
    fit = fit_omega_m(zhd=z, zhel=zhel, observed=observed, metric=metric, grid=ctx.omega_grid)
    scan = hard_step_scan(z=z, residual=fit["residual"], metric=metric, pivots=ctx.pivots)
    maxima = gaussian_scan_maxima(scan["projection"], mocks=ctx.mocks, rng=ctx.rng("G17"))
    p_global = scan_null_pvalue(observed=float(scan["delta_chi2"]), maxima=maxima)
    primary_z = float(ctx.subset_state("primary")["scan"]["best_z"])
    shift = abs(float(scan["best_z"]) - primary_z)
    thresholds = ctx.manifest["thresholds"]
    consistent = shift <= float(thresholds["des_replication_max_pivot_shift"]) and p_global < float(thresholds["des_replication_global_alpha"])
    return gate_result(
        "G17",
        "PASS" if consistent else "FAIL",
        metrics={"n": int(idx.size), "omega_m": float(fit["best"]["omega_m"]), "best_z": float(scan["best_z"]), "delta_chi2": float(scan["delta_chi2"]), "p_global": p_global, "pantheon_pivot_shift": shift, "consistent_replication": consistent},
        evidence=bundle.receipts,
        note="The DES release precision matrix is consumed as an inverse covariance, exactly as documented by the public likelihood.",
    )


def _g18(_: BatteryContext, __: dict[str, Any]) -> dict[str, Any]:
    return gate_result(
        "G18",
        "OPEN",
        metrics={"independent_context": False, "fresh_2mrs_or_voidfinder_crossmatch": False},
        note="No fresh independent density-tracer cross-match is implemented here. The battery therefore refuses to infer a physical cause from SN-only structure.",
    )


_GATE_FUNCTIONS: dict[str, Callable[[BatteryContext, dict[str, Any]], dict[str, Any]]] = {
    "G0": _g0,
    "G1": _g1,
    "G2": _g2,
    "G3": _g3,
    "G4": _g4,
    "G5": _g5,
    "G6": _g6,
    "G7": _g7,
    "G8": _g8,
    "G9": _g9,
    "G10": _g10,
    "G11": _g11,
    "G12": _g12,
    "G13": _g13,
    "G14": _g14,
    "G15": _g15,
    "G16": _g16,
    "G17": _g17,
    "G18": _g18,
}


def run_gate(gate_id: str, ctx: BatteryContext, results: dict[str, Any]) -> dict[str, Any]:
    if gate_id == "G19":
        closure = close_claim(results, ctx.manifest)
        return gate_result("G19", "PASS" if closure["classification"] != "BLOCKED_INTEGRITY" else "BLOCKED", metrics=closure)
    function = _GATE_FUNCTIONS.get(gate_id)
    if function is None:
        raise ValueError(f"UNKNOWN_GATE:{gate_id}")
    return function(ctx, results)


def run_battery(
    manifest: dict[str, Any],
    *,
    cache_dir: str | Path,
    mocks: int,
    seed: int,
    gates: list[str] | None = None,
) -> dict[str, Any]:
    selected = gates or [f"G{i}" for i in range(20)]
    selected = sorted(selected, key=lambda gate: int(gate[1:]))
    ctx = BatteryContext(manifest=manifest, cache_dir=Path(cache_dir), mocks=int(mocks), seed=int(seed))
    results: dict[str, Any] = {}
    for gate_id in selected:
        if gate_id not in {f"G{i}" for i in range(20)}:
            raise ValueError(f"UNKNOWN_GATE:{gate_id}")
        if int(gate_id[1:]) > 3 and gate_id != "G19" and any(results.get(g, {}).get("status") in {"FAIL", "BLOCKED"} for g in ["G1", "G2", "G3"] if g in results):
            results[gate_id] = gate_result(gate_id, "BLOCKED", note="Skipped after an integrity gate failed in this run.")
            continue
        try:
            results[gate_id] = run_gate(gate_id, ctx, results)
        except Exception as exc:  # noqa: BLE001 - every gate must persist a bounded failure receipt
            results[gate_id] = gate_result(gate_id, "BLOCKED", evidence={"error_type": type(exc).__name__, "error": str(exc)})
    provenance: dict[str, Any] = {"seed": int(seed), "mocks": int(mocks), "cache_dir": str(cache_dir)}
    if ctx._pantheon is not None:
        provenance["pantheon_plus"] = ctx._pantheon.receipts
    if ctx._des is not None:
        provenance["des_sn5yr"] = ctx._des.receipts
    return {"battery_id": manifest["battery_id"], "schema_version": manifest["schema_version"], "gates": results, "provenance": provenance}
