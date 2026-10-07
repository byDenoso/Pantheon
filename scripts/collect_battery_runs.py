"""Paginated, replay-safe collector for completed Writer battery runs.

The checked-in public inbox cursor is also the durable battery-run ledger. A
run/attempt is acknowledged only when the canonical Tower readback contains
both the Writer envelope receipt for the exact collected payload and the
matching terminal battery record.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import urllib.parse
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    from scripts.github_api_read import read_api_json
except ModuleNotFoundError:  # direct `python scripts/collect_battery_runs.py`
    from github_api_read import read_api_json

RECEIPT_CONTRACT = "OPERATION_RECEIPT_V1"
BATTERY_CURSOR_CONTRACT = "BATTERY_RUN_CURSOR_V1"
TERMINAL_OUTCOMES = {"APPLIED", "ALREADY_APPLIED"}
PER_PAGE = 100
MAX_RUNS_PER_CYCLE = 20
BATTERY_ID = re.compile(r"^[a-z0-9-]{3,48}$")
# A conservative lower bound for GitHub Actions history. Starting at the
# current date would make the latest-page poll appear complete while silently
# excluding older runs from durable backfill.
MIN_SCAN_DATE = date(2018, 10, 1)


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def writer_payload_sha256(update: dict) -> str:
    """Mirror the Writer envelope hash after trusted transport metadata is removed."""
    if not isinstance(update, dict) or set(update) != {"kind", "source", "payload"}:
        raise ValueError("BATTERY_UPDATE_ENVELOPE_INVALID")
    return _sha256(_canonical({"contract": RECEIPT_CONTRACT, "payload": update}))


def run_key(run_id, run_attempt) -> str:
    run_id, run_attempt = int(run_id), int(run_attempt)
    if run_id <= 0 or run_attempt <= 0:
        raise ValueError("BATTERY_RUN_ID_INVALID")
    return f"{run_id}:{run_attempt}"


def _title(run: dict) -> str:
    return str(run.get("display_title") or run.get("displayTitle") or run.get("name") or "").strip()


def battery_id_from_run(run: dict) -> str:
    title = _title(run)
    match = re.fullmatch(r"battery\s+([a-z0-9-]{3,48})", title, flags=re.IGNORECASE)
    return match.group(1).lower() if match else ""


def valid_battery_run(run: dict) -> bool:
    return (isinstance(run, dict)
            and str(run.get("event") or "") == "workflow_dispatch"
            and bool(battery_id_from_run(run))
            and str(run.get("id") or run.get("databaseId") or "").isdigit()
            and str(run.get("run_attempt") or "").isdigit())


def eligible_run(run: dict) -> bool:
    return valid_battery_run(run) and str(run.get("status") or "") == "completed"


def page_url(repo: str, *, page: int, per_page: int = PER_PAGE, created: str = "") -> str:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("GITHUB_REPOSITORY_INVALID")
    if page < 1 or per_page < 1 or per_page > 100:
        raise ValueError("RUN_PAGE_INVALID")
    # Do not filter by status: a run changing from in-progress to completed
    # would otherwise disappear from the page set and shift numeric offsets.
    values = {"per_page": per_page, "page": page}
    if created:
        values["created"] = created
    query = urllib.parse.urlencode(values)
    return f"https://api.github.com/repos/{repo}/actions/workflows/nexo-test-battery.yml/runs?{query}"


def _load_page(api, repo: str, *, page: int, per_page: int = PER_PAGE, created: str = ""):
    payload = api(page_url(repo, page=page, per_page=per_page, created=created))
    rows = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("GITHUB_BATTERY_RUN_PAGE_INVALID")
    try:
        total = int(payload.get("total_count") or 0)
    except (TypeError, ValueError):
        raise RuntimeError("GITHUB_BATTERY_RUN_TOTAL_INVALID") from None
    return rows, total, total > page * per_page


def _cursor_state(cursor: dict) -> dict:
    state = cursor.setdefault("battery_runs", {})
    if not isinstance(state, dict):
        raise ValueError("BATTERY_RUN_CURSOR_INVALID")
    state.setdefault("contract", BATTERY_CURSOR_CONTRACT)
    if state["contract"] != BATTERY_CURSOR_CONTRACT:
        raise ValueError("BATTERY_RUN_CURSOR_CONTRACT_INVALID")
    state.setdefault("acknowledged", {})
    state.setdefault("pending", {})
    state.setdefault("scan", {"next_page": 1, "window": _current_scan_window(), "window_queue": []})
    if not all(isinstance(state.get(key), dict) for key in ("acknowledged", "pending", "scan")):
        raise ValueError("BATTERY_RUN_CURSOR_INVALID")
    page = state["scan"].get("next_page", 1)
    if type(page) is not int or page < 1:
        raise ValueError("BATTERY_RUN_CURSOR_PAGE_INVALID")
    if not isinstance(state["scan"].get("window"), dict):
        raise ValueError("BATTERY_RUN_CURSOR_WINDOW_INVALID")
    state["scan"].setdefault("window_queue", [])
    if not isinstance(state["scan"]["window_queue"], list):
        raise ValueError("BATTERY_RUN_CURSOR_WINDOW_QUEUE_INVALID")
    return state


def _current_scan_window(today: date | None = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    start = max(date(today.year, 1, 1), MIN_SCAN_DATE)
    end = today
    now = datetime.now(timezone.utc)
    through = (now.strftime("%Y-%m-%dT%H:%M:%SZ")
               if today == now.date()
               else end.strftime("%Y-%m-%dT23:59:59Z"))
    return {"start": start.isoformat(), "end": end.isoformat(), "through": through}


def _run_metadata(run: dict) -> dict:
    run_id = int(run.get("id") or run.get("databaseId"))
    attempt = int(run["run_attempt"])
    return {"run_id": run_id, "run_attempt": attempt, "run_key": run_key(run_id, attempt),
            "battery_id": battery_id_from_run(run), "run_ref": f"actions/runs/{run_id}",
            "created_at": str(run.get("created_at") or run.get("createdAt") or ""),
            "updated_at": str(run.get("updated_at") or run.get("updatedAt") or "")}


def collect_run_pages(repo: str, cursor: dict, api=read_api_json, *, per_page: int = PER_PAGE):
    """Read a recent page and one checkpointed weekly discovery page."""
    state = _cursor_state(cursor)
    page = state["scan"]["next_page"]
    recent, _, _ = _load_page(api, repo, page=1, per_page=per_page)
    window = state["scan"]["window"]
    window_start = date.fromisoformat(str(window["start"]))
    window_end = date.fromisoformat(str(window["end"]))
    if window_start > window_end or window_start < MIN_SCAN_DATE:
        raise ValueError("BATTERY_RUN_CURSOR_WINDOW_INVALID")
    through = str(window.get("through") or (window_end.isoformat() + "T23:59:59Z"))
    created = f"{window_start.isoformat()}T00:00:00Z..{through}"
    backfill, total, has_more = _load_page(api, repo, page=page, per_page=per_page, created=created)
    # Treat the cap itself as saturation: the REST result count may stop at
    # 1,000, so equality cannot prove the date window is complete.
    overflow = total >= 1000
    split_windows = []
    if overflow:
        if window_start == window_end:
            raise RuntimeError("GITHUB_BATTERY_DAILY_WINDOW_AT_CAP_1000")
        midpoint = window_start + timedelta(days=(window_end - window_start).days // 2)
        split_windows = [
            {"start": (midpoint + timedelta(days=1)).isoformat(), "end": window_end.isoformat(),
             "through": through},
            {"start": window_start.isoformat(), "end": midpoint.isoformat(),
             "through": midpoint.strftime("%Y-%m-%dT23:59:59Z")},
        ]
        backfill = []
    # A fixed created-time anchor prevents new runs from shifting historical
    # pages. Status is filtered client-side, so running jobs cannot shift offsets.
    by_key = {}
    for run in ([] if overflow else backfill) + recent:
        if valid_battery_run(run):
            metadata = _run_metadata(run)
            by_key.setdefault(metadata["run_key"], (metadata, run))
    acknowledged = state["acknowledged"]
    # Keep rejected attempts in the durable ledger, but never spend retry or
    # discovery capacity on the same terminally rejected identity. A new
    # run_attempt has its own key and remains discoverable. A global Tower
    # revision or a GitHub timestamp change is not proof that rejection of
    # this payload has been resolved.
    rejected_keys = {key for key, saved in state["pending"].items()
                     if isinstance(saved, dict) and saved.get("reason") == "REJECTED_TERMINAL"}
    ordered = sorted((pair for pair in by_key.values() if eligible_run(pair[1])),
                     key=lambda pair: (pair[0]["created_at"], pair[0]["run_id"], pair[0]["run_attempt"]))
    pending_candidates = []
    superseded = {}
    pending_deferred = {}
    retryable_pending = []
    for key, saved in state["pending"].items():
        if (key in acknowledged or key in rejected_keys or not isinstance(saved, dict)
                or saved.get("superseded_by_attempt")):
            continue
        try:
            run_id, attempt = (int(part) for part in key.split(":"))
        except (TypeError, ValueError):
            continue
        if run_id <= 0 or attempt <= 0:
            continue
        retryable_pending.append((key, saved))
    pending_rows = sorted(retryable_pending,
                          key=lambda pair: str(pair[1].get("last_attempted_at") or ""))
    for key, saved in pending_rows[:MAX_RUNS_PER_CYCLE // 2]:
        try:
            run_id, attempt = (int(part) for part in key.split(":"))
        except (TypeError, ValueError):
            continue
        run = api(f"https://api.github.com/repos/{repo}/actions/runs/{run_id}")
        current_attempt = int(run.get("run_attempt") or 0)
        if current_attempt != attempt:
            replacement = None
            if (str(run.get("event") or "") == "workflow_dispatch"
                    and battery_id_from_run(run)
                    and str(run.get("id") or "").isdigit()
                    and str(run.get("run_attempt") or "").isdigit()):
                replacement = _run_metadata(run)
                if eligible_run(run) and replacement["run_key"] not in rejected_keys:
                    pending_candidates.append((replacement, run))
            superseded[key] = {**saved, "superseded_by_attempt": current_attempt,
                               "replacement": replacement,
                               "reason": "RUN_ATTEMPT_SUPERSEDED"}
        elif eligible_run(run):
            pending_candidates.append((_run_metadata(run), run))
        elif valid_battery_run(run):
            pending_deferred[key] = {**saved, **_run_metadata(run), "reason": "RUN_NOT_COMPLETED"}

    pending_keys = {metadata["run_key"] for metadata, _ in pending_candidates}
    fresh = [(metadata, run) for metadata, run in ordered
             if metadata["run_key"] not in acknowledged and metadata["run_key"] not in pending_keys
             and metadata["run_key"] not in rejected_keys]
    selected = pending_candidates[:MAX_RUNS_PER_CYCLE // 2]
    selected.extend(fresh[:MAX_RUNS_PER_CYCLE - len(selected)])
    backfill_keys = [_run_metadata(run)["run_key"] for run in backfill if valid_battery_run(run)] if not overflow else []
    backfill_metadata = [_run_metadata(run) for run in backfill if valid_battery_run(run)] if not overflow else []
    recent_metadata = [_run_metadata(run) for run in recent if valid_battery_run(run)]
    return selected, {"page": page, "per_page": per_page, "total_count": total,
                      "has_more": has_more, "run_keys": backfill_keys,
                      "runs": backfill_metadata, "window": window,
                      "recent_runs": recent_metadata,
                      "overflow": overflow, "split_windows": split_windows,
                      "superseded": superseded, "pending_deferred": pending_deferred}


def _parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _download_result(run: dict, repo: str, destination: Path):
    run_id = int(run.get("id") or run.get("databaseId"))
    expected_attempt = int(run.get("run_attempt") or 0)
    run_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}"
    before = read_api_json(run_url)
    if (int(before.get("id") or 0) != run_id
            or int(before.get("run_attempt") or 0) != expected_attempt
            or before.get("status") != "completed"):
        return {"pending_reason": "RUN_ATTEMPT_CHANGED"}
    if (str(before.get("run_started_at") or "") != str(run.get("run_started_at") or "")
            or str(before.get("updated_at") or "") != str(run.get("updated_at") or "")):
        return {"pending_reason": "RUN_ATTEMPT_METADATA_UNAVAILABLE"}

    def attempt_still_stable():
        after = read_api_json(run_url)
        return (int(after.get("id") or 0) == run_id
                and int(after.get("run_attempt") or 0) == expected_attempt
                and str(after.get("run_started_at") or "") == str(before.get("run_started_at") or "")
                and str(after.get("updated_at") or "") == str(before.get("updated_at") or "")
                and after.get("status") == "completed")

    artifact_url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/artifacts"
    artifact_list = read_api_json(artifact_url + "?name=battery-results&per_page=100&page=1")
    artifacts = artifact_list.get("artifacts") if isinstance(artifact_list, dict) else None
    if not isinstance(artifacts, list):
        raise RuntimeError("GITHUB_BATTERY_ARTIFACT_LIST_INVALID")
    try:
        artifact_total = int(artifact_list.get("total_count") or 0)
    except (TypeError, ValueError):
        raise RuntimeError("GITHUB_BATTERY_ARTIFACT_TOTAL_INVALID") from None
    for artifact_page in range(2, (artifact_total + 99) // 100 + 1):
        page_payload = read_api_json(artifact_url + f"?name=battery-results&per_page=100&page={artifact_page}")
        rows = page_payload.get("artifacts") if isinstance(page_payload, dict) else None
        if not isinstance(rows, list):
            raise RuntimeError("GITHUB_BATTERY_ARTIFACT_LIST_INVALID")
        artifacts.extend(rows)
    start = _parse_time(before.get("run_started_at"))
    completed = _parse_time(before.get("updated_at"))
    if start is None or completed is None:
        return {"pending_reason": "RUN_ATTEMPT_TIMESTAMPS_MISSING"}
    eligible_artifacts = []
    for artifact in artifacts:
        created = _parse_time(artifact.get("created_at")) if isinstance(artifact, dict) else None
        workflow_run = artifact.get("workflow_run") if isinstance(artifact, dict) else None
        if (isinstance(artifact, dict) and artifact.get("name") == "battery-results" and artifact.get("expired") is False
                and int((workflow_run or {}).get("id") or 0) == run_id
                and created is not None and start <= created <= completed + timedelta(minutes=5)):
            eligible_artifacts.append(artifact)
    # An artifact timestamp plus a stable pre/post run read is the legacy
    # fallback; new artifacts also carry the exact run/attempt manifest.
    if len(eligible_artifacts) > 1:
        return {"pending_reason": "ARTIFACT_ATTEMPT_AMBIGUOUS"}
    if len(eligible_artifacts) == 0:
        if artifact_total == 0 and not artifacts:
            if not attempt_still_stable():
                return {"pending_reason": "RUN_ATTEMPT_CHANGED_AFTER_ARTIFACT_SCAN"}
            if str(before.get("conclusion") or "") in {"failure", "cancelled", "timed_out", "startup_failure"}:
                # This is an operational failure record only. No scientific
                # result is inferred; the stable completed attempt had no
                # uploaded artifact at all.
                return {"results_missing": True, "artifact_missing_confirmed": True}
        return {"pending_reason": "ARTIFACT_NOT_AVAILABLE"}
    artifact = eligible_artifacts[0]
    artifact_id = int(artifact.get("id") or 0)
    if artifact_id <= 0:
        return {"pending_reason": "ARTIFACT_ID_INVALID"}
    destination.mkdir(parents=True, exist_ok=True)
    archive_path = destination / "artifact.zip"
    downloaded = subprocess.run(["gh", "api", f"repos/{repo}/actions/artifacts/{artifact_id}/zip"],
                                capture_output=True, timeout=120)
    if downloaded.returncode != 0 or not downloaded.stdout:
        return {"pending_reason": "ARTIFACT_DOWNLOAD_UNAVAILABLE"}
    import io
    import zipfile
    try:
        with zipfile.ZipFile(io.BytesIO(downloaded.stdout)) as archive:
            members = archive.infolist()
            if len(members) != 1 or members[0].filename != "battery-results.json" or members[0].file_size > 2_000_000:
                return {"pending_reason": "ARTIFACT_MEMBERSHIP_INVALID"}
            raw = archive.read(members[0])
        document = json.loads(raw.decode("utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, zipfile.BadZipFile):
        return {"pending_reason": "ARTIFACT_CONTENT_INVALID"}
    if not isinstance(document, dict):
        return {"pending_reason": "ARTIFACT_CONTENT_INVALID"}

    if document.get("contract") == "NEXO_BATTERY_RESULTS_V1":
        manifest = document.get("manifest")
        committed = {"contract": document.get("contract"), "manifest": manifest, "results": document.get("results")}
        invocation = hashlib.sha256(_canonical(committed)).hexdigest()
        if (not isinstance(manifest, dict)
                or manifest.get("run_id") != run_id
                or manifest.get("run_attempt") != expected_attempt
                or manifest.get("battery_id") != battery_id_from_run(run)
                or document.get("invocation_sha256") != invocation):
            return {"pending_reason": "ARTIFACT_MANIFEST_MISMATCH"}
    elif "contract" in document:
        return {"pending_reason": "ARTIFACT_CONTRACT_UNSUPPORTED"}
    else:
        # Legacy producer: only accept one artifact wholly inside the current
        # attempt's start/completion interval, after stable run metadata reads.
        if expected_attempt != 1:
            return {"pending_reason": "LEGACY_ARTIFACT_ATTEMPT_UNPROVEN"}
    if not attempt_still_stable():
        return {"pending_reason": "RUN_ATTEMPT_CHANGED_DURING_DOWNLOAD"}
    rows = document.get("results")
    if not isinstance(rows, list):
        return {"pending_reason": "ARTIFACT_RESULTS_INVALID"}
    return {"raw": raw, "results": rows, "artifact_id": artifact_id,
            "artifact_sha256": _sha256(raw),
            "artifact_archive_sha256": _sha256(downloaded.stdout),
            "artifact_created_at": artifact.get("created_at"),
            "invocation_sha256": str(document.get("invocation_sha256") or "legacy")}


def build_updates(selected, repo: str, *, download=_download_result, work_dir=Path("/tmp/bat")):
    updates, observations, pending = [], [], {}
    for metadata, run in selected:
        key = metadata["run_key"]
        conclusion = str(run.get("conclusion") or "").strip()
        if not conclusion:
            pending[key] = {**metadata, "reason": "RUN_CONCLUSION_UNAVAILABLE"}
            continue
        download_result = download(run, repo, Path(work_dir) / key.replace(":", "-"))
        if download_result is None:
            if conclusion not in {"failure", "cancelled", "timed_out", "startup_failure"}:
                pending[key] = {**metadata, "reason": "ARTIFACT_NOT_AVAILABLE"}
                continue
            artifact_sha256 = None
            results = []
            results_missing = True
        elif isinstance(download_result, dict) and download_result.get("pending_reason"):
            pending[key] = {**metadata, "reason": str(download_result["pending_reason"])}
            continue
        elif (isinstance(download_result, dict)
              and download_result.get("results_missing") is True
              and download_result.get("artifact_missing_confirmed") is True):
            artifact_sha256 = None
            results = []
            results_missing = True
        elif not isinstance(download_result, dict) or not isinstance(download_result.get("results"), list):
            pending[key] = {**metadata, "reason": "ARTIFACT_RESULT_INVALID"}
            continue
        else:
            results = download_result["results"]
            artifact_sha256 = download_result["artifact_sha256"]
            results_missing = False

        started = {}
        for row in results:
            if isinstance(row, dict) and row.get("test_id") and _parse_time(row.get("started_at")):
                started[str(row["test_id"])] = row["started_at"]
        base_payload = {"battery_id": metadata["battery_id"], "run_ref": metadata["run_ref"],
                        "run_attempt": metadata["run_attempt"], "artifact_sha256": artifact_sha256,
                        "artifact_id": (download_result or {}).get("artifact_id"),
                        "artifact_archive_sha256": (download_result or {}).get("artifact_archive_sha256"),
                        "artifact_created_at": (download_result or {}).get("artifact_created_at"),
                        "invocation_sha256": (download_result or {}).get("invocation_sha256")}
        if started and not results_missing:
            updates.append({"kind": "BATTERY_STATUS", "source": "WRITER_ROBOT",
                            "payload": {**base_payload, "status": "RUNNING", "started_tests": started}})

        completed_times = [_parse_time(row.get("executed_at")) for row in results if isinstance(row, dict)]
        completed_times = [stamp for stamp in completed_times if stamp is not None]
        completed_at = (max(completed_times).isoformat().replace("+00:00", "Z")
                        if completed_times else (run.get("updated_at") or run.get("updatedAt")))
        done = {"kind": "BATTERY_STATUS", "source": "WRITER_ROBOT",
                "payload": {**base_payload, "status": "DONE", "completed_at": completed_at,
                            "conclusion": conclusion,
                            "results_missing": results_missing, "results": results}}
        digest = writer_payload_sha256(done)
        updates.append(done)
        observations.append({**metadata, "input_sha256": digest, "conclusion": done["payload"]["conclusion"],
                            "completed_at": completed_at, "results": results,
                            "results_missing": results_missing,
                            "artifact_id": (download_result or {}).get("artifact_id"),
                            "artifact_sha256": (download_result or {}).get("artifact_sha256"),
                            "artifact_archive_sha256": (download_result or {}).get("artifact_archive_sha256"),
                            "artifact_created_at": (download_result or {}).get("artifact_created_at"),
                            "invocation_sha256": (download_result or {}).get("invocation_sha256")})
    return updates, observations, pending


def _decode_tower(raw: bytes) -> dict:
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    bundle = json.loads(raw.decode("utf-8"))
    files = bundle.get("files") if isinstance(bundle, dict) else None
    if (bundle.get("contract") != "NEXO_TOWER_LIVE_V1" or bundle.get("authority") != "TOWER_V06"
            or bundle.get("storage") != "GOOGLE_DRIVE_PRIVATE" or not isinstance(files, dict)):
        raise ValueError("CANONICAL_TOWER_CONTRACT_INVALID")
    fingerprint = _sha256(_canonical(files))
    if bundle.get("state_fingerprint") != fingerprint or bundle.get("revision") != fingerprint:
        raise ValueError("CANONICAL_TOWER_FINGERPRINT_INVALID")
    return bundle


def canonical_receipts(raw_tower: bytes) -> dict[str, dict]:
    bundle = _decode_tower(raw_tower)
    found = {}
    for path, entry in bundle["files"].items():
        if not (path.startswith("operations/receipts/") or path.startswith("mutations/receipts/operations/")):
            continue
        if not isinstance(entry, dict) or entry.get("encoding") != "json":
            continue
        receipt = entry.get("value")
        if not isinstance(receipt, dict) or receipt.get("contract") != RECEIPT_CONTRACT:
            continue
        payload_hash = str(receipt.get("payload_sha256") or "")
        if not payload_hash or not str(receipt.get("effect_id") or "").startswith("envelope-"):
            continue
        if receipt.get("outcome") not in {"APPLIED", "ALREADY_APPLIED", "REJECTED_TERMINAL",
                                         "DEFERRED_DEPENDENCY", "RETRYABLE_TRANSPORT"}:
            continue
        previous = found.get(payload_hash)
        order = (str(receipt.get("occurred_at") or ""), str(receipt.get("receipt_id") or ""))
        if previous is None or order > previous[0]:
            found[payload_hash] = (order, receipt)
    return {key: value[1] for key, value in found.items()}


def _battery_record(bundle: dict, battery_id: str):
    entry = bundle["files"].get("evolution/batteries.json")
    if not isinstance(entry, dict) or entry.get("encoding") != "json":
        return None
    document = entry.get("value")
    rows = document.get("batteries") if isinstance(document, dict) else None
    matches = [row for row in rows or [] if isinstance(row, dict) and row.get("id") == battery_id]
    return matches[0] if len(matches) == 1 else None


def _canonical_battery_matches(bundle: dict, observation: dict) -> bool:
    battery = _battery_record(bundle, str(observation.get("battery_id") or ""))
    if not battery:
        return False
    if (str(battery.get("status") or "").upper() != "DONE"
            or battery.get("run_ref") != observation.get("run_ref")
            or battery.get("completed_at") != observation.get("completed_at")
            or str(battery.get("conclusion") or "") != str(observation.get("conclusion") or "")):
        return False
    expected = {str(row.get("test_id")): row for row in observation.get("results") or []
                if isinstance(row, dict) and row.get("test_id")}
    specs = {str(row.get("test_id")): row for row in battery.get("tests") or []
             if isinstance(row, dict) and row.get("test_id")}
    if observation.get("results_missing"):
        # Writer turns an explicitly missing failure artifact into a canonical
        # failure record for every frozen test. Run and terminal metadata still bind it.
        return bool(battery.get("failed") or 0) and not battery.get("ok")
    if len(expected) != len(observation.get("results") or []) or set(expected) != set(specs):
        return False
    for test_id, result in expected.items():
        spec = specs[test_id]
        if result.get("attempt_id") and result.get("attempt_id") != spec.get("attempt_id"):
            return False
        if result.get("recipe_sha256") and result.get("recipe_sha256") != spec.get("recipe_sha256"):
            return False
    return True


def record_cursor_outcomes(cursor: dict, collection: dict, raw_tower: bytes) -> dict:
    """Persist canonical acknowledgements and independently durable scan progress."""
    state = _cursor_state(cursor)
    bundle = _decode_tower(raw_tower)
    receipts = canonical_receipts(raw_tower)
    acked = state["acknowledged"]
    pending = state["pending"]
    newly_acknowledged = 0
    for observation in collection.get("observations") or []:
        key = run_key(observation.get("run_id"), observation.get("run_attempt"))
        receipt = receipts.get(str(observation.get("input_sha256") or ""))
        existing_ack = acked.get(key)
        if existing_ack:
            # Replaying the same canonical receipt is a no-op. A later payload
            # for an acknowledged run attempt cannot replace its evidence.
            if (existing_ack.get("input_sha256") == observation.get("input_sha256")
                    and receipt and existing_ack.get("receipt_id") == receipt.get("receipt_id")
                    and receipt.get("outcome") in TERMINAL_OUTCOMES
                    and _canonical_battery_matches(bundle, observation)):
                pending.pop(key, None)
                continue
            pending[key] = {**pending.get(key, {}), "run_id": int(observation["run_id"]),
                            "run_attempt": int(observation["run_attempt"]),
                            "battery_id": observation["battery_id"],
                            "run_ref": observation["run_ref"],
                            "input_sha256": observation["input_sha256"],
                            "last_attempted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "reason": "ACKNOWLEDGED_ATTEMPT_PAYLOAD_CONFLICT"}
            continue
        if (receipt and receipt.get("outcome") in TERMINAL_OUTCOMES
                and _canonical_battery_matches(bundle, observation)):
            acked[key] = {"run_id": int(observation["run_id"]),
                          "run_attempt": int(observation["run_attempt"]),
                          "battery_id": observation["battery_id"],
                          "run_ref": observation["run_ref"],
                          "input_sha256": observation["input_sha256"],
                          "outcome": receipt["outcome"],
                          "receipt_id": receipt.get("receipt_id"),
                          "confirmed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                          "tower_revision": bundle.get("state_fingerprint"),
                          "artifact_id": observation.get("artifact_id"),
                          "artifact_sha256": observation.get("artifact_sha256"),
                          "artifact_archive_sha256": observation.get("artifact_archive_sha256"),
                          "artifact_created_at": observation.get("artifact_created_at"),
                          "invocation_sha256": observation.get("invocation_sha256")}
            pending.pop(key, None)
            newly_acknowledged += 1
        else:
            pending[key] = {"run_id": int(observation["run_id"]),
                            "run_attempt": int(observation["run_attempt"]),
                            "battery_id": observation["battery_id"],
                            "run_ref": observation["run_ref"],
                            "input_sha256": observation["input_sha256"],
                            "artifact_id": observation.get("artifact_id"),
                            "artifact_sha256": observation.get("artifact_sha256"),
                            "artifact_archive_sha256": observation.get("artifact_archive_sha256"),
                            "artifact_created_at": observation.get("artifact_created_at"),
                            "invocation_sha256": observation.get("invocation_sha256"),
                            "last_attempted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "retry_count": int(pending.get(key, {}).get("retry_count") or 0) + 1,
                            "reason": (receipt or {}).get("outcome") or "CANONICAL_CONFIRMATION_MISSING"}
            if receipt and receipt.get("outcome") == "REJECTED_TERMINAL":
                # Retain the exact decision/source for later explicit recovery;
                # parking is neither successful acknowledgement nor deletion.
                pending[key].update(
                    rejection_receipt_id=receipt.get("receipt_id"),
                    rejected_payload_sha256=observation["input_sha256"],
                    rejection_tower_revision=bundle.get("state_fingerprint"),
                    rejected_at=receipt.get("occurred_at"),
                )

    for key, value in (collection.get("pending") or {}).items():
        if key not in acked:
            prior = pending.get(key) or {}
            pending[key] = {**prior, **value,
                            "last_attempted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "retry_count": int(prior.get("retry_count") or 0) + 1}

    for key, value in (collection.get("backfill") or {}).get("superseded", {}).items():
        if key not in acked:
            pending[key] = {**pending.get(key, {}), **value, "reason": "RUN_ATTEMPT_SUPERSEDED"}
            replacement = value.get("replacement") if isinstance(value, dict) else None
            if isinstance(replacement, dict):
                replacement_key = str(replacement.get("run_key") or "")
                if replacement_key and replacement_key not in acked:
                    prior = pending.get(replacement_key) or {}
                    pending[replacement_key] = {**prior, **replacement,
                                                "reason": prior.get("reason") or "RERUN_ATTEMPT_DISCOVERED"}

    for key, value in (collection.get("backfill") or {}).get("pending_deferred", {}).items():
        if key not in acked:
            prior = pending.get(key) or {}
            pending[key] = {**prior, **value,
                            "last_attempted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "retry_count": int(prior.get("retry_count") or 0) + 1}

    backfill = collection.get("backfill") or {}
    if backfill:
        page = backfill.get("page")
        if page != state["scan"].get("next_page"):
            raise ValueError("BATTERY_RUN_CURSOR_PAGE_MOVED")
        # Persist the rolling latest-page observations even when the
        # historical date window must be split before its page can advance.
        for metadata in backfill.get("recent_runs") or []:
            key = str(metadata.get("run_key") or "")
            if key and key not in acked:
                pending.setdefault(key, {**metadata, "reason": "DISCOVERED_RECENT"})
        if backfill.get("overflow"):
            split_windows = backfill.get("split_windows") or []
            if not split_windows:
                raise RuntimeError("BATTERY_RUN_WINDOW_SPLIT_REQUIRED")
            state["scan"]["window_queue"] = split_windows + state["scan"].get("window_queue", [])
            state["scan"]["window"] = state["scan"]["window_queue"].pop(0)
            state["scan"]["next_page"] = 1
            state["scan"].pop("blocked_run_keys", None)
            state["scan"]["last_split_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            state["last_canonical_check"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            state["last_acknowledged_count"] = newly_acknowledged
            return cursor

        # A scan position records durable discovery, not an ACK. Unresolved
        # runs remain in pending and are retried independently of later pages.
        for metadata in backfill.get("runs") or []:
            key = str(metadata.get("run_key") or "")
            if key and key not in acked:
                pending.setdefault(key, {**metadata, "reason": "DISCOVERED"})
        undiscovered = [key for key in backfill.get("run_keys") or []
                        if key not in acked and key not in pending]
        if not undiscovered:
            next_page = int(page) + 1
            if backfill.get("has_more"):
                state["scan"]["next_page"] = next_page
            else:
                queue = state["scan"].get("window_queue") or []
                if queue:
                    state["scan"]["window"] = queue.pop(0)
                    state["scan"]["window_queue"] = queue
                    state["scan"]["next_page"] = 1
                else:
                    window = state["scan"]["window"]
                    next_end = date.fromisoformat(str(window["start"])) - timedelta(days=1)
                    if next_end < MIN_SCAN_DATE:
                        state["scan"]["window"] = _current_scan_window()
                        state["scan"]["next_page"] = 1
                        state["scan"]["last_full_sweep_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    else:
                        next_start = max(date(next_end.year, 1, 1), MIN_SCAN_DATE)
                        state["scan"]["window"] = {"start": next_start.isoformat(), "end": next_end.isoformat(),
                                                    "through": next_end.strftime("%Y-%m-%dT23:59:59Z")}
                        state["scan"]["next_page"] = 1
                state["scan"]["last_complete_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            state["scan"]["last_advanced_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            state["scan"]["blocked_run_keys"] = undiscovered[:50]
    state["last_canonical_check"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state["last_acknowledged_count"] = newly_acknowledged
    return cursor


def collect(repo: str, cursor: dict, api=read_api_json, *, download=_download_result,
            per_page: int = PER_PAGE, work_dir=Path("/tmp/bat")):
    selected, backfill = collect_run_pages(repo, cursor, api, per_page=per_page)
    updates, observations, pending = build_updates(selected, repo, download=download, work_dir=work_dir)
    return updates, {"backfill": backfill, "observations": observations, "pending": pending}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--cursor", default="nexo-one/tcc-public-inbox-ack.json")
    parser.add_argument("--updates", default="/tmp/bat/updates.json")
    parser.add_argument("--collection", default="/tmp/bat/collection.json")
    parser.add_argument("--per-page", type=int, default=PER_PAGE)
    args = parser.parse_args()
    if not args.repo:
        raise SystemExit("GITHUB_REPOSITORY is required")
    cursor = json.loads(Path(args.cursor).read_text(encoding="utf-8"))
    updates, collection = collect(args.repo, cursor, per_page=args.per_page)
    Path(args.updates).parent.mkdir(parents=True, exist_ok=True)
    Path(args.updates).write_text(json.dumps(updates, ensure_ascii=False), encoding="utf-8")
    Path(args.collection).write_text(json.dumps(collection, ensure_ascii=False), encoding="utf-8")
    print("battery run candidates", len(collection["backfill"]["run_keys"]),
          "observations", len(collection["observations"]), "pending", len(collection["pending"]))


if __name__ == "__main__":
    main()
