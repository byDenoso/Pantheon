from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.linalg import cho_factor, cho_solve
from scipy.optimize import minimize_scalar

C_KM_S = 299792.458


@dataclass
class GLSMetric:
    """Linear GLS metric backed by either a covariance or a precision matrix."""

    n: int
    covariance: np.ndarray | None = None
    precision: np.ndarray | None = None

    def __post_init__(self) -> None:
        if (self.covariance is None) == (self.precision is None):
            raise ValueError("EXACTLY_ONE_METRIC_REQUIRED")
        if self.covariance is not None:
            self.covariance = np.asarray(self.covariance, dtype=float)
            if self.covariance.shape != (self.n, self.n):
                raise ValueError("COVARIANCE_SHAPE_MISMATCH")
            self._factor = cho_factor(self.covariance, lower=True, check_finite=False)
        else:
            self.precision = np.asarray(self.precision, dtype=float)
            if self.precision.shape != (self.n, self.n):
                raise ValueError("PRECISION_SHAPE_MISMATCH")
            self._factor = None

    def apply(self, x: np.ndarray) -> np.ndarray:
        value = np.asarray(x, dtype=float)
        if self._factor is not None:
            return cho_solve(self._factor, value, check_finite=False)
        assert self.precision is not None
        return self.precision @ value

    def profile(self, y: np.ndarray, design: np.ndarray) -> tuple[np.ndarray, float]:
        y = np.asarray(y, dtype=float)
        design = np.asarray(design, dtype=float)
        if design.ndim == 1:
            design = design[:, None]
        p_design = self.apply(design)
        p_y = self.apply(y)
        gram = design.T @ p_design
        beta = np.linalg.pinv(gram, rcond=1e-12) @ (design.T @ p_y)
        error = y - design @ beta
        chi2 = float(error @ self.apply(error))
        return beta, chi2


@dataclass
class ScanProjection:
    metadata: list[dict[str, Any]]
    q: np.ndarray
    denominator: np.ndarray
    correlation: np.ndarray
    active: np.ndarray

    def evaluate(self, residual: np.ndarray) -> dict[str, Any]:
        residual = np.asarray(residual, dtype=float)
        score = self.q @ residual
        delta = score**2
        amplitude = np.zeros_like(score)
        amplitude[self.active] = score[self.active] / np.sqrt(self.denominator[self.active])
        index = int(np.argmax(delta)) if delta.size else -1
        return {
            "index": index,
            "scores": score,
            "delta_chi2_vector": delta,
            "amplitude_vector": amplitude,
            "delta_chi2": float(delta[index]) if index >= 0 else 0.0,
            "amplitude": float(amplitude[index]) if index >= 0 else 0.0,
            "metadata": self.metadata[index] if index >= 0 else {},
        }


def build_projection(
    templates: np.ndarray,
    metric: GLSMetric,
    *,
    nuisance: np.ndarray | None = None,
    metadata: list[dict[str, Any]] | None = None,
) -> ScanProjection:
    templates = np.asarray(templates, dtype=float)
    if templates.ndim == 1:
        templates = templates[:, None]
    n, k = templates.shape
    if n != metric.n:
        raise ValueError("TEMPLATE_LENGTH_MISMATCH")
    base = np.ones((n, 1), dtype=float) if nuisance is None else np.asarray(nuisance, dtype=float)
    if base.ndim == 1:
        base = base[:, None]
    if base.shape[0] != n:
        raise ValueError("NUISANCE_LENGTH_MISMATCH")

    p_templates = metric.apply(templates)
    p_base = metric.apply(base)
    gram = base.T @ p_base
    coeff = np.linalg.pinv(gram, rcond=1e-12) @ (base.T @ p_templates)
    residualized = templates - base @ coeff
    p_residualized = metric.apply(residualized)
    denominator = np.sum(residualized * p_residualized, axis=0)
    scale = max(1.0, float(np.nanmax(np.abs(denominator))) if denominator.size else 1.0)
    active = np.isfinite(denominator) & (denominator > 1e-10 * scale)

    q = np.zeros((k, n), dtype=float)
    if np.any(active):
        q[active, :] = (p_residualized[:, active] / np.sqrt(denominator[active])).T

    correlation = np.zeros((k, k), dtype=float)
    if np.any(active):
        idx = np.flatnonzero(active)
        cross = residualized[:, idx].T @ p_residualized[:, idx]
        denom = np.sqrt(np.outer(denominator[idx], denominator[idx]))
        block = cross / denom
        block = np.clip((block + block.T) / 2.0, -1.0, 1.0)
        np.fill_diagonal(block, 1.0)
        correlation[np.ix_(idx, idx)] = block

    if metadata is None:
        metadata = [{"index": i} for i in range(k)]
    if len(metadata) != k:
        raise ValueError("METADATA_LENGTH_MISMATCH")
    return ScanProjection(metadata, q, denominator, correlation, active)


