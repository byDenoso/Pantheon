#!/usr/bin/env python3
"""Offline staging preflight for the frozen DESI DR1 LSS selection.

This utility never downloads data and never emits a scientific verdict.  It
plans conservative storage and verifies an already-materialized directory
against the 160-file manifest used by GZ01-B03-T03-WINDOW-ROTATION-NULL.
"""

from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys


RECEIPT_SCHEMA = "NEXO_DESI_LSS_SELECTION_MATERIALIZATION_RECEIPT_V1"
PLAN_SCHEMA = "NEXO_DESI_LSS_SELECTION_MATERIALIZATION_PLAN_V1"
FAILURE_SCHEMA = "NEXO_DESI_LSS_SELECTION_MATERIALIZATION_FAILURE_V1"
MANIFEST_SCHEMA = "NEXO_DESI_LSS_SELECTION_MANIFEST_V1"
MANIFEST_SHA256 = "6ce284a355085679eb528517746b247fa2c48902c6158ca556ae9c197b34c65a"
EXPECTED_FILE_COUNT = 160
EXPECTED_TOTAL_BYTES = 139_526_840_064
CAMPAIGN_ID = "RM-GZ01-GALAXY-3D-MAP-LIVE-V1"
WORK_ID = "WORK::GZ-01-B03-GALAXY-3D-MAP"
TEST_ID = "GZ01-B03-T03-WINDOW-ROTATION-NULL"
RECOVERY_WORK_ID = "WORK::RECOVERY-9ec8d79f540e5103bc62321946a2c4c8"
SELECTION_ORIGIN = "GZ01-B03-T01-SOURCE-AND-SELECTION"
RECIPE_FAMILY = "desi_lss_selection_binding_family"
T03_STATUS = "PREPARED_PARTIAL_NOT_READY"
BASE_URL = "https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/"
INDEX_SHA256 = "8957d496d448a3fa585aa43399ffeace6b9f90ba7624514fe37c917d1fce406b"
CHECKSUM_NAME = "dr1_survey_catalogs_dr1_LSS_iron_LSScats_v1.5.sha256sum"
CHECKSUM_SHA256 = "7ca54da2370849ee92f20a8b7eb993b8d612f9d51658832e3f5d718735e01539"
VERSION = "DESI DR1/iron/LSScats v1.5"
TRACERS = ("BGS_ANY", "LRG", "ELG_LOPnotqso", "QSO")
REGIONS = ("NGC", "SGC")
RANDOM_INDICES = tuple(range(18))


class StagingError(ValueError):
    """The staging plan or local materialization violates the frozen contract."""


def _valid_sha256(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _stat_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _is_reparse_or_symlink(path: Path) -> bool:
    info = path.stat(follow_symlinks=False)
    attributes = getattr(info, "st_file_attributes", 0)
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & reparse_flag)


