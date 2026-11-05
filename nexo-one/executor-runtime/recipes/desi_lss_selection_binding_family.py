"""Selection-preserving 3D nulls for the DESI DR1 galaxy-map roadmap.

This recipe implements the statistical machinery for
``GZ01-B03-T03-WINDOW-ROTATION-NULL``.  It does not choose the still-missing
frozen extreme statistic and it never treats remote hashes as proof that the
full 160-file selection was materialized.  Production therefore requires a
hash-bound 3D product plus its complete source manifest.
"""

from __future__ import annotations

from io import BytesIO
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from scipy import ndimage


TEST_ID = "GZ01-B03-T03-WINDOW-ROTATION-NULL"
PREREG_HASH = "sha256:21d38d27b2ef12f17940fb9a01448c0ad3fe73950cb7e0352b1b0c11803b6069"
RECOVERY_WORK_ID = "WORK::RECOVERY-9ec8d79f540e5103bc62321946a2c4c8"
RECIPE_FAMILY = "desi_lss_selection_binding_family"
MANIFEST_SCHEMA = "NEXO_DESI_LSS_SELECTION_MANIFEST_V1"
PRODUCT_SCHEMA = "NEXO_DESI_LSS_3D_PRODUCT_V1"
EXPECTED_TRACERS = ["BGS_ANY", "LRG", "ELG_LOPnotqso", "QSO"]
EXPECTED_REGIONS = ["NGC", "SGC"]
REQUIRED_PROVENANCE_ROLES = {"catalog", "covariance", "randoms", "selection", "weights", "window"}
FROZEN_CRITERION = {
    "promote_p_emp_lte": 0.01,
    "bh_q": 0.1,
    "reject_all_p_emp_gte": 0.1,
}
VERDICT_PLAIN = {
    "PROMOTED": "Passou no critério",
    "REJECTED": "Não passou no critério",
    "INCONCLUSIVE": "Inconclusivo",
}

DESI_BASE = "https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/"
CHECKSUM_NAME = "dr1_survey_catalogs_dr1_LSS_iron_LSScats_v1.5.sha256sum"
INDEX_SHA256 = "8957d496d448a3fa585aa43399ffeace6b9f90ba7624514fe37c917d1fce406b"
CHECKSUM_SHA256 = "7ca54da2370849ee92f20a8b7eb993b8d612f9d51658832e3f5d718735e01539"
SMOKE_NZ_NAME = "BGS_ANY_NGC_nz.txt"
SMOKE_NZ_SHA256 = "1654453f2b481a979095e2c952272ecce3861042f895416781d4504511df0141"
NETWORK_ATTEMPTS = 3
NETWORK_RETRY_SECONDS = (1, 2)
RETRYABLE_HTTP_CODES = {408, 429, 500, 502, 503, 504}


