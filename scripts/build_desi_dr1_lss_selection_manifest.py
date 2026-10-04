#!/usr/bin/env python3
"""Build the frozen T01 DESI DR1 LSS selection manifest from official bytes.

The script is deliberately offline: callers must first retrieve the directory
index and checksum file from the official DESI release.  Both source files are
hash-pinned here, so an HTML or checksum-list change fails closed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re


BASE_URL = "https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/"
INDEX_SHA256 = "8957d496d448a3fa585aa43399ffeace6b9f90ba7624514fe37c917d1fce406b"
CHECKSUM_SHA256 = "7ca54da2370849ee92f20a8b7eb993b8d612f9d51658832e3f5d718735e01539"
CHECKSUM_NAME = "dr1_survey_catalogs_dr1_LSS_iron_LSScats_v1.5.sha256sum"
TRACERS = ("BGS_ANY", "LRG", "ELG_LOPnotqso", "QSO")
REGIONS = ("NGC", "SGC")
RANDOM_INDICES = tuple(range(18))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_checksums(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})\s+\*?(.+)", line.strip())
        if match:
            result[match.group(2)] = match.group(1)
    return result


def parse_sizes(text: str) -> dict[str, int]:
    result: dict[str, int] = {}
    pattern = re.compile(
        r'href="(?P<name>[^"]+)">.*?</a>\s+'
        r'\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}\s+(?P<size>\d+)'
    )
    for line in text.splitlines():
        match = pattern.search(line)
        if match:
            result[match.group("name")] = int(match.group("size"))
    return result


def expected_files() -> list[tuple[str, str, str, int | None]]:
    selected: list[tuple[str, str, str, int | None]] = []
    for tracer in TRACERS:
        for region in REGIONS:
            selected.append((f"{tracer}_{region}_clustering.dat.fits", "catalog", tracer, None))
            selected.append((f"{tracer}_{region}_nz.txt", "n_z", tracer, None))
            selected.extend(
                (f"{tracer}_{region}_{index}_clustering.ran.fits", "random", tracer, index)
                for index in RANDOM_INDICES
            )
    return selected


def build(index_path: Path, checksum_path: Path) -> dict:
    actual_index_hash = sha256(index_path)
    actual_checksum_hash = sha256(checksum_path)
    if actual_index_hash != INDEX_SHA256:
        raise ValueError(f"official index SHA256 mismatch: {actual_index_hash}")
    if actual_checksum_hash != CHECKSUM_SHA256:
        raise ValueError(f"official checksum-list SHA256 mismatch: {actual_checksum_hash}")

    sizes = parse_sizes(index_path.read_text(encoding="utf-8"))
    checksums = parse_checksums(checksum_path.read_text(encoding="utf-8"))
    files = []
    for name, role, tracer, random_index in expected_files():
        if name not in sizes:
            raise ValueError(f"selected file missing from official index: {name}")
        if name not in checksums:
            raise ValueError(f"selected file missing from official checksums: {name}")
        region = next(region for region in REGIONS if f"_{region}_" in name)
        item = {
            "name": name,
            "role": role,
            "tracer": tracer,
            "region": region,
            "url": BASE_URL + name,
            "version": "DESI DR1/iron/LSScats v1.5",
            "size_bytes": sizes[name],
            "sha256": checksums[name],
        }
        if random_index is not None:
            item["random_index"] = random_index
        files.append(item)

    role_counts = {role: sum(item["role"] == role for item in files) for role in ("catalog", "random", "n_z")}
    role_bytes = {
        role: sum(item["size_bytes"] for item in files if item["role"] == role)
        for role in ("catalog", "random", "n_z")
    }
    if role_counts != {"catalog": 8, "random": 144, "n_z": 8}:
        raise ValueError(f"unexpected selected role counts: {role_counts}")
    if len(files) != 160:
        raise ValueError(f"expected 160 selected files, found {len(files)}")

    return {
        "schema": "NEXO_DESI_LSS_SELECTION_MANIFEST_V1",
        "campaign_id": "RM-GZ01-GALAXY-3D-MAP-LIVE-V1",
        "selection_origin": "GZ01-B03-T01-SOURCE-AND-SELECTION",
        "release": {
            "survey": "DESI DR1",
            "production": "iron",
            "catalog_family": "LSScats",
            "catalog_version": "v1.5",
        },
        "selection": {
            "tracers": list(TRACERS),
            "regions": list(REGIONS),
            "randoms_per_tracer_region": len(RANDOM_INDICES),
            "includes_official_n_z": True,
        },
        "source_receipt": {
            "base_url": BASE_URL,
            "index_url": BASE_URL,
            "index_sha256": INDEX_SHA256,
            "checksum_url": BASE_URL + CHECKSUM_NAME,
            "checksum_sha256": CHECKSUM_SHA256,
            "hash_algorithm": "sha256",
        },
        "summary": {
            "file_count": len(files),
            "role_counts": role_counts,
            "role_bytes": role_bytes,
            "total_bytes": sum(item["size_bytes"] for item in files),
        },
        "materialization": {
            "status": "INPUT_PENDING_MATERIALIZATION",
            "all_local_bytes_verified": False,
            "scientific_result_eligible": False,
            "reason": "Official remote hashes are frozen; the 160 selected files have not all been materialized and read back locally.",
        },
        "files": files,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", required=True, type=Path)
    parser.add_argument("--checksums", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = build(args.index, args.checksums)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Commit identity must be platform-independent; write canonical LF bytes
    # rather than allowing Windows text-mode newline translation.
    encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    args.output.write_bytes(encoded)
    print(json.dumps(manifest["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
