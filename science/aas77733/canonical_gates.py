from __future__ import annotations

from typing import Any

import numpy as np

from . import gates as base
from .gates import BatteryContext, gate_result
from .stats import gaussian_score_draws


def _g6_canonical(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    primary = ctx.subset_state("primary")
    sensitivity = ctx.subset_state("sensitivity")
    scan = primary["scan"]
    manuscript = ctx.manifest["reference_manuscript"]
    primary_reported = manuscript["primary"]
    sensitivity_reported = manuscript["sensitivity"]
    status = "PASS" if np.isfinite(scan["delta_chi2"]) and float(scan["delta_chi2"]) > 0.0 else "FAIL"
    return gate_result(
        "G6",
        status,
        metrics={
            "n": int(primary["idx"].size),
            "background_omega_m": float(primary["fit"]["best"]["omega_m"]),
            "reference_convention": "official_zHD_zHEL_continuous_flat_LCDM_profile",
            "best_z": float(scan["best_z"]),
            "delta_chi2": float(scan["delta_chi2"]),
            "step_amplitude_mag": float(scan["amplitude"]),
            "sensitivity_n": int(sensitivity["idx"].size),
            "sensitivity_background_omega_m": float(sensitivity["fit"]["best"]["omega_m"]),
            "sensitivity_best_z": float(sensitivity["scan"]["best_z"]),
            "sensitivity_delta_chi2": float(sensitivity["scan"]["delta_chi2"]),
            "reported_manuscript_primary": primary_reported,
            "reported_manuscript_sensitivity": sensitivity_reported,
            "primary_vs_reported": {
                "pivot_shift": float(scan["best_z"] - primary_reported["z_t"]),
                "delta_chi2_difference": float(scan["delta_chi2"] - primary_reported["delta_chi2"]),
                "amplitude_difference_mag": float(scan["amplitude"] - primary_reported["step_amplitude_mag"]),
            },
            "sensitivity_vs_reported": {
                "pivot_shift": float(sensitivity["scan"]["best_z"] - sensitivity_reported["z_t"]),
                "delta_chi2_difference": float(sensitivity["scan"]["delta_chi2"] - sensitivity_reported["delta_chi2"]),
            },
            "manuscript_values_used_as_target": False,
        },
        note=(
            "The manuscript table is retained as provenance only. The canonical result is recomputed from the "
            "pinned public release with the official zHD/zHEL convention and a continuously profiled flat-LCDM background."
        ),
    )


def _localization_fraction(
    *,
    projection,
    state: dict[str, Any],
    amplitude: float,
    pivot: float,
    mocks: int,
    rng: np.random.Generator,
    halfwidth: float,
) -> float:
    injection = float(amplitude) * (state["z"] > float(pivot)).astype(float)
    mean_scores = projection.q @ injection
    draws = gaussian_score_draws(projection, mocks=mocks, rng=rng, mean_scores=mean_scores)
    indices = np.argmax(draws**2, axis=1)
    recovered = np.asarray([float(projection.metadata[index]["z"]) for index in indices])
    return float(np.mean(np.abs(recovered - float(pivot)) <= halfwidth))


def _g15_canonical(ctx: BatteryContext, _: dict[str, Any]) -> dict[str, Any]:
    state = ctx.subset_state("primary")
    projection = state["scan"]["projection"]
    halfwidth = float(ctx.manifest["thresholds"]["pivot_localization_halfwidth"])

    observed_amplitude = float(state["scan"]["amplitude"])
    observed_pivot = float(state["scan"]["best_z"])
    observed_level_recovery = _localization_fraction(
        projection=projection,
        state=state,
        amplitude=observed_amplitude,
        pivot=observed_pivot,
        mocks=ctx.mocks,
        rng=ctx.rng("G15", 999),
        halfwidth=halfwidth,
    )

    rows: list[dict[str, Any]] = []
    for ai, amplitude in enumerate(ctx.manifest["pantheon"]["injection_amplitudes_mag"]):
        for pi, pivot in enumerate(ctx.manifest["pantheon"]["injection_pivots"]):
            localization = _localization_fraction(
                projection=projection,
                state=state,
                amplitude=float(amplitude),
                pivot=float(pivot),
                mocks=ctx.mocks,
                rng=ctx.rng("G15", 10 * ai + pi + 1),
                halfwidth=halfwidth,
            )
            rows.append(
                {
                    "amplitude_mag": float(amplitude),
                    "pivot": float(pivot),
                    "localization_fraction": localization,
                    "role": "predeclared_power_grid",
                }
            )

    threshold = float(ctx.manifest["thresholds"]["minimum_injection_recovery_fraction"])
    adequate = observed_level_recovery >= threshold
    return gate_result(
        "G15",
        "PASS" if adequate else "FAIL",
        metrics={
            "canonical_observed_injection": {
                "amplitude_mag": observed_amplitude,
                "pivot": observed_pivot,
                "localization_fraction": observed_level_recovery,
                "mocks": int(ctx.mocks),
                "localization_halfwidth": halfwidth,
            },
            "recovery": rows,
            "observed_level_recovery_fraction": observed_level_recovery,
            "recovery_fraction": observed_level_recovery,
            "threshold": threshold,
            "adequate_power_at_observed_level": adequate,
            "manuscript_injection_used_as_observed_target": False,
        },
        note="Observed-level injection is defined by the freshly recomputed canonical G6 amplitude and pivot, not by the historical manuscript table.",
    )


# Explicit canonical overrides. The underlying registry remains the single G0-G19 orchestrator;
# these two gates replace historical-table coupling with fresh-run quantities.
base._GATE_FUNCTIONS["G6"] = _g6_canonical
base._GATE_FUNCTIONS["G15"] = _g15_canonical


def run_battery(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return base.run_battery(*args, **kwargs)


def close_claim(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return base.close_claim(*args, **kwargs)