def _sha256_open_file(path: Path, expected_lstat: os.stat_result) -> tuple[str, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or not os.path.samestat(expected_lstat, opened):
            raise StagingError(f"staged input identity changed before hashing: {path.name}")
        digest = hashlib.sha256()
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
            after_open = os.fstat(stream.fileno())
        if _stat_identity(opened) != _stat_identity(after_open):
            raise StagingError(f"staged input changed while hashing: {path.name}")
        return digest.hexdigest(), after_open
    finally:
        os.close(descriptor)


def _expected_files() -> dict[str, dict]:
    expected: dict[str, dict] = {}
    for tracer in TRACERS:
        for region in REGIONS:
            expected[f"{tracer}_{region}_clustering.dat.fits"] = {
                "role": "catalog", "tracer": tracer, "region": region
            }
            expected[f"{tracer}_{region}_nz.txt"] = {
                "role": "n_z", "tracer": tracer, "region": region
            }
            for index in RANDOM_INDICES:
                expected[f"{tracer}_{region}_{index}_clustering.ran.fits"] = {
                    "role": "random", "tracer": tracer, "region": region,
                    "random_index": index,
                }
    return expected


def validate_manifest_bytes(raw: bytes) -> tuple[dict, str]:
    manifest_sha256 = _sha256_bytes(raw)
    if manifest_sha256 != MANIFEST_SHA256:
        raise StagingError(
            f"selection-manifest SHA256 mismatch: expected {MANIFEST_SHA256}, "
            f"observed {manifest_sha256}"
        )
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise StagingError(f"manifest is not valid UTF-8 JSON: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("schema") != MANIFEST_SCHEMA:
        raise StagingError("unexpected selection-manifest schema")
    if manifest.get("campaign_id") != CAMPAIGN_ID or manifest.get("selection_origin") != SELECTION_ORIGIN:
        raise StagingError("manifest identity differs from the frozen T01/T03 lineage")
    expected_release = {
        "survey": "DESI DR1", "production": "iron",
        "catalog_family": "LSScats", "catalog_version": "v1.5",
    }
    if manifest.get("release") != expected_release:
        raise StagingError("manifest changed the frozen DESI release")
    expected_selection = {
        "tracers": list(TRACERS), "regions": list(REGIONS),
        "randoms_per_tracer_region": 18, "includes_official_n_z": True,
    }
    if manifest.get("selection") != expected_selection:
        raise StagingError("manifest changed the frozen T01 selection")
    expected_source = {
        "base_url": BASE_URL, "index_url": BASE_URL,
        "index_sha256": INDEX_SHA256,
        "checksum_url": BASE_URL + CHECKSUM_NAME,
        "checksum_sha256": CHECKSUM_SHA256,
        "hash_algorithm": "sha256",
    }
    if manifest.get("source_receipt") != expected_source:
        raise StagingError("manifest source receipt is not the pinned official DESI index/checksum")
    materialization = manifest.get("materialization")
    if not isinstance(materialization, dict):
        raise StagingError("manifest lacks materialization state")
    if (materialization.get("status") != "INPUT_PENDING_MATERIALIZATION"
            or materialization.get("all_local_bytes_verified") is not False
            or materialization.get("scientific_result_eligible") is not False):
        raise StagingError("input manifest must preserve its pending, non-scientific state")

    expected = _expected_files()
    files = manifest.get("files")
    if not isinstance(files, list) or len(files) != len(expected) or len(expected) != EXPECTED_FILE_COUNT:
        raise StagingError("manifest must contain exactly 160 selected files")
    seen: set[str] = set()
    role_counts = {"catalog": 0, "random": 0, "n_z": 0}
    role_bytes = {"catalog": 0, "random": 0, "n_z": 0}
    for item in files:
        if not isinstance(item, dict):
            raise StagingError("manifest file records must be objects")
        name = item.get("name")
        if (not isinstance(name, str) or not name or Path(name).name != name
                or "/" in name or "\\" in name or name in seen or name not in expected):
            raise StagingError("manifest contains an unexpected, unsafe or duplicate filename")
        seen.add(name)
        metadata = expected[name]
        if any(item.get(key) != value for key, value in metadata.items()):
            raise StagingError(f"manifest metadata differs from filename contract: {name}")
        if "random_index" not in metadata and "random_index" in item:
            raise StagingError(f"non-random record carries random_index: {name}")
        if item.get("url") != BASE_URL + name or item.get("version") != VERSION:
            raise StagingError(f"manifest file is outside the frozen DESI release: {name}")
        size = item.get("size_bytes")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or not _valid_sha256(item.get("sha256")):
            raise StagingError(f"manifest file lacks positive size or lowercase SHA256: {name}")
        role = item.get("role")
        if role not in role_counts:
            raise StagingError(f"manifest file has an invalid role: {name}")
        role_counts[role] += 1
        role_bytes[role] += size
    if seen != set(expected):
        raise StagingError("manifest does not contain the exact frozen filename set")
    total_bytes = sum(role_bytes.values())
    if total_bytes != EXPECTED_TOTAL_BYTES:
        raise StagingError("manifest total bytes differ from the frozen selection")
    summary = manifest.get("summary")
    if summary != {
        "file_count": 160,
        "role_counts": role_counts,
        "role_bytes": role_bytes,
        "total_bytes": total_bytes,
    }:
        raise StagingError("manifest summary differs from its file records")
    return manifest, manifest_sha256


def _storage_anchor(staging_root: Path) -> Path:
    if staging_root.exists():
        if _is_reparse_or_symlink(staging_root) or not staging_root.is_dir():
            raise StagingError("staging root must be a real directory, not a symlink or reparse point")
        return staging_root
    anchor = staging_root.parent
    while not anchor.exists() and anchor.parent != anchor:
        anchor = anchor.parent
    if (not anchor.exists() or not anchor.is_dir()
            or _is_reparse_or_symlink(anchor)):
        raise StagingError("no real existing parent is available for the staging root")
    return anchor


def _parse_multiplier(value: str) -> Decimal:
    try:
        multiplier = Decimal(value)
    except InvalidOperation as error:
        raise StagingError("free-space multiplier must be decimal") from error
    if not multiplier.is_finite() or multiplier < Decimal("1") or multiplier > Decimal("5"):
        raise StagingError("free-space multiplier must be between 1 and 5")
    return multiplier


def build_plan(manifest: dict, manifest_sha256: str, staging_root: Path,
               multiplier: Decimal, free_bytes: int,
               url_list_sha256: str | None = None) -> dict:
    total_bytes = manifest["summary"]["total_bytes"]
    required = int((Decimal(total_bytes) * multiplier).to_integral_value(rounding=ROUND_CEILING))
    storage_ok = free_bytes >= required
    return {
        "schema": PLAN_SCHEMA,
        "campaign_id": CAMPAIGN_ID,
        "work_id": WORK_ID,
        "recovery_work_id": RECOVERY_WORK_ID,
        "test_id": TEST_ID,
        "mode": "plan",
        "operator_state": "STORAGE_PREFLIGHT_OK" if storage_ok else "STORAGE_PREFLIGHT_BLOCKED",
        "manifest_sha256": manifest_sha256,
        "staging_root": str(staging_root),
        "selection": manifest["selection"],
        "file_count": manifest["summary"]["file_count"],
        "source_bytes": total_bytes,
        "free_space_multiplier": str(multiplier),
        "required_free_bytes": required,
        "observed_free_bytes": int(free_bytes),
        "storage_ok": storage_ok,
        "url_list_sha256": url_list_sha256,
        "local_bytes_verified": False,
        "work_ready": False,
        "test_ready": False,
        "scientific_result_eligible": False,
        "next_gate": "materialize all files, then run verify against the same manifest",
    }


def _files_index_sha256(records: list[dict]) -> str:
    lines = [
        f"{item['sha256']}  {item['name']}  {item['size_bytes']}\n"
        for item in sorted(records, key=lambda value: value["name"])
    ]
    return _sha256_bytes("".join(lines).encode("utf-8"))


def verify_files(staging_root: Path, records: list[dict]) -> dict:
    if (not staging_root.exists() or not staging_root.is_dir()
            or _is_reparse_or_symlink(staging_root)):
        raise StagingError("staging root must be an existing real directory")
    root_before = staging_root.stat(follow_symlinks=False)
    expected = {item["name"]: item for item in records}
    children = list(staging_root.iterdir())
    initial = {
        path.name: _stat_identity(path.stat(follow_symlinks=False))
        for path in children
    }
    actual_names = set(initial)
    missing = sorted(set(expected) - actual_names)
    extra = sorted(actual_names - set(expected))
    if missing or extra:
        raise StagingError(json.dumps(
            {"reason": "EXACT_FILE_SET_MISMATCH", "missing": missing, "extra": extra},
            sort_keys=True,
        ))
    resolved_root = staging_root.resolve(strict=True)
    verified_bytes = 0
    verified_records: list[dict] = []
    for name in sorted(expected):
        path = staging_root / name
        before = path.stat(follow_symlinks=False)
        if (_is_reparse_or_symlink(path) or not stat.S_ISREG(before.st_mode)
                or path.resolve(strict=True).parent != resolved_root):
            raise StagingError(f"staged input must be a regular non-symlink file: {name}")
        item = expected[name]
        if before.st_size != item["size_bytes"]:
            raise StagingError(
                f"size mismatch for {name}: expected {item['size_bytes']}, observed {before.st_size}"
            )
        actual_sha256, after_open = _sha256_open_file(path, before)
        after = path.stat(follow_symlinks=False)
        if (not os.path.samestat(before, after)
                or _stat_identity(before) != _stat_identity(after_open)
                or _stat_identity(before) != _stat_identity(after)):
            raise StagingError(f"staged input changed while hashing: {name}")
        if actual_sha256 != item["sha256"]:
            raise StagingError(f"SHA256 mismatch for staged input: {name}")
        verified_bytes += after.st_size
        verified_records.append({
            "name": name,
            "size_bytes": after.st_size,
            "sha256": actual_sha256,
        })
    final_children = list(staging_root.iterdir())
    root_after = staging_root.stat(follow_symlinks=False)
    final = {
        path.name: _stat_identity(path.stat(follow_symlinks=False))
        for path in final_children
    }
    if (not os.path.samestat(root_before, root_after)
            or _stat_identity(root_before) != _stat_identity(root_after)
            or final != initial):
        raise StagingError("staging directory changed during verification")
    return {
        "file_count": len(expected),
        "total_bytes": verified_bytes,
        "files_index_sha256": _files_index_sha256(records),
        "files": verified_records,
    }


def build_verified_receipt(manifest: dict, manifest_sha256: str,
                           _staging_root: Path, verified: dict) -> dict:
    if (verified.get("file_count") != manifest["summary"]["file_count"]
            or verified.get("total_bytes") != manifest["summary"]["total_bytes"]):
        raise StagingError("verified byte totals differ from the frozen manifest")
    return {
        "schema": RECEIPT_SCHEMA,
        "execution_status": "MATERIALIZATION_VERIFIED",
        "scope": "SOURCE_MATERIALIZATION_ONLY",
        "roadmap_id": CAMPAIGN_ID,
        "work_id": WORK_ID,
        "test_id": TEST_ID,
        "recovery_work_id": RECOVERY_WORK_ID,
        "recipe_family": RECIPE_FAMILY,
        "selection_manifest": {
            "schema": MANIFEST_SCHEMA,
            "sha256": manifest_sha256,
            "file_count": verified["file_count"],
            "total_bytes": verified["total_bytes"],
        },
        "verification": {
            "hash_algorithm": "sha256",
            "exact_filename_set": True,
            "regular_files_only": True,
            "symlinks_and_reparse_points_rejected": True,
            "extra_entries_rejected": True,
            "all_local_bytes_verified": True,
            "file_count": verified["file_count"],
            "total_bytes": verified["total_bytes"],
            "files_index_sha256": verified["files_index_sha256"],
        },
        "files": verified["files"],
        "local_bytes_verified": True,
        "work_ready": False,
        "test_ready": False,
        "scientific_result_eligible": False,
        "scientific_status": {
            "status": T03_STATUS,
            "scientific_result_eligible": False,
            "t03_dispatch_ready": False,
            "reason": (
                "This receipt verifies frozen DESI source materialization only; "
                "it is not a scientific result and does not satisfy remaining T03 gates."
            ),
        },
        "next_gate": (
            "build and bind NEXO_DESI_LSS_3D_PRODUCT_V1 with frozen cosmology, "
            "voxelization, statistic and complete provenance roles"
        ),
    }


def _canonical_json_bytes(payload: dict) -> bytes:
    return (
        json.dumps(
            payload, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2
        ) + "\n"
    ).encode("utf-8")


def _ensure_output_outside_staging(output: Path, staging_root: Path) -> None:
    target = output.resolve(strict=False)
    root = staging_root.resolve(strict=False)
    if target == root or root in target.parents:
        raise StagingError("receipt and URL list must be outside the exact staging directory")


def _write_json(path: Path, payload: dict, staging_root: Path) -> None:
    _ensure_output_outside_staging(path, staging_root)
    raw = _canonical_json_bytes(payload)
    if path.exists():
        if not path.is_file() or path.read_bytes() != raw:
            raise StagingError("refusing to overwrite a different receipt")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)


def _write_url_list(path: Path, records: list[dict], staging_root: Path) -> str:
    _ensure_output_outside_staging(path, staging_root)
    raw = "".join(item["url"] + "\n" for item in records).encode("utf-8")
    if path.exists():
        if not path.is_file() or path.read_bytes() != raw:
            raise StagingError("refusing to overwrite a different URL list")
        return _sha256_bytes(raw)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return _sha256_bytes(raw)


def _failure_payload(error: Exception) -> dict:
    return {
        "schema": FAILURE_SCHEMA,
        "execution_status": "MATERIALIZATION_PREFLIGHT_FAILED",
        "error_code": "STAGING_CONTRACT_FAILURE",
        "error": str(error),
        "roadmap_id": CAMPAIGN_ID,
        "work_id": WORK_ID,
        "test_id": TEST_ID,
        "recovery_work_id": RECOVERY_WORK_ID,
        "t03_status": T03_STATUS,
        "local_bytes_verified": False,
        "work_ready": False,
        "test_ready": False,
        "scientific_result_eligible": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("plan", "verify"))
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--staging-root", required=True, type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--url-list", type=Path)
    parser.add_argument("--free-space-multiplier", default="1.10")
    args = parser.parse_args(argv)
    staging_root = Path(os.path.abspath(args.staging_root))
    try:
        manifest, manifest_sha256 = validate_manifest_bytes(args.manifest.read_bytes())
        if args.mode == "plan":
            anchor = _storage_anchor(staging_root)
            url_digest = (
                _write_url_list(args.url_list, manifest["files"], staging_root)
                if args.url_list else None
            )
            payload = build_plan(
                manifest, manifest_sha256, staging_root,
                _parse_multiplier(args.free_space_multiplier),
                shutil.disk_usage(anchor).free,
                url_digest,
            )
            exit_code = 0 if payload["storage_ok"] else 3
        else:
            if args.url_list:
                raise StagingError("--url-list is only valid in plan mode")
            verified = verify_files(staging_root, manifest["files"])
            payload = build_verified_receipt(
                manifest, manifest_sha256, staging_root, verified
            )
            exit_code = 0
        if args.receipt:
            _write_json(args.receipt, payload, staging_root)
        sys.stdout.buffer.write(_canonical_json_bytes(payload))
        return exit_code
    except (OSError, StagingError) as error:
        sys.stderr.buffer.write(_canonical_json_bytes(_failure_payload(error)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