def hard_step_projection(
    z: np.ndarray,
    *,
    metric: GLSMetric,
    pivots: np.ndarray,
    nuisance: np.ndarray | None = None,
) -> ScanProjection:
    z = np.asarray(z, dtype=float)
    pivots = np.asarray(pivots, dtype=float)
    templates = np.column_stack([(z > pivot).astype(float) for pivot in pivots])
    metadata = [{"kind": "hard_step", "z": float(pivot)} for pivot in pivots]
    return build_projection(templates, metric, nuisance=nuisance, metadata=metadata)


def hard_step_scan(
    *,
    z: np.ndarray,
    residual: np.ndarray,
    covariance: np.ndarray | None = None,
    precision: np.ndarray | None = None,
    pivots: np.ndarray | None = None,
    nuisance: np.ndarray | None = None,
    metric: GLSMetric | None = None,
) -> dict[str, Any]:
    z = np.asarray(z, dtype=float)
    residual = np.asarray(residual, dtype=float)
    if pivots is None:
        pivots = np.round(np.arange(0.25, 0.600001, 0.01), 10)
    pivots = np.asarray(pivots, dtype=float)
    metric = metric or GLSMetric(len(z), covariance=covariance, precision=precision)
    projection = hard_step_projection(z, metric=metric, pivots=pivots, nuisance=nuisance)
    evaluated = projection.evaluate(residual)
    scan = [
        {"z": float(pivot), "delta_chi2": float(delta), "amplitude": float(amplitude)}
        for pivot, delta, amplitude in zip(
            pivots, evaluated["delta_chi2_vector"], evaluated["amplitude_vector"], strict=True
        )
    ]
    return {
        "best_z": float(evaluated["metadata"].get("z", np.nan)),
        "delta_chi2": float(evaluated["delta_chi2"]),
        "amplitude": float(evaluated["amplitude"]),
        "scan": scan,
        "projection": projection,
        "scores": evaluated["scores"],
    }


def gaussian_bump_projection(
    z: np.ndarray,
    *,
    metric: GLSMetric,
    centers: Iterable[float],
    widths: Iterable[float],
    nuisance: np.ndarray | None = None,
) -> ScanProjection:
    z = np.asarray(z, dtype=float)
    columns: list[np.ndarray] = []
    metadata: list[dict[str, Any]] = []
    for width in widths:
        for center in centers:
            columns.append(np.exp(-0.5 * ((z - float(center)) / float(width)) ** 2))
            metadata.append({"kind": "gaussian_bump", "z": float(center), "width": float(width)})
    return build_projection(np.column_stack(columns), metric, nuisance=nuisance, metadata=metadata)


def template_scan(projection: ScanProjection, residual: np.ndarray) -> dict[str, Any]:
    evaluated = projection.evaluate(residual)
    return {
        "metadata": dict(evaluated["metadata"]),
        "delta_chi2": float(evaluated["delta_chi2"]),
        "amplitude": float(evaluated["amplitude"]),
        "scores": evaluated["scores"],
    }


