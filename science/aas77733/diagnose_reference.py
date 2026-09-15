from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar

if __package__ in {None, ""}:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from science.aas77733.config import load_manifest
    from science.aas77733.data import load_pantheon, pantheon_primary_mask, pantheon_sensitivity_mask
    from science.aas77733.stats import GLSMetric, distance_modulus_flat_lcdm, hard_step_scan
else:
    from .config import load_manifest
    from .data import load_pantheon, pantheon_primary_mask, pantheon_sensitivity_mask
    from .stats import GLSMetric, distance_modulus_flat_lcdm, hard_step_scan


def evaluate_subset(bundle, mask, pivots, *, use_heliocentric_factor: bool):
    idx = np.flatnonzero(mask)
    zhd = np.asarray(bundle.columns["zHD"], float)[idx]
    zhel_native = np.asarray(bundle.columns["zHEL"], float)[idx]
    zhel = zhel_native if use_heliocentric_factor else zhd
    observed = np.asarray(bundle.columns["m_b_corr"], float)[idx]
    covariance = bundle.covariance[np.ix_(idx, idx)]
    metric = GLSMetric(idx.size, covariance=covariance)

    def objective(omega_m: float) -> float:
        residual = observed - distance_modulus_flat_lcdm(zhd, zhel, float(omega_m))
        _, chi2 = metric.profile(residual, np.ones((idx.size, 1)))
        return chi2

    fit = minimize_scalar(objective, bounds=(0.15, 0.50), method="bounded", options={"xatol": 1e-10})
    omega_m = float(fit.x)
    residual = observed - distance_modulus_flat_lcdm(zhd, zhel, omega_m)
    scan = hard_step_scan(z=zhd, residual=residual, metric=metric, pivots=pivots)
    return {
        "n": int(idx.size),
        "omega_m": omega_m,
        "chi2": float(fit.fun),
        "best_z": float(scan["best_z"]),
        "delta_chi2": float(scan["delta_chi2"]),
        "step_amplitude_mag": float(scan["amplitude"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", default=".cache/aas77733")
    parser.add_argument("--output", default="artifacts/reference-convention-diagnostic.json")
    args = parser.parse_args()

    manifest = load_manifest()
    bundle = load_pantheon(args.cache_dir)
    scan = manifest["pantheon"]["scan"]
    pivots = np.round(np.arange(scan["z_min"], scan["z_max"] + scan["z_step"] / 2.0, scan["z_step"]), 10)
    masks = {
        "primary": pantheon_primary_mask(bundle),
        "sensitivity": pantheon_sensitivity_mask(bundle),
    }
    result = {
        "official_zHD_zHEL": {
            name: evaluate_subset(bundle, mask, pivots, use_heliocentric_factor=True)
            for name, mask in masks.items()
        },
        "legacy_zHD_only": {
            name: evaluate_subset(bundle, mask, pivots, use_heliocentric_factor=False)
            for name, mask in masks.items()
        },
        "manuscript_reference": manifest["reference_manuscript"],
        "interpretation": {
            "official_zHD_zHEL": "Pantheon+ public likelihood convention: integrate at zHD and apply luminosity factor with zHEL.",
            "legacy_zHD_only": "Historical simplified pipeline convention: use zHD for both the integration redshift and luminosity factor. Diagnostic only.",
        },
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
