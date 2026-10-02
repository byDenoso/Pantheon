"""Fail-closed gate for the frozen DESI source-materialization receipt.

This module validates only the small, hash-bound JSON receipt. It never reads or
downloads the 139.5 GB DESI selection and never emits a scientific verdict.
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request

BINDING_NAME = "desi_dr1_lss_selection_materialization_receipt"
RECEIPT_SCHEMA = "NEXO_DESI_LSS_SELECTION_MATERIALIZATION_RECEIPT_V1"
MANIFEST_SCHEMA = "NEXO_DESI_LSS_SELECTION_MANIFEST_V1"
MANIFEST_SHA256 = "6ce284a355085679eb528517746b247fa2c48902c6158ca556ae9c197b34c65a"
CAMPAIGN_ID = "RM-GZ01-GALAXY-3D-MAP-LIVE-V1"
WORK_ID = "WORK::GZ-01-B03-GALAXY-3D-MAP"
TEST_ID = "GZ01-B03-T03-WINDOW-ROTATION-NULL"
RECOVERY_WORK_ID = "WORK::RECOVERY-9ec8d79f540e5103bc62321946a2c4c8"
RECIPE_FAMILY = "desi_lss_selection_binding_family"
EXPECTED_FILE_COUNT = 160
EXPECTED_TOTAL_BYTES = 139_526_840_064
EXPECTED_TRACERS = ("BGS_ANY", "LRG", "ELG_LOPnotqso", "QSO")
EXPECTED_REGIONS = ("NGC", "SGC")
MAX_RECEIPT_BYTES = 2 * 1024 * 1024


class MaterializationReceiptError(ValueError):
    """The bound materialization receipt is absent, unavailable or invalid."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise MaterializationReceiptError(
            f"redirects are forbidden for frozen materialization receipt: {newurl}"
        )


