from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from science.aas77733.data import DESBundle, PantheonBundle, load_des5yr, load_pantheon
from science.aas77733.stats import distance_modulus_flat_lcdm, fit_omega_m
from . import settings
from .stats import GLSMetric, blind_pivots, hard_step_scan


@dataclass
class Context:
    cache_dir: Path
    mocks: int
    seed: int
    _pantheon: PantheonBundle | None = None
    _des: DESBundle | None = None
    memo: dict[str, Any] = field(default_factory=dict)

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

    def rng(self, gate: str, salt: int = 0) -> np.random.Generator:
        n = int(gate[1:]) if gate.startswith("G") else 0
        return np.random.default_rng(int(self.seed) + 1009 * n + 7919 * int(salt))

    @property
    def omega_grid(self) -> np.ndarray:
        s = settings.OMEGA_GRID
        return np.arange(s["min"], s["max"] + s["step"] / 2.0, s["step"])

    def mask(self, branch: str, zmin: float = 0.01) -> np.ndarray:
        c = self.pantheon.columns
        z = np.asarray(c["zHD"], float)
        cal = np.asarray(c["IS_CALIBRATOR"], int) == 1
        if branch == "official_all":
            return z > float(zmin)
        if branch == "calibrator_only":
            return cal
        if branch == "non_calibrator":
            return (~cal) & (z > float(zmin))
        raise ValueError(f"UNKNOWN_BRANCH:{branch}")

    def state(self, branch: str = "non_calibrator", zmin: float = 0.01, *, extra_diag: bool = False) -> dict[str, Any]:
        key = f"state:{branch}:{zmin:.5f}:{int(extra_diag)}"
        if key in self.memo:
            return self.memo[key]
        b = self.pantheon
        idx = np.flatnonzero(self.mask(branch, zmin))
        c = b.columns
        z = np.asarray(c["zHD"], float)[idx]
        zhel = np.asarray(c["zHEL"], float)[idx]
        observed = np.asarray(c["m_b_corr"], float)[idx]
        cov = b.covariance[np.ix_(idx, idx)].copy()
        if extra_diag:
            err = np.asarray(c["m_b_corr_err_DIAG"], float)[idx]
            cov += np.diag(err * err)
        metric = GLSMetric(idx.size, covariance=cov)
        fit = fit_omega_m(zhd=z, zhel=zhel, observed=observed, metric=metric, grid=self.omega_grid)
        profiled_residual = np.asarray(fit["residual"], float) - float(fit["best"]["intercept"])
        pivots = blind_pivots(z, **settings.BLIND_SCAN)
        scan = hard_step_scan(z=z, residual=profiled_residual, metric=metric, pivots=pivots)
        state = {
            "idx": idx, "z": z, "zhel": zhel, "observed": observed, "covariance": cov, "metric": metric,
            "fit": fit, "residual": profiled_residual, "pivots": pivots, "scan": scan,
            "survey": np.asarray(c["IDSURVEY"], int)[idx],
            "host_mass": np.asarray(c["HOST_LOGMASS"], float)[idx],
            "vpecerr": np.asarray(c["VPECERR"], float)[idx],
            "zcmb": np.asarray(c["zCMB"], float)[idx],
        }
        self.memo[key] = state
        return state

    def calibrator_state(self) -> dict[str, Any]:
        key = "calibrator_state"
        if key in self.memo:
            return self.memo[key]
        b = self.pantheon; c = b.columns
        idx = np.flatnonzero(np.asarray(c["IS_CALIBRATOR"], int) == 1)
        cov = b.covariance[np.ix_(idx, idx)]
        metric = GLSMetric(idx.size, covariance=cov)
        residual = np.asarray(c["m_b_corr"], float)[idx] - np.asarray(c["CEPH_DIST"], float)[idx]
        beta, chi2 = metric.profile(residual, np.ones((idx.size, 1)))
        result = {"n": int(idx.size), "intercept": float(beta[0]), "chi2": float(chi2), "residual_rms": float(np.std(residual - beta[0]))}
        self.memo[key] = result
        return result


def theory_residual(state: dict[str, Any], omega_m: float) -> np.ndarray:
    return state["observed"] - distance_modulus_flat_lcdm(state["z"], state["zhel"], float(omega_m))
