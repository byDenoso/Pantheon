from __future__ import annotations

import numpy as np
from scipy.linalg import solve_triangular

from science.aas77733.stats import (
    GLSMetric,
    build_projection,
    gaussian_bump_projection,
    gaussian_scan_maxima,
    gaussian_score_draws,
    hard_step_projection,
    hard_step_scan,
    pivot_draws,
    scan_null_pvalue,
    template_scan,
)


def adaptive_mock_target(p_value: float, *, base: int = 10000, tail_trigger: float = 0.01, tail: int = 100000) -> int:
    return int(tail if float(p_value) < float(tail_trigger) else base)


def blind_pivots(z: np.ndarray, *, min_side_count: int = 100, z_step: float = 0.01, min_z: float = 0.01, max_z: float = 1.50) -> np.ndarray:
    z = np.asarray(z, float)
    candidates = np.arange(float(min_z), float(max_z) + z_step / 2.0, float(z_step))
    valid = [p for p in candidates if np.count_nonzero(z <= p) >= min_side_count and np.count_nonzero(z > p) >= min_side_count]
    if not valid:
        raise ValueError("NO_BLIND_PIVOTS_WITH_REQUIRED_SUPPORT")
    return np.round(np.asarray(valid), 10)


def tanh_projection(z: np.ndarray, *, metric: GLSMetric, pivots: np.ndarray, widths: list[float], nuisance: np.ndarray | None = None):
    z = np.asarray(z, float)
    cols = []
    meta = []
    for width in widths:
        for pivot in pivots:
            cols.append(0.5 * (1.0 + np.tanh((z - float(pivot)) / float(width))))
            meta.append({"kind": "tanh_step", "z": float(pivot), "width": float(width)})
    return build_projection(np.column_stack(cols), metric, nuisance=nuisance, metadata=meta)


def piecewise_linear_projection(z: np.ndarray, *, metric: GLSMetric, pivots: np.ndarray, nuisance: np.ndarray | None = None):
    z = np.asarray(z, float)
    cols = np.column_stack([np.maximum(z - float(p), 0.0) for p in pivots])
    meta = [{"kind": "piecewise_linear", "z": float(p)} for p in pivots]
    base = np.column_stack([np.ones(z.size), z - np.mean(z)]) if nuisance is None else nuisance
    return build_projection(cols, metric, nuisance=base, metadata=meta)


def survey_intercept_slope_design(*, survey: np.ndarray, z: np.ndarray, include_slopes: bool = True) -> np.ndarray:
    survey = np.asarray(survey)
    z = np.asarray(z, float)
    values = list(np.unique(survey))
    cols = [np.ones(z.size)]
    for value in values[1:]:
        cols.append((survey == value).astype(float))
    if include_slopes:
        centered = z - np.mean(z)
        for value in values:
            cols.append((survey == value).astype(float) * centered)
    return np.column_stack(cols)


def whiten_residual(covariance: np.ndarray, residual: np.ndarray) -> np.ndarray:
    L = np.linalg.cholesky(np.asarray(covariance, float))
    return solve_triangular(L, np.asarray(residual, float), lower=True, check_finite=False)


def binned_gls(z: np.ndarray, residual: np.ndarray, covariance: np.ndarray, *, bins: int = 20) -> list[dict[str, float]]:
    z = np.asarray(z, float); residual = np.asarray(residual, float); covariance = np.asarray(covariance, float)
    edges = np.quantile(z, np.linspace(0.0, 1.0, bins + 1))
    rows = []
    for i in range(bins):
        mask = (z >= edges[i]) & ((z <= edges[i + 1]) if i == bins - 1 else (z < edges[i + 1]))
        idx = np.flatnonzero(mask)
        if not idx.size:
            continue
        metric = GLSMetric(idx.size, covariance=covariance[np.ix_(idx, idx)])
        beta, chi2 = metric.profile(residual[idx], np.ones((idx.size, 1)))
        one = np.ones(idx.size)
        variance = 1.0 / float(one @ metric.apply(one))
        rows.append({"z": float(np.mean(z[idx])), "n": int(idx.size), "mean": float(beta[0]), "se": float(np.sqrt(variance)), "chi2": float(chi2)})
    return rows


def survey_score_contributions(projection, residual: np.ndarray, survey: np.ndarray, best_index: int) -> list[dict[str, float]]:
    q = np.asarray(projection.q[best_index], float)
    residual = np.asarray(residual, float); survey = np.asarray(survey)
    rows = []
    scores = []
    for value in np.unique(survey):
        idx = survey == value
        score = float(q[idx] @ residual[idx])
        rows.append({"survey": int(value), "score": score, "n": int(np.count_nonzero(idx))})
        scores.append(abs(score))
    total = max(sum(scores), np.finfo(float).tiny)
    for row in rows:
        row["abs_score_fraction"] = abs(row["score"]) / total
    return sorted(rows, key=lambda r: r["abs_score_fraction"], reverse=True)


def entropy_from_pivots(pivots: np.ndarray) -> float:
    _, counts = np.unique(np.asarray(pivots, float), return_counts=True)
    p = counts / counts.sum()
    h = float(-np.sum(p * np.log(p)))
    return h / float(np.log(len(counts))) if len(counts) > 1 else 0.0


__all__ = [
    "GLSMetric", "adaptive_mock_target", "blind_pivots", "binned_gls", "entropy_from_pivots",
    "gaussian_bump_projection", "gaussian_scan_maxima", "gaussian_score_draws", "hard_step_projection",
    "hard_step_scan", "piecewise_linear_projection", "pivot_draws", "scan_null_pvalue",
    "survey_intercept_slope_design", "survey_score_contributions", "tanh_projection", "template_scan", "whiten_residual",
]
