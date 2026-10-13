"""Pure admission checks for the existing public Actions runner.

Canonical authority remains in the Writer/package endpoint. These checks bind
the plan and every shard to the same bytes and prevent private/inline payloads
from entering a public runner. They never change a scientific contract.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlsplit

CANARY_ID = "bat-runner-canary-1"
CANARY_RECIPES = frozenset({"runner_numeric_canary", "astropy_dependency_canary", "camb_dependency_canary"})
SHA = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("PACKAGE_DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _nonfinite(_):
    raise ValueError("PACKAGE_NONFINITE_JSON")


def public_input(value, *, canonical):
    if not isinstance(value, dict) or value.get("public") is False or (canonical and value.get("public") is not True):
        return False
    digest = str(value.get("sha256") or "").removeprefix("sha256:")
    if not SHA.fullmatch(digest):
        return False
    if value.get("kind") == "generated":
        return bool(value.get("generator")) and type(value.get("seed")) is int
    if not value.get("version"):
        return False
    try:
        url = urlsplit(value.get("url") or value.get("source_url") or "")
        if url.scheme != "https" or not url.hostname or any((url.username, url.password, url.fragment)):
            return False
        if canonical and url.query:
            return False
        # Older public dataset selectors used query parameters. Preserve those
        # without forwarding credentials or signed private URLs to public jobs.
        auth = {"token", "access_token", "api_key", "apikey", "authorization", "sig", "signature", "sas"}
        return not any(key.lower() in auth or key.lower().startswith(("x-amz-", "x-goog-"))
                       for key, _ in parse_qsl(url.query))
    except ValueError:
        return False


def recipe_revision(test, *, transport, workflow_revision):
    revision = test.get("recipe_revision")
    if COMMIT.fullmatch(revision or ""):
        return revision
    if not revision and transport == "LEGACY_GIT_SPEC" and COMMIT.fullmatch(workflow_revision or ""):
        # Exact historical recipe_sha256 is still checked against this frozen
        # checkout before execution. This selects no moving branch or new code.
        return workflow_revision
    raise ValueError("FROZEN_RECIPE_REVISION_REQUIRED")


def read_package(path, battery_id, *, fixture=False, transport="CANONICAL_DRIVE_PACKAGE", workflow_revision=None,
                 expected_sha256=None):
    raw = Path(path).read_bytes()
    if not 1 <= len(raw) <= 262144:
        raise ValueError("PACKAGE_SIZE_INVALID")
    digest = hashlib.sha256(raw).hexdigest()
    if expected_sha256 is not None and (not SHA.fullmatch(expected_sha256) or digest != expected_sha256):
        raise ValueError("PACKAGE_CHANGED_AFTER_PLAN")
    spec = json.loads(raw, object_pairs_hook=_pairs, parse_constant=_nonfinite)
    if not isinstance(spec, dict):
        raise ValueError("PACKAGE_OBJECT_REQUIRED")
    identity = spec.get("battery_id") or spec.get("id")
    if not re.fullmatch(r"[a-z0-9-]{3,48}", battery_id or "") or identity != battery_id:
        raise ValueError("PACKAGE_IDENTITY_INVALID")
    if fixture:
        if battery_id != CANARY_ID or spec.get("source") != "VERSIONED_CI_FIXTURE" or spec.get("status") != "CI_FIXTURE":
            raise ValueError("FIXED_CI_CANARY_REQUIRED")
    elif transport == "CANONICAL_DRIVE_PACKAGE":
        if spec.get("schema") != "NEXO_SCIENTIFIC_PACKAGE_V1" or not COMMIT.fullmatch(spec.get("source_revision") or ""):
            raise ValueError("CANONICAL_PACKAGE_REQUIRED")
        if workflow_revision is not None and spec["source_revision"] != workflow_revision:
            raise ValueError("WORKFLOW_REVISION_MISMATCH")
    elif transport == "LEGACY_GIT_SPEC":
        # Only the old Writer's committed reservation format is compatible.
        # Switching the workflow default must not silently reroute these items.
        if spec.get("status") not in {"DISPATCH_PENDING", "DISPATCHED", "RUNNING"} or spec.get("mandate_id"):
            raise ValueError("LEGACY_WRITER_RESERVATION_REQUIRED")
    else:
        raise ValueError("PACKAGE_TRANSPORT_INVALID")
    tests = spec.get("tests")
    parallelism = spec.get("parallelism", 20)
    if not isinstance(tests, list) or not 1 <= len(tests) <= 20 or type(parallelism) is not int or not 1 <= parallelism <= 20:
        raise ValueError("PACKAGE_CAPACITY_INVALID")
    if not fixture and transport == "CANONICAL_DRIVE_PACKAGE" and parallelism not in {1, 2, 4}:
        raise ValueError("UNMEASURED_CAPACITY")
    seen = set()
    for test in tests:
        if not isinstance(test, dict):
            raise ValueError("PACKAGE_TEST_INVALID")
        identity = test.get("test_id")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,160}", identity) or identity in seen:
            raise ValueError("PACKAGE_TEST_IDENTITY_INVALID")
        seen.add(identity)
        recipe = test.get("recipe")
        if not isinstance(recipe, str) or not re.fullmatch(r"[a-z0-9_]{2,40}", recipe) or test.get("script"):
            raise ValueError("PUBLIC_RECIPE_ONLY")
        if test.get("private") or str(test.get("domain") or "").upper() in {"PEER", "OLYMPUS"}:
            raise ValueError("PRIVATE_SCIENCE_REFUSED")
        if not isinstance(test.get("params"), dict):
            raise ValueError("RECIPE_PARAMS_REQUIRED")
        if fixture:
            if recipe not in CANARY_RECIPES:
                raise ValueError("FIXED_CI_CANARY_REQUIRED")
        else:
            recipe_revision(test, transport=transport, workflow_revision=workflow_revision)
            if (not SHA.fullmatch(test.get("recipe_sha256") or "")
                    or not re.fullmatch(r"attempt-[0-9a-f]{32}", test.get("attempt_id") or "")):
                raise ValueError("FROZEN_EXECUTION_BINDING_REQUIRED")
            inputs = test.get("inputs")
            if not isinstance(inputs, list) or not inputs or not all(public_input(row, canonical=transport == "CANONICAL_DRIVE_PACKAGE") for row in inputs):
                raise ValueError("FROZEN_PUBLIC_INPUTS_REQUIRED")
    return spec, digest