def _valid_sha256(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def validate_receipt_binding(inputs: object) -> dict:
    if not isinstance(inputs, list):
        raise MaterializationReceiptError("frozen inputs must be a list")
    matches = [
        item for item in inputs
        if isinstance(item, dict) and item.get("name") == BINDING_NAME
    ]
    if len(matches) != 1:
        raise MaterializationReceiptError(
            "exactly one frozen DESI materialization-receipt binding is required"
        )
    binding = matches[0]
    url = binding.get("url")
    try:
        parsed = urllib.parse.urlsplit(url) if isinstance(url, str) else None
    except ValueError:
        parsed = None
    if (parsed is None or parsed.scheme != "https" or not parsed.netloc
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise MaterializationReceiptError(
            "materialization-receipt URL must be plain HTTPS without credentials, query or fragment"
        )
    if binding.get("version") != RECEIPT_SCHEMA:
        raise MaterializationReceiptError(
            "materialization-receipt version must equal its canonical schema"
        )
    if not _valid_sha256(binding.get("sha256")):
        raise MaterializationReceiptError(
            "materialization receipt needs a lowercase SHA256"
        )
    return binding


def validate_receipt_bytes(raw: bytes, expected_sha256: str) -> dict:
    if not isinstance(raw, bytes) or not raw or len(raw) > MAX_RECEIPT_BYTES:
        raise MaterializationReceiptError("materialization receipt has an invalid byte size")
    actual_sha256 = hashlib.sha256(raw).hexdigest()
    if actual_sha256 != expected_sha256:
        raise MaterializationReceiptError(
            f"materialization-receipt SHA256 mismatch: {actual_sha256}"
        )
    try:
        receipt = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise MaterializationReceiptError(
            f"materialization receipt is not valid JSON: {error}"
        ) from error
    expected_identity = {
        "schema": RECEIPT_SCHEMA,
        "execution_status": "MATERIALIZATION_VERIFIED",
        "scope": "SOURCE_MATERIALIZATION_ONLY",
        "roadmap_id": CAMPAIGN_ID,
        "work_id": WORK_ID,
        "test_id": TEST_ID,
        "recovery_work_id": RECOVERY_WORK_ID,
        "recipe_family": RECIPE_FAMILY,
        "local_bytes_verified": True,
        "work_ready": False,
        "test_ready": False,
        "scientific_result_eligible": False,
    }
    if not isinstance(receipt, dict) or any(
            receipt.get(key) != value for key, value in expected_identity.items()):
        raise MaterializationReceiptError(
            "materialization receipt identity/readiness flags are invalid"
        )
    expected_selection = {
        "schema": MANIFEST_SCHEMA,
        "sha256": MANIFEST_SHA256,
        "file_count": EXPECTED_FILE_COUNT,
        "total_bytes": EXPECTED_TOTAL_BYTES,
    }
    if receipt.get("selection_manifest") != expected_selection:
        raise MaterializationReceiptError(
            "materialization receipt does not bind the frozen 160-file selection"
        )
    verification = receipt.get("verification")
    expected_verification_flags = {
        "hash_algorithm": "sha256",
        "exact_filename_set": True,
        "regular_files_only": True,
        "symlinks_and_reparse_points_rejected": True,
        "extra_entries_rejected": True,
        "all_local_bytes_verified": True,
        "file_count": EXPECTED_FILE_COUNT,
        "total_bytes": EXPECTED_TOTAL_BYTES,
    }
    if not isinstance(verification, dict) or any(
            verification.get(key) != value
            for key, value in expected_verification_flags.items()):
        raise MaterializationReceiptError(
            "materialization receipt verification summary is invalid"
        )
    if not _valid_sha256(verification.get("files_index_sha256")):
        raise MaterializationReceiptError(
            "materialization receipt lacks a valid files-index SHA256"
        )
    files = receipt.get("files")
    if not isinstance(files, list) or len(files) != EXPECTED_FILE_COUNT:
        raise MaterializationReceiptError(
            "materialization receipt must contain exactly 160 verified files"
        )
    names = set()
    lines = []
    total_bytes = 0
    for item in files:
        if (not isinstance(item, dict) or set(item) != {"name", "size_bytes", "sha256"}
                or not isinstance(item.get("name"), str) or not item["name"]
                or "/" in item["name"] or "\\" in item["name"]
                or item["name"] in names
                or isinstance(item.get("size_bytes"), bool)
                or not isinstance(item.get("size_bytes"), int)
                or item["size_bytes"] <= 0
                or not _valid_sha256(item.get("sha256"))):
            raise MaterializationReceiptError(
                "materialization receipt contains an invalid file record"
            )
        names.add(item["name"])
        total_bytes += item["size_bytes"]
        lines.append(
            f"{item['sha256']}  {item['name']}  {item['size_bytes']}\n"
        )
    expected_names = set()
    for tracer in EXPECTED_TRACERS:
        for region in EXPECTED_REGIONS:
            expected_names.add(f"{tracer}_{region}_clustering.dat.fits")
            expected_names.add(f"{tracer}_{region}_nz.txt")
            expected_names.update(
                f"{tracer}_{region}_{index}_clustering.ran.fits"
                for index in range(18)
            )
    if names != expected_names:
        raise MaterializationReceiptError(
            "materialization receipt does not contain the exact T01 filename set"
        )
    if total_bytes != EXPECTED_TOTAL_BYTES:
        raise MaterializationReceiptError(
            "materialization receipt file sizes do not total the frozen selection"
        )
    files_index_sha256 = hashlib.sha256(
        "".join(sorted(lines, key=lambda line: line.split("  ")[1])).encode("utf-8")
    ).hexdigest()
    if files_index_sha256 != verification["files_index_sha256"]:
        raise MaterializationReceiptError(
            "materialization receipt files-index SHA256 is inconsistent"
        )
    scientific_status = receipt.get("scientific_status")
    if (not isinstance(scientific_status, dict)
            or scientific_status.get("status") != "PREPARED_PARTIAL_NOT_READY"
            or scientific_status.get("scientific_result_eligible") is not False
            or scientific_status.get("t03_dispatch_ready") is not False):
        raise MaterializationReceiptError(
            "materialization receipt must preserve T03 as not ready"
        )
    return receipt


def fetch_and_validate_receipt(inputs: object) -> tuple[dict, dict]:
    binding = validate_receipt_binding(inputs)
    opener = urllib.request.build_opener(_NoRedirect())
    request = urllib.request.Request(
        binding["url"], headers={"User-Agent": "NEXO-DESI-MATERIALIZATION-GATE/1"}
    )
    try:
        with opener.open(request, timeout=60) as response:
            raw = response.read(MAX_RECEIPT_BYTES + 1)
    except MaterializationReceiptError:
        raise
    except (OSError, urllib.error.URLError) as error:
        raise MaterializationReceiptError(
            f"cannot retrieve frozen materialization receipt: {error}"
        ) from error
    return binding, validate_receipt_bytes(raw, binding["sha256"])
