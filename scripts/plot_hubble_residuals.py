#!/usr/bin/env python3
"""Descriptive Pantheon+ Hubble-residual figure for AAS77733-R1.

This script is intentionally separate from the inferential pipeline. It uses the
released diagonal uncertainty column only for plotting binned means/error bars,
consistent with the Pantheon+ DataRelease documentation. The paper's inference
uses the full covariance matrix.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.integrate import quad

OMEGA_M = 0.327697
Z_MIN = 0.0233
EDGES = np.array([
    0.0233, 0.04, 0.06, 0.08, 0.10, 0.13, 0.16, 0.20, 0.25,
    0.30, 0.34, 0.36, 0.38, 0.40, 0.43, 0.46, 0.50, 0.60,
])

def e_z(z: float) -> float:
    return np.sqrt(OMEGA_M * (1.0 + z) ** 3 + (1.0 - OMEGA_M))

def mu_shape(z_hd: float, z_hel: float) -> float:
    # The absolute H0/M scale is absorbed by the fitted additive intercept.
    integral = quad(lambda zz: 1.0 / e_z(zz), 0.0, z_hd, epsabs=1e-10, epsrel=1e-10)[0]
    d_l_shape = (1.0 + z_hel) * integral
    return 5.0 * np.log10(d_l_shape)

def build_bins(data: pd.DataFrame):
    use = data[(data["IS_CALIBRATOR"] == 0) & (data["zHD"] > Z_MIN)].copy()
    use["mu_shape"] = [mu_shape(z, zh) for z, zh in zip(use["zHD"], use["zHEL"])]
    use["raw_resid"] = use["m_b_corr"] - use["mu_shape"]
    w = 1.0 / np.square(use["m_b_corr_err_DIAG"].to_numpy())
    intercept = np.sum(w * use["raw_resid"].to_numpy()) / np.sum(w)
    use["resid"] = use["raw_resid"] - intercept

    rows = []
    for lo, hi in zip(EDGES[:-1], EDGES[1:]):
        b = use[(use["zHD"] >= lo) & (use["zHD"] < hi)]
        if b.empty:
            continue
        wb = 1.0 / np.square(b["m_b_corr_err_DIAG"].to_numpy())
        mean = np.sum(wb * b["resid"].to_numpy()) / np.sum(wb)
        err = np.sqrt(1.0 / np.sum(wb))
        rows.append({
            "z_low": lo,
            "z_high": hi,
            "z_mean": b["zHD"].mean(),
            "residual_mean_mag": mean,
            "plot_error_mag": err,
            "n_rows": len(b),
        })
    return pd.DataFrame(rows), use

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--png", required=True, type=Path)
    ap.add_argument("--csv", required=True, type=Path)
    args = ap.parse_args()

    data = pd.read_csv(args.data, sep=r"\s+")
    bins, use = build_bins(data)
    bins.to_csv(args.csv, index=False)

    fig, ax = plt.subplots(figsize=(7.2, 3.9))
    ax.scatter(use["zHD"], use["resid"], s=7, alpha=0.10, linewidths=0)
    ax.errorbar(
        bins["z_mean"], bins["residual_mean_mag"], yerr=bins["plot_error_mag"],
        fmt="o", capsize=2, markersize=4,
    )
    ax.axhline(0.0, linewidth=1)
    ax.axvline(0.36, linestyle="--", linewidth=1)
    ax.axvspan(0.34, 0.45, alpha=0.08)
    ax.set_xlim(0.02, 0.60)
    ax.set_ylim(-0.40, 0.40)
    ax.set_xlabel(r"$z_{\rm HD}$")
    ax.set_ylabel("Hubble residual [mag]")
    ax.set_title("Pantheon+ residuals around the historical candidate")
    ax.text(0.365, 0.32, r"historical $z_t=0.36$", fontsize=8)
    ax.text(
        0.025, -0.36,
        "Descriptive visualization; inferential tests use the full covariance.",
        fontsize=8,
    )
    fig.tight_layout()
    fig.savefig(args.png, dpi=220)

if __name__ == "__main__":
    main()