def scan_null_pvalue(*, observed: float, maxima: np.ndarray) -> float:
    maxima = np.asarray(maxima, dtype=float)
    return float((np.count_nonzero(maxima >= float(observed)) + 1) / (maxima.size + 1))


def gaussian_score_draws(
    projection: ScanProjection,
    *,
    mocks: int,
    rng: np.random.Generator,
    mean_scores: np.ndarray | None = None,
) -> np.ndarray:
    active = np.flatnonzero(projection.active)
    draws = np.zeros((mocks, projection.q.shape[0]), dtype=float)
    if not active.size:
        return draws
    corr = projection.correlation[np.ix_(active, active)]
    values, vectors = np.linalg.eigh((corr + corr.T) / 2.0)
    transform = vectors @ np.diag(np.sqrt(np.clip(values, 0.0, None)))
    block = rng.standard_normal((mocks, active.size)) @ transform.T
    if mean_scores is not None:
        block += np.asarray(mean_scores, dtype=float)[active]
    draws[:, active] = block
    return draws


def gaussian_scan_maxima(
    projection: ScanProjection,
    *,
    mocks: int,
    rng: np.random.Generator,
    mean_scores: np.ndarray | None = None,
) -> np.ndarray:
    draws = gaussian_score_draws(projection, mocks=mocks, rng=rng, mean_scores=mean_scores)
    return np.max(draws**2, axis=1)


def pivot_draws(
    projection: ScanProjection,
    observed_scores: np.ndarray,
    *,
    mocks: int,
    rng: np.random.Generator,
) -> np.ndarray:
    draws = gaussian_score_draws(projection, mocks=mocks, rng=rng, mean_scores=observed_scores)
    indices = np.argmax(draws**2, axis=1)
    return np.asarray([float(projection.metadata[index]["z"]) for index in indices], dtype=float)


def structured_permutation_maxima(
    projection: ScanProjection,
    *,
    residual: np.ndarray,
    z: np.ndarray,
    survey: np.ndarray,
    mocks: int,
    rng: np.random.Generator,
    mode: str,
    block_width: float = 0.05,
) -> np.ndarray:
    residual = np.asarray(residual, dtype=float)
    z = np.asarray(z, dtype=float)
    survey = np.asarray(survey)
    result = np.empty(mocks, dtype=float)
    unique_surveys = np.unique(survey)
    block_id = np.floor((z - np.min(z)) / float(block_width)).astype(int)
    for row in range(mocks):
        permuted = residual.copy()
        if mode == "redshift_shuffle":
            permuted = residual[rng.permutation(residual.size)]
        elif mode == "intra_survey_shuffle":
            for value in unique_surveys:
                idx = np.flatnonzero(survey == value)
                permuted[idx] = residual[idx][rng.permutation(idx.size)]
        elif mode == "survey_redshift_block":
            for value in unique_surveys:
                for block in np.unique(block_id[survey == value]):
                    idx = np.flatnonzero((survey == value) & (block_id == block))
                    if idx.size > 1:
                        permuted[idx] = residual[idx][rng.permutation(idx.size)]
        else:
            raise ValueError(f"UNKNOWN_PERMUTATION_MODE:{mode}")
        scores = projection.q @ permuted
        result[row] = float(np.max(scores**2))
    return result


def distance_modulus_flat_lcdm(
    zhd: np.ndarray,
    zhel: np.ndarray,
    omega_m: float,
    *,
    h0: float = 70.0,
    grid_size: int = 8192,
) -> np.ndarray:
    zhd = np.asarray(zhd, dtype=float)
    zhel = np.asarray(zhel, dtype=float)
    if not (0.01 < float(omega_m) < 0.99):
        raise ValueError("OMEGA_M_OUT_OF_RANGE")
    max_z = max(0.02, float(np.max(zhd)) * 1.001)
    grid = np.linspace(0.0, max_z, grid_size)
    inv_e = 1.0 / np.sqrt(float(omega_m) * (1.0 + grid) ** 3 + (1.0 - float(omega_m)))
    chi = cumulative_trapezoid(inv_e, grid, initial=0.0)
    dc = (C_KM_S / float(h0)) * np.interp(zhd, grid, chi)
    distance = (1.0 + zhel) * dc
    if np.any(distance <= 0.0):
        raise ValueError("NONPOSITIVE_LUMINOSITY_DISTANCE")
    return 5.0 * np.log10(distance) + 25.0