class InputUnavailable(Exception):
    """A frozen input is absent, malformed or differs from its binding."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        raise InputUnavailable(f"redirects are forbidden for frozen inputs: {newurl}")


def _valid_sha256(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _validate_https_url(value: object) -> str:
    if not isinstance(value, str):
        raise InputUnavailable("frozen input URL must be a string")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise InputUnavailable("frozen input URL must be plain HTTPS without credentials, query or fragment")
    return value


def validate_binding(binding: object, *, expected_name: str | None = None) -> dict:
    if not isinstance(binding, dict):
        raise InputUnavailable("each frozen input binding must be an object")
    if not isinstance(binding.get("name"), str) or not binding["name"].strip():
        raise InputUnavailable("every frozen input needs a non-empty name")
    if expected_name is not None and binding.get("name") != expected_name:
        raise InputUnavailable(f"missing frozen input binding: {expected_name}")
    _validate_https_url(binding.get("url"))
    if not isinstance(binding.get("version"), str) or not binding["version"].strip():
        raise InputUnavailable("every frozen input needs a non-empty version")
    if not _valid_sha256(binding.get("sha256")):
        raise InputUnavailable("every frozen input needs a lowercase SHA256")
    return binding


def frozen_inputs() -> dict[str, dict]:
    path = os.environ.get("INPUTS_PATH")
    if not path:
        raise InputUnavailable("INPUTS_PATH is required; live fallback is forbidden")
    try:
        inputs = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise InputUnavailable(f"cannot read frozen input bindings: {error}") from error
    if not isinstance(inputs, list):
        raise InputUnavailable("frozen inputs must be a list")
    result: dict[str, dict] = {}
    for item in inputs:
        validate_binding(item)
        name = item.get("name")
        if not isinstance(name, str) or not name or name in result:
            raise InputUnavailable("frozen input names must be non-empty and unique")
        result[name] = item
    required = {"desi_dr1_lss_selection_manifest", "desi_dr1_lss_3d_map_product"}
    missing = required - set(result)
    if missing:
        raise InputUnavailable(f"missing frozen input bindings: {sorted(missing)}")
    return result


def verified_bytes(binding: dict) -> bytes:
    validate_binding(binding)
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(binding["url"], headers={"User-Agent": "NEXO-DESI-T03/1"})
    raw = None
    last_error = None
    for attempt in range(NETWORK_ATTEMPTS):
        try:
            with opener.open(request, timeout=180) as response:
                raw = response.read()
            break
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in RETRYABLE_HTTP_CODES:
                break
        except (OSError, urllib.error.URLError) as error:
            last_error = error
        if attempt < NETWORK_ATTEMPTS - 1:
            time.sleep(NETWORK_RETRY_SECONDS[attempt])
    if raw is None:
        raise InputUnavailable(
            f"cannot retrieve frozen input {binding['name']} after "
            f"{attempt + 1} attempt(s): {last_error}"
        ) from last_error
    actual = hashlib.sha256(raw).hexdigest()
    if actual != binding["sha256"]:
        raise InputUnavailable(f"SHA256 mismatch for frozen input {binding['name']}: {actual}")
    return raw


def validate_source_manifest(raw: bytes) -> dict:
    try:
        manifest = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputUnavailable(f"selection manifest is not valid JSON: {error}") from error
    if manifest.get("schema") != MANIFEST_SCHEMA:
        raise InputUnavailable("unexpected selection-manifest schema")
    release = manifest.get("release") or {}
    expected_release = {"survey": "DESI DR1", "production": "iron", "catalog_family": "LSScats", "catalog_version": "v1.5"}
    if release != expected_release:
        raise InputUnavailable("selection manifest changed the frozen DESI release")
    selection = manifest.get("selection") or {}
    if (selection.get("tracers") != EXPECTED_TRACERS or selection.get("regions") != EXPECTED_REGIONS
            or selection.get("randoms_per_tracer_region") != 18 or selection.get("includes_official_n_z") is not True):
        raise InputUnavailable("selection manifest changed the T01 tracer/region/random/n(z) contract")
    source = manifest.get("source_receipt") or {}
    if (source.get("base_url") != DESI_BASE or source.get("index_url") != DESI_BASE
            or source.get("index_sha256") != INDEX_SHA256
            or source.get("checksum_url") != DESI_BASE + CHECKSUM_NAME
            or source.get("checksum_sha256") != CHECKSUM_SHA256
            or source.get("hash_algorithm") != "sha256"):
        raise InputUnavailable("selection manifest source receipt differs from the frozen official index/checksum bytes")
    files = manifest.get("files")
    if not isinstance(files, list) or len(files) != 160:
        raise InputUnavailable("selection manifest must contain exactly 160 files")
    expected_files = {}
    for tracer in EXPECTED_TRACERS:
        for region in EXPECTED_REGIONS:
            catalog = f"{tracer}_{region}_clustering.dat.fits"
            n_z = f"{tracer}_{region}_nz.txt"
            expected_files[catalog] = {"role": "catalog", "tracer": tracer, "region": region}
            expected_files[n_z] = {"role": "n_z", "tracer": tracer, "region": region}
            for random_index in range(18):
                random = f"{tracer}_{region}_{random_index}_clustering.ran.fits"
                expected_files[random] = {"role": "random", "tracer": tracer, "region": region,
                                          "random_index": random_index}
    counts = {role: 0 for role in ("catalog", "random", "n_z")}
    lanes: dict[tuple[str, str], set[int]] = {}
    names = set()
    for item in files:
        if not isinstance(item, dict) or item.get("role") not in counts:
            raise InputUnavailable("selection manifest contains an invalid file record")
        name = item.get("name")
        if not isinstance(name, str) or name in names or name not in expected_files:
            raise InputUnavailable("selection manifest contains an unexpected or duplicate filename")
        names.add(name)
        expected = expected_files[name]
        if any(item.get(key) != value for key, value in expected.items()):
            raise InputUnavailable(f"selection manifest metadata differs from the filename contract: {name}")
        if item.get("url") != DESI_BASE + name:
            raise InputUnavailable(f"selection manifest file is not bound to the official DESI release URL: {name}")
        if not _valid_sha256(item.get("sha256")) or not isinstance(item.get("size_bytes"), int) or item["size_bytes"] <= 0:
            raise InputUnavailable("selection manifest file lacks size or SHA256")
        if item.get("version") != "DESI DR1/iron/LSScats v1.5":
            raise InputUnavailable("selection manifest file has an unexpected version")
        if item.get("tracer") not in EXPECTED_TRACERS or item.get("region") not in EXPECTED_REGIONS:
            raise InputUnavailable("selection manifest file is outside the T01 selection")
        counts[item["role"]] += 1
        if item["role"] == "random":
            index = item.get("random_index")
            if not isinstance(index, int):
                raise InputUnavailable("random record lacks an integer random_index")
            lanes.setdefault((item["tracer"], item["region"]), set()).add(index)
    if names != set(expected_files):
        raise InputUnavailable("selection manifest does not contain the exact T01 filename set")
    if counts != {"catalog": 8, "random": 144, "n_z": 8}:
        raise InputUnavailable(f"selection manifest has unexpected role counts: {counts}")
    if any(lanes.get((tracer, region)) != set(range(18)) for tracer in EXPECTED_TRACERS for region in EXPECTED_REGIONS):
        raise InputUnavailable("selection manifest does not have random indices 0..17 for every tracer/region")
    summary = manifest.get("summary") or {}
    total_bytes = sum(item["size_bytes"] for item in files)
    if (summary.get("file_count") != 160 or summary.get("role_counts") != counts
            or summary.get("total_bytes") != total_bytes):
        raise InputUnavailable("selection manifest summary does not match its file records")
    materialization = manifest.get("materialization") or {}
    if materialization.get("status") != "INPUT_PENDING_MATERIALIZATION" or materialization.get("all_local_bytes_verified") is not False:
        raise InputUnavailable("source manifest must not claim unperformed local materialization")
    return manifest


def _metadata_text(value: np.ndarray) -> str:
    if value.shape != ():
        raise InputUnavailable("product metadata_json must be a scalar")
    item = value.item()
    if isinstance(item, bytes):
        return item.decode("utf-8")
    if isinstance(item, str):
        return item
    raise InputUnavailable("product metadata_json must be UTF-8 text")


def validate_product(raw: bytes, manifest_sha256: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    try:
        with np.load(BytesIO(raw), allow_pickle=False) as archive:
            required = {"delta", "valid_mask", "selection_stratum", "radial_bin", "angular_selection_bin", "metadata_json"}
            if required - set(archive.files):
                raise InputUnavailable(f"3D product lacks arrays: {sorted(required - set(archive.files))}")
            raw_delta = np.asarray(archive["delta"])
            raw_valid = np.asarray(archive["valid_mask"])
            raw_strata = np.asarray(archive["selection_stratum"])
            raw_radial = np.asarray(archive["radial_bin"])
            raw_angular = np.asarray(archive["angular_selection_bin"])
            if raw_delta.dtype.kind not in "fiu":
                raise InputUnavailable("delta must have a real numeric dtype")
            if raw_valid.dtype.kind != "b":
                raise InputUnavailable("valid_mask must have boolean dtype; implicit conversion is forbidden")
            if any(array.dtype.kind not in "iu" for array in (raw_strata, raw_radial, raw_angular)):
                raise InputUnavailable("selection_stratum/radial_bin/angular_selection_bin must have integer dtype")
            delta = raw_delta.astype(np.float64, copy=False)
            valid = raw_valid.astype(bool, copy=False)
            strata = raw_strata.astype(np.int64, copy=False)
            radial_bins = raw_radial.astype(np.int64, copy=False)
            angular_bins = raw_angular.astype(np.int64, copy=False)
            metadata = json.loads(_metadata_text(archive["metadata_json"]))
    except InputUnavailable:
        raise
    except (OSError, ValueError, KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InputUnavailable(f"3D product is not a valid NPZ contract: {error}") from error
    if (delta.ndim != 3 or any(array.shape != delta.shape for array in (valid, strata, radial_bins, angular_bins))
            or min(delta.shape) < 2):
        raise InputUnavailable("all product arrays must share a non-trivial 3D shape")
    if np.count_nonzero(valid) < 16 or not np.all(np.isfinite(delta[valid])):
        raise InputUnavailable("3D product needs at least 16 finite valid cells")
    if np.any(strata[valid] < 0):
        raise InputUnavailable("valid cells require non-negative selection strata")
    if np.any(radial_bins[valid] < 0) or np.any(angular_bins[valid] < 0):
        raise InputUnavailable("valid cells require non-negative radial and angular selection bins")
    for stratum in np.unique(strata[valid]):
        inside = valid & (strata == stratum)
        if len(np.unique(radial_bins[inside])) != 1 or len(np.unique(angular_bins[inside])) != 1:
            raise InputUnavailable("each selection stratum must be contained within one radial and one angular-selection bin")
        if np.count_nonzero(inside) < 2:
            raise InputUnavailable("each selection stratum needs at least two cells for a valid permutation null")
    if not isinstance(metadata, dict) or metadata.get("schema") != PRODUCT_SCHEMA:
        raise InputUnavailable("unexpected 3D product schema")
    if metadata.get("source_manifest_sha256") != manifest_sha256:
        raise InputUnavailable("3D product was not built from the bound selection manifest")
    if metadata.get("grid_shape") != list(delta.shape):
        raise InputUnavailable("3D product grid_shape does not match its arrays")
    selection = metadata.get("selection") or {}
    if (selection.get("tracers") != EXPECTED_TRACERS or selection.get("regions") != EXPECTED_REGIONS
            or selection.get("randoms_per_tracer_region") != 18 or selection.get("includes_official_n_z") is not True):
        raise InputUnavailable("3D product changed the frozen T01 selection")
    preservation = set((metadata.get("null_strata") or {}).get("preserves") or [])
    if not {"n_z", "footprint", "selection"}.issubset(preservation):
        raise InputUnavailable("selection_stratum must explicitly preserve n_z, footprint and selection")
    coordinate = metadata.get("coordinate_frame")
    if (not isinstance(coordinate, dict) or not isinstance(coordinate.get("name"), str)
            or not coordinate["name"].strip() or not isinstance(coordinate.get("distance_unit"), str)
            or not coordinate["distance_unit"].strip() or not isinstance(coordinate.get("cosmology"), dict)
            or not coordinate["cosmology"]):
        raise InputUnavailable("3D product must freeze coordinate-frame name, distance unit and cosmology")
    voxelization = metadata.get("voxelization")
    if not isinstance(voxelization, dict) or not isinstance(voxelization.get("assignment"), str) or not voxelization["assignment"].strip():
        raise InputUnavailable("3D product must freeze its voxel assignment")
    origin = voxelization.get("origin")
    cell_size = voxelization.get("cell_size")
    if (not isinstance(origin, list) or len(origin) != 3
            or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and np.isfinite(value) for value in origin)
            or not isinstance(cell_size, list) or len(cell_size) != 3
            or not all(isinstance(value, (int, float)) and not isinstance(value, bool)
                       and np.isfinite(value) and value > 0 for value in cell_size)):
        raise InputUnavailable("3D product must freeze finite origin[3] and positive cell_size[3]")
    role_bindings = metadata.get("provenance_bindings")
    if not isinstance(role_bindings, dict) or set(role_bindings) != REQUIRED_PROVENANCE_ROLES:
        raise InputUnavailable("3D product must bind catalog/covariance/randoms/selection/weights/window roles")
    for role, items in role_bindings.items():
        if not isinstance(items, list) or not items:
            raise InputUnavailable(f"provenance role {role} has no concrete binding")
        for item in items:
            validate_binding(item)
    return delta, valid, strata, metadata


def validate_params(params: object) -> dict:
    if not isinstance(params, dict):
        raise ValueError("params must be an object")
    allowed = {"mode", "test_id", "prereg_hash", "null_method", "null_count", "seed", "statistics", "criterion"}
    unknown = set(params) - allowed
    if unknown:
        raise ValueError(f"unknown frozen parameters: {sorted(unknown)}")
    if params.get("mode") != "window_rotation_null":
        raise ValueError("production mode must be window_rotation_null")
    if params.get("test_id") != TEST_ID or params.get("prereg_hash") != PREREG_HASH:
        raise ValueError("test_id/prereg_hash do not match the recorded T03 contract")
    if params.get("null_method") != "selection_stratified_permutation":
        raise ValueError("supported null_method is selection_stratified_permutation")
    null_count = params.get("null_count")
    if isinstance(null_count, bool) or not isinstance(null_count, int) or null_count < 100:
        raise ValueError("null_count must be an integer >=100")
    seed = params.get("seed")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**63:
        raise ValueError("seed must be a frozen integer in [0, 2^63)")
    if params.get("criterion") != FROZEN_CRITERION:
        raise ValueError("criterion must exactly preserve p_emp<=0.01, BH q=0.1 and all-p_emp>=0.1")
    statistics = params.get("statistics")
    if not isinstance(statistics, list) or not statistics:
        raise ValueError("statistics must freeze at least one extreme statistic")
    names = []
    for spec in statistics:
        if not isinstance(spec, dict) or not isinstance(spec.get("name"), str):
            raise ValueError("every statistic must be a named object")
        name = spec["name"]
        names.append(name)
        if name == "max_abs_gaussian_smoothed_delta":
            if set(spec) != {"name", "sigma_cells"} or not isinstance(spec["sigma_cells"], (int, float)) or isinstance(spec["sigma_cells"], bool) or not 0 < float(spec["sigma_cells"]) <= 20:
                raise ValueError("max_abs_gaussian_smoothed_delta requires 0<sigma_cells<=20")
        elif name == "largest_abs_excursion_component":
            if set(spec) != {"name", "abs_delta_gte", "connectivity"}:
                raise ValueError("largest_abs_excursion_component requires abs_delta_gte and connectivity")
            if not isinstance(spec["abs_delta_gte"], (int, float)) or isinstance(spec["abs_delta_gte"], bool) or not float(spec["abs_delta_gte"]) > 0:
                raise ValueError("abs_delta_gte must be positive")
            if isinstance(spec["connectivity"], bool) or spec["connectivity"] not in (1, 2, 3):
                raise ValueError("connectivity must be 1, 2 or 3")
        else:
            raise ValueError(f"unsupported extreme statistic: {name}")
    if len(names) != len(set(names)):
        raise ValueError("extreme statistic names must be unique")
    return params


def selection_preserving_permutation(delta: np.ndarray, valid: np.ndarray, strata: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    permuted = np.zeros(delta.shape, dtype=np.float64)
    for stratum in np.unique(strata[valid]):
        positions = np.flatnonzero(valid & (strata == stratum))
        flat_values = delta.ravel()[positions]
        permuted.ravel()[positions] = rng.permutation(flat_values)
    return permuted


def statistic_value(delta: np.ndarray, valid: np.ndarray, spec: dict) -> float:
    if spec["name"] == "max_abs_gaussian_smoothed_delta":
        sigma = float(spec["sigma_cells"])
        numerator = ndimage.gaussian_filter(np.where(valid, delta, 0.0), sigma=sigma, mode="constant", cval=0.0)
        denominator = ndimage.gaussian_filter(valid.astype(np.float64), sigma=sigma, mode="constant", cval=0.0)
        smoothed = np.divide(numerator, denominator, out=np.zeros_like(numerator), where=denominator > 1e-12)
        return float(np.max(np.abs(smoothed[valid])))
    active = valid & (np.abs(delta) >= float(spec["abs_delta_gte"]))
    labels, count = ndimage.label(active, structure=ndimage.generate_binary_structure(3, int(spec["connectivity"])))
    if count == 0:
        return 0.0
    sizes = np.bincount(labels.ravel())[1:]
    return float(np.max(sizes))


def bh_rejections(p_values: dict[str, float], q: float) -> list[str]:
    ordered = sorted(p_values.items(), key=lambda item: (item[1], item[0]))
    cutoff = -1
    total = len(ordered)
    for index, (_, value) in enumerate(ordered, start=1):
        if value <= index * q / total:
            cutoff = index
    return sorted(name for name, _ in ordered[:cutoff]) if cutoff > 0 else []


def frozen_decision(p_values: dict[str, float]) -> tuple[str, str, str, list[str]]:
    rejected = bh_rejections(p_values, FROZEN_CRITERION["bh_q"])
    if any(value <= FROZEN_CRITERION["promote_p_emp_lte"] and name in rejected for name, value in p_values.items()):
        return "PROMOTED", "EXTREME_SURVIVES_SELECTION_NULL", "Pelo menos uma estatística extrema congelada teve p_emp<=0,01 e passou pela correção BH com q=0,1. O extremo não foi reproduzido pelos nulos que preservam a seleção.", rejected
    if all(value >= FROZEN_CRITERION["reject_all_p_emp_gte"] for value in p_values.values()):
        return "REJECTED", "EXTREMES_REPRODUCED_BY_SELECTION_NULL", "Todas as estatísticas congeladas tiveram p_emp>=0,1. Os extremos foram reproduzidos pelos nulos que preservam a seleção.", rejected
    return "INCONCLUSIVE", "INTERMEDIATE_SELECTION_NULL", "Os valores p congelados ficaram entre os critérios de sucesso e descarte. O teste não decide entre estrutura real e efeito da seleção.", rejected


def production_run(params: dict) -> dict:
    params = validate_params(params)
    inputs = frozen_inputs()
    manifest_binding = validate_binding(inputs["desi_dr1_lss_selection_manifest"], expected_name="desi_dr1_lss_selection_manifest")
    product_binding = validate_binding(inputs["desi_dr1_lss_3d_map_product"], expected_name="desi_dr1_lss_3d_map_product")
    manifest_raw = verified_bytes(manifest_binding)
    manifest = validate_source_manifest(manifest_raw)
    delta, valid, strata, metadata = validate_product(verified_bytes(product_binding), manifest_binding["sha256"])

    observed = {spec["name"]: statistic_value(delta, valid, spec) for spec in params["statistics"]}
    nulls = {name: [] for name in observed}
    rng = np.random.default_rng(params["seed"])
    for _ in range(params["null_count"]):
        sample = selection_preserving_permutation(delta, valid, strata, rng)
        for spec in params["statistics"]:
            nulls[spec["name"]].append(statistic_value(sample, valid, spec))
    p_values = {
        name: (1.0 + sum(value >= observed[name] for value in values)) / (params["null_count"] + 1.0)
        for name, values in nulls.items()
    }
    verdict, decision, meaning, rejected = frozen_decision(p_values)
    statistics = {
        "test_id": TEST_ID,
        "prereg_hash": PREREG_HASH,
        "recovery_work_id": RECOVERY_WORK_ID,
        "null_method": params["null_method"],
        "null_count": params["null_count"],
        "seed": params["seed"],
        "observed": observed,
        "empirical_p": p_values,
        "bh_rejections_q_0_1": rejected,
        "null_distributions": nulls,
        "criterion": FROZEN_CRITERION,
        "valid_cells": int(np.count_nonzero(valid)),
        "selection_strata": int(len(np.unique(strata[valid]))),
        "input_provenance": {
            "scope": "FROZEN_INPUT_BYTES_VERIFIED",
            "selection_manifest": manifest_binding,
            "map_product": product_binding,
            "selection_file_count": manifest["summary"]["file_count"],
            "selection_total_bytes": manifest["summary"]["total_bytes"],
            "product_metadata": metadata,
        },
    }
    return {
        "verdict": verdict,
        "decision": decision,
        "summary": f"Nulo 3D do DESI DR1 com seleção preservada: {VERDICT_PLAIN[verdict]}, usando {params['null_count']} realizações.",
        "statistics": statistics,
        "semantic": {"result_meaning": meaning, "verdict_plain": VERDICT_PLAIN[verdict]},
    }


def provenance_smoke() -> dict:
    if os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS") == "1":
        raise InputUnavailable("provenance_smoke is forbidden in a production battery")
    checksum_binding = {"name": "official_checksum_list", "url": DESI_BASE + CHECKSUM_NAME,
                        "version": "DESI DR1/iron/LSScats v1.5", "sha256": CHECKSUM_SHA256}
    nz_binding = {"name": "official_bgs_any_ngc_n_z", "url": DESI_BASE + SMOKE_NZ_NAME,
                  "version": "DESI DR1/iron/LSScats v1.5", "sha256": SMOKE_NZ_SHA256}
    checksum_raw = verified_bytes(checksum_binding)
    expected_line = f"{SMOKE_NZ_SHA256}  {SMOKE_NZ_NAME}".encode()
    if expected_line not in checksum_raw.splitlines():
        raise InputUnavailable("official checksum list no longer contains the frozen n(z) record")
    nz_raw = verified_bytes(nz_binding)
    if len(nz_raw.splitlines()) < 2:
        raise InputUnavailable("official n(z) smoke input is unexpectedly empty")
    return {
        "verdict": "INCONCLUSIVE",
        "decision": "PROVENANCE_SMOKE_ONLY",
        "summary": "A lista oficial de hashes do DESI DR1 v1.5 e um arquivo n(z) passaram na verificação de bytes; nenhuma execução científica foi feita.",
        "statistics": {
            "recipe_family": RECIPE_FAMILY,
            "test_id": TEST_ID,
            "scientific_result_eligible": False,
            "binding_status": "INPUT_PENDING_MATERIALIZATION",
            "verified_inputs": [checksum_binding, nz_binding],
        },
        "semantic": {"result_meaning": "A lista oficial de hashes e um arquivo n(z) passaram na verificação de bytes. Foi apenas um teste de preparação; não houve resultado científico e o teste continua bloqueado.", "verdict_plain": "Inconclusivo"},
    }


def run(params: dict) -> dict:
    if params.get("mode") == "provenance_smoke":
        if set(params) != {"mode"}:
            raise ValueError("provenance_smoke accepts only mode")
        return provenance_smoke()
    return production_run(params)


def main() -> None:
    exit_code = 0
    try:
        params = json.loads(Path(os.environ["PARAMS_PATH"]).read_text(encoding="utf-8"))
        payload = run(params)
    except (InputUnavailable, OSError, ValueError, KeyError, json.JSONDecodeError, np.linalg.LinAlgError) as error:
        exit_code = 1
        payload = {
            "execution_status": "INPUT_OR_FIT_UNAVAILABLE",
            "error": str(error),
            "statistics": {"recipe_family": RECIPE_FAMILY, "test_id": TEST_ID, "prereg_hash": PREREG_HASH},
        }
    Path(os.environ["RESULT_PATH"]).write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(payload.get("summary") or payload.get("error"))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
