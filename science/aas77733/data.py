from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .config import load_manifest

MAX_COVARIANCE_RELATIVE_ASYMMETRY = 1e-7


@dataclass
class PantheonBundle:
    columns: dict[str, np.ndarray]
    covariance: np.ndarray
    receipts: dict[str, Any]

    @property
    def n(self) -> int:
        return len(self.columns["zHD"])


@dataclass
class DESBundle:
    columns: dict[str, np.ndarray]
    precision: np.ndarray
    receipts: dict[str, Any]

    @property
    def n(self) -> int:
        return len(self.columns["zHD"])


def git_blob_sha1(data: bytes) -> str:
    prefix = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(prefix + data).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _cache_name(source: dict[str, Any]) -> str:
    digest = hashlib.sha256(source["url"].encode("utf-8")).hexdigest()[:12]
    return f"{digest}-{Path(source['path']).name}"


def download_verified(source: dict[str, Any], cache_dir: str | Path) -> tuple[Path, dict[str, Any]]:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / _cache_name(source)
    expected_blob = str(source.get("git_blob_sha1") or "").lower()

    def validate(data: bytes) -> dict[str, Any]:
        blob = git_blob_sha1(data)
        if expected_blob and blob != expected_blob:
            raise ValueError(f"GIT_BLOB_MISMATCH:{source['path']}:{blob}:{expected_blob}")
        return {
            "url": source["url"],
            "path": source["path"],
            "git_blob_sha1": blob,
            "sha256": sha256_bytes(data),
            "bytes": len(data),
        }

    if target.exists():
        data = target.read_bytes()
        try:
            return target, validate(data)
        except ValueError:
            target.unlink(missing_ok=True)

    request = urllib.request.Request(source["url"], headers={"User-Agent": "nexo-aas77733-r1/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310 - immutable GitHub URLs are manifest-pinned
        data = response.read()
    receipt = validate(data)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, target)
    return target, receipt


def _parse_pantheon(path: Path) -> dict[str, np.ndarray]:
    table = np.genfromtxt(path, names=True, dtype=None, encoding="utf-8")
    if table.dtype.names is None:
        raise ValueError("PANTHEON_HEADER_MISSING")
    return {name: np.asarray(table[name]) for name in table.dtype.names}


def _parse_pantheon_covariance(path: Path, expected_n: int) -> tuple[np.ndarray, dict[str, Any]]:
    payload = np.fromstring(path.read_text(encoding="utf-8"), sep=" ")
    if payload.size < 2:
        raise ValueError("PANTHEON_COVARIANCE_EMPTY")
    n = int(round(float(payload[0])))
    if n != expected_n:
        raise ValueError(f"PANTHEON_COVARIANCE_DIMENSION:{n}:{expected_n}")
    values = payload[1:]
    if values.size != n * n:
        raise ValueError(f"PANTHEON_COVARIANCE_SIZE:{values.size}:{n*n}")
    covariance = values.reshape(n, n)
    max_abs = float(np.max(np.abs(covariance)))
    max_asymmetry = float(np.max(np.abs(covariance - covariance.T)))
    relative_asymmetry = max_asymmetry / max(max_abs, np.finfo(float).tiny)
    if relative_asymmetry > MAX_COVARIANCE_RELATIVE_ASYMMETRY:
        raise ValueError(
            f"PANTHEON_COVARIANCE_ASYMMETRY:{relative_asymmetry:.6e}:{MAX_COVARIANCE_RELATIVE_ASYMMETRY:.6e}"
        )
    symmetrized = max_asymmetry > 0.0
    if symmetrized:
        covariance = 0.5 * (covariance + covariance.T)
    diagnostic = {
        "max_abs_asymmetry": max_asymmetry,
        "relative_asymmetry": relative_asymmetry,
        "allowed_relative_asymmetry": MAX_COVARIANCE_RELATIVE_ASYMMETRY,
        "symmetrized_release_rounding": symmetrized,
    }
    return covariance, diagnostic


def load_pantheon(cache_dir: str | Path) -> PantheonBundle:
    manifest = load_manifest()
    source = manifest["sources"]["pantheon_plus"]
    data_path, data_receipt = download_verified(source["data"], cache_dir)
    cov_path, cov_receipt = download_verified(source["covariance"], cache_dir)
    columns = _parse_pantheon(data_path)
    expected_n = int(source["covariance"]["dimension"])
    if len(columns["zHD"]) != expected_n:
        raise ValueError(f"PANTHEON_ROW_COUNT:{len(columns['zHD'])}:{expected_n}")
    covariance, covariance_diagnostic = _parse_pantheon_covariance(cov_path, expected_n)
    required = {"CID", "IDSURVEY", "zHD", "zHEL", "m_b_corr", "MU_SH0ES", "CEPH_DIST", "IS_CALIBRATOR", "HOST_LOGMASS"}
    missing = sorted(required - set(columns))
    if missing:
        raise ValueError(f"PANTHEON_COLUMNS_MISSING:{','.join(missing)}")
    return PantheonBundle(
        columns=columns,
        covariance=covariance,
        receipts={
            "repository": source["repository"],
            "commit": source["commit"],
            "data": data_receipt,
            "covariance": {**cov_receipt, **covariance_diagnostic},
        },
    )


def pantheon_primary_mask(bundle: PantheonBundle) -> np.ndarray:
    return (np.asarray(bundle.columns["IS_CALIBRATOR"], dtype=int) == 0) & (np.asarray(bundle.columns["zHD"], dtype=float) > 0.01)


def pantheon_sensitivity_mask(bundle: PantheonBundle) -> np.ndarray:
    return (np.asarray(bundle.columns["IS_CALIBRATOR"], dtype=int) == 0) & (np.asarray(bundle.columns["IDSURVEY"], dtype=int) != 1)


def subset_covariance(covariance: np.ndarray, mask: np.ndarray) -> np.ndarray:
    idx = np.flatnonzero(np.asarray(mask, dtype=bool))
    return np.asarray(covariance, dtype=float)[np.ix_(idx, idx)]


def _parse_des_hubble(path: Path) -> dict[str, np.ndarray]:
    names: list[str] | None = None
    rows: list[list[str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("VARNAMES:"):
            names = line.split()[1:]
            continue
        if line.startswith("SN:"):
            rows.append(line.split()[1:])
    if not names or not rows:
        raise ValueError("DES_HUBBLE_PARSE_FAILED")
    if any(len(row) != len(names) for row in rows):
        raise ValueError("DES_HUBBLE_COLUMN_COUNT")
    string_columns = {"CID"}
    result: dict[str, np.ndarray] = {}
    for col, name in enumerate(names):
        values = [row[col] for row in rows]
        if name in string_columns:
            result[name] = np.asarray(values, dtype=str)
        elif name == "IDSURVEY":
            result[name] = np.asarray(values, dtype=int)
        else:
            result[name] = np.asarray(values, dtype=float)
    return result


def _parse_des_precision(path: Path) -> np.ndarray:
    with np.load(path, allow_pickle=False) as payload:
        if len(payload.files) < 2:
            raise ValueError("DES_PRECISION_NPZ_LAYOUT")
        first = np.asarray(payload[payload.files[0]]).reshape(-1)
        n = int(first[0])
        upper = np.asarray(payload[payload.files[1]], dtype=float).reshape(-1)
    expected = n * (n + 1) // 2
    if upper.size != expected:
        raise ValueError(f"DES_PRECISION_UPPER_SIZE:{upper.size}:{expected}")
    precision = np.zeros((n, n), dtype=float)
    upper_idx = np.triu_indices(n)
    precision[upper_idx] = upper
    lower_idx = np.tril_indices(n, -1)
    precision[lower_idx] = precision.T[lower_idx]
    if not np.allclose(precision, precision.T, rtol=1e-12, atol=1e-14):
        raise ValueError("DES_PRECISION_NOT_SYMMETRIC")
    return precision


def load_des5yr(cache_dir: str | Path) -> DESBundle:
    manifest = load_manifest()
    source = manifest["sources"]["des_sn5yr"]
    data_path, data_receipt = download_verified(source["data"], cache_dir)
    precision_path, precision_receipt = download_verified(source["precision"], cache_dir)
    columns = _parse_des_hubble(data_path)
    precision = _parse_des_precision(precision_path)
    if precision.shape[0] != len(columns["zHD"]):
        raise ValueError(f"DES_ROW_PRECISION_MISMATCH:{len(columns['zHD'])}:{precision.shape[0]}")
    required = {"CID", "IDSURVEY", "zHD", "zHEL", "MU", "MUERR"}
    missing = sorted(required - set(columns))
    if missing:
        raise ValueError(f"DES_COLUMNS_MISSING:{','.join(missing)}")
    return DESBundle(
        columns=columns,
        precision=precision,
        receipts={
            "repository": source["repository"],
            "commit": source["commit"],
            "data": data_receipt,
            "precision": precision_receipt,
            "precision_semantics": "inverse_covariance",
        },
    )


def compact_receipts(receipts: dict[str, Any]) -> str:
    return json.dumps(receipts, sort_keys=True, separators=(",", ":"))