def fit_omega_m(
    *,
    zhd: np.ndarray,
    zhel: np.ndarray,
    observed: np.ndarray,
    metric: GLSMetric,
    grid: np.ndarray,
    extra_design: np.ndarray | None = None,
) -> dict[str, Any]:
    zhd = np.asarray(zhd, dtype=float)
    zhel = np.asarray(zhel, dtype=float)
    observed = np.asarray(observed, dtype=float)
    omega_grid = np.asarray(grid, dtype=float)
    if omega_grid.ndim != 1 or omega_grid.size < 2 or not np.all(np.diff(omega_grid) > 0):
        raise ValueError("OMEGA_GRID_INVALID")
    if extra_design is None:
        design = np.ones((len(zhd), 1), dtype=float)
    else:
        design = np.asarray(extra_design, dtype=float)
        if design.ndim == 1:
            design = design[:, None]
        if not np.allclose(design[:, 0], 1.0):
            design = np.column_stack([np.ones(len(zhd)), design])

    def evaluate(omega_m: float) -> tuple[float, float]:
        theory = distance_modulus_flat_lcdm(zhd, zhel, float(omega_m))
        residual = observed - theory
        beta, chi2 = metric.profile(residual, design)
        return float(chi2), float(beta[0])

    rows: list[dict[str, float]] = []
    for omega_m in omega_grid:
        chi2, intercept = evaluate(float(omega_m))
        rows.append({"omega_m": float(omega_m), "chi2": chi2, "intercept": intercept})

    optimum = minimize_scalar(
        lambda omega: evaluate(float(omega))[0],
        bounds=(float(omega_grid[0]), float(omega_grid[-1])),
        method="bounded",
        options={"xatol": 1e-10, "maxiter": 500},
    )
    if not optimum.success or not np.isfinite(optimum.fun):
        raise ValueError("OMEGA_PROFILE_FAILED")
    best_omega = float(optimum.x)
    best_chi2, best_intercept = evaluate(best_omega)
    best = {
        "omega_m": best_omega,
        "chi2": best_chi2,
        "intercept": best_intercept,
        "optimizer": "bounded_continuous_profile",
        "search_bounds": [float(omega_grid[0]), float(omega_grid[-1])],
    }
    theory = distance_modulus_flat_lcdm(zhd, zhel, best_omega)
    residual = observed - theory
    return {"best": best, "grid": rows, "residual": residual}


def survey_nuisance_design(
    *,
    survey: np.ndarray,
    z: np.ndarray,
    host_logmass: np.ndarray | None = None,
    include_redshift_trend: bool = True,
) -> np.ndarray:
    survey = np.asarray(survey)
    z = np.asarray(z, dtype=float)
    columns: list[np.ndarray] = [np.ones(z.size, dtype=float)]
    values = list(np.unique(survey))
    for value in values[1:]:
        columns.append((survey == value).astype(float))
    if include_redshift_trend:
        columns.append(z - float(np.mean(z)))
    if host_logmass is not None:
        mass = np.asarray(host_logmass, dtype=float)
        valid = mass > -8.0
        step = np.zeros_like(mass, dtype=float)
        step[valid] = (mass[valid] >= 10.0).astype(float)
        columns.append(step)
    return np.column_stack(columns)


def condition_number_spd(matrix: np.ndarray) -> float:
    values = np.linalg.eigvalsh(np.asarray(matrix, dtype=float))
    minimum = float(np.min(values))
    maximum = float(np.max(values))
    if minimum <= 0.0:
        return float("inf")
    return maximum / minimum
