from __future__ import annotations

import numpy as np


def _groups(survey: np.ndarray, z: np.ndarray, mode: str, block_width: float) -> list[np.ndarray]:
    survey = np.asarray(survey)
    z = np.asarray(z, float)
    if mode == "redshift_shuffle":
        return [np.arange(z.size)]
    groups: list[np.ndarray] = []
    for s in np.unique(survey):
        base = np.flatnonzero(survey == s)
        if mode == "intra_survey_shuffle":
            groups.append(base)
        elif mode == "survey_redshift_block":
            bid = np.floor((z[base] - np.min(z)) / float(block_width)).astype(int)
            for b in np.unique(bid):
                idx = base[bid == b]
                if idx.size:
                    groups.append(idx)
        else:
            raise ValueError(f"UNKNOWN_MODE:{mode}")
    return groups


def permutation_maxima(projection, *, residual: np.ndarray, z: np.ndarray, survey: np.ndarray, mocks: int, rng: np.random.Generator, mode: str, block_width: float = 0.05, batch: int = 256) -> np.ndarray:
    residual = np.asarray(residual, float)
    groups = _groups(survey, z, mode, block_width)
    maxima = np.empty(int(mocks), float)
    q = np.asarray(projection.q, float)
    for start in range(0, int(mocks), int(batch)):
        stop = min(start + int(batch), int(mocks))
        b = stop - start
        draws = np.broadcast_to(residual, (b, residual.size)).copy()
        for idx in groups:
            if idx.size < 2:
                continue
            keys = rng.random((b, idx.size))
            order = np.argsort(keys, axis=1)
            draws[:, idx] = residual[idx][order]
        scores = draws @ q.T
        maxima[start:stop] = np.max(scores * scores, axis=1)
    return maxima


def survey_offset_maxima(projection, *, survey: np.ndarray, offset: float, mocks: int, rng: np.random.Generator, noise_scores: np.ndarray) -> np.ndarray:
    survey = np.asarray(survey)
    values, counts = np.unique(survey, return_counts=True)
    values = values[np.argsort(counts)[::-1][: min(8, len(values))]]
    means = []
    for value in values:
        mask = (survey == value).astype(float)
        score = projection.q @ (float(offset) * mask)
        means.extend([score, -score])
    means = np.asarray(means)
    choice = rng.integers(0, len(means), size=int(mocks))
    shifted = np.asarray(noise_scores, float) + means[choice]
    return np.max(shifted * shifted, axis=1)
