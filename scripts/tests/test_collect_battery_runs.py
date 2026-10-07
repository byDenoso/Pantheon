import hashlib
import copy
import io
import json
import re
import subprocess
import unittest
import urllib.parse
from datetime import date as datetime_date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
import zipfile

from scripts import collect_battery_runs as collector


REPO = "byDenoso/Pantheon"
WINDOW = {"start": "2026-10-04", "end": "2026-10-04", "through": "2026-10-04T23:59:59Z"}


def make_run(run_id, *, attempt=1, status="completed", created="2026-10-04T10:00:00Z"):
    return {
        "id": run_id,
        "run_attempt": attempt,
        "event": "workflow_dispatch",
        "status": status,
        "conclusion": "success" if status == "completed" else None,
        "display_title": f"battery bat-{run_id:03d}",
        "created_at": created,
        "updated_at": "2026-10-04T12:00:00Z" if status == "completed" else "2026-10-04T11:00:00Z",
        "run_started_at": "2026-10-04T10:01:00Z",
    }


def initial_cursor(*, pending=None, window=None):
    return {"battery_runs": {
        "contract": collector.BATTERY_CURSOR_CONTRACT,
        "acknowledged": {},
        "pending": pending or {},
        "scan": {"next_page": 1, "window": window or dict(WINDOW), "window_queue": []},
    }}


def canonical_tower(files):
    fingerprint = collector._sha256(collector._canonical(files))
    return json.dumps({
        "contract": "NEXO_TOWER_LIVE_V1",
        "authority": "TOWER_V06",
        "storage": "GOOGLE_DRIVE_PRIVATE",
        "revision": fingerprint,
        "state_fingerprint": fingerprint,
        "files": files,
    }, ensure_ascii=False, separators=(",", ":")).encode()


class FakeGitHub:
    def __init__(self, runs):
        self.runs = {int(run["id"]): run for run in runs}
        self.list_queries = []
        self.detail_queries = []

    def __call__(self, url):
        parsed = urllib.parse.urlparse(url)
        if "/actions/workflows/" in parsed.path and parsed.path.endswith("/runs"):
            query = urllib.parse.parse_qs(parsed.query)
            self.list_queries.append(query)
            self.assert_safe_query(query)
            rows = list(self.runs.values())
            created = (query.get("created") or [""])[0]
            if created:
                bounds = created.split("..", 1)
                if len(bounds) == 2:
                    low = datetime.fromisoformat(bounds[0].replace("Z", "+00:00"))
                    high = datetime.fromisoformat(bounds[1].replace("Z", "+00:00"))
                    rows = [row for row in rows if low <= datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) <= high]
            rows.sort(key=lambda row: (row["created_at"], int(row["id"])), reverse=True)
            page = int((query.get("page") or ["1"])[0])
            per_page = int((query.get("per_page") or ["100"])[0])
            start = (page - 1) * per_page
            return {"total_count": len(rows), "workflow_runs": rows[start:start + per_page]}
        match = re.search(r"/actions/runs/(\d+)$", parsed.path)
        if match:
            self.detail_queries.append(int(match.group(1)))
            return self.runs[int(match.group(1))]
        raise AssertionError(f"unexpected API URL {url}")

    @staticmethod
    def assert_safe_query(query):
        # The endpoint does not support sort/direction. Status filtering would
        # make page offsets shift when an in-progress run completes.
        for forbidden in ("status", "sort", "direction"):
            if forbidden in query:
                raise AssertionError(f"unsupported or unstable workflow-run filter: {forbidden}")


class BatteryRunCollectorTests(unittest.TestCase):
    def test_terminal_rejection_does_not_consume_pending_retry_budget(self):
        run = make_run(301, created="2026-09-20T10:00:00Z")
        saved = {**collector._run_metadata(run), "reason": "REJECTED_TERMINAL",
                 "input_sha256": "sha256:" + "a" * 64, "retry_count": 254}
        cursor = initial_cursor(pending={"301:1": saved})
        # No recent/backfill observations: any detail call is a hot retry.
        def api(url):
            self.assertIn("/actions/workflows/", url, "terminal attempt must not be polled by ID")
            return {"total_count": 0, "workflow_runs": []}
        selected, _ = collector.collect_run_pages(REPO, cursor, api)
        self.assertEqual(selected, [])
        self.assertEqual(cursor["battery_runs"]["pending"]["301:1"], saved)

    def test_terminal_rejection_is_not_rediscovered_from_recent_or_backfill(self):
        run = make_run(302)
        for source in ("recent", "backfill"):
            with self.subTest(source=source):
                saved = {**collector._run_metadata(run), "reason": "REJECTED_TERMINAL"}
                cursor = initial_cursor(pending={"302:1": saved})
                def api(url):
                    if "/actions/workflows/" not in url:
                        return run
                    is_backfill = "created=" in url
                    rows = [run] if is_backfill == (source == "backfill") else []
                    return {"total_count": len(rows), "workflow_runs": rows}
                selected, _ = collector.collect_run_pages(REPO, cursor, api)
                self.assertEqual(selected, [])

    def test_transient_pending_attempts_remain_retryable(self):
        for reason in ("ARTIFACT_NOT_AVAILABLE", "DEFERRED_DEPENDENCY",
                       "RETRYABLE_TRANSPORT", "CANONICAL_CONFIRMATION_MISSING"):
            with self.subTest(reason=reason):
                run = make_run(303)
                cursor = initial_cursor(pending={"303:1": {
                    **collector._run_metadata(run), "reason": reason}})
                api = FakeGitHub([run])
                selected, _ = collector.collect_run_pages(REPO, cursor, api)
                self.assertEqual([meta["run_key"] for meta, _ in selected], ["303:1"])
                self.assertEqual(api.detail_queries, [303])

    def test_new_attempt_after_terminal_rejection_is_discovered_and_history_survives(self):
        old = {**collector._run_metadata(make_run(304)), "reason": "REJECTED_TERMINAL",
               "input_sha256": "sha256:" + "a" * 64, "retry_count": 77}
        for source in ("recent", "backfill"):
            with self.subTest(source=source):
                run = make_run(304, attempt=2)
                cursor = initial_cursor(pending={"304:1": copy.deepcopy(old)})
                def api(url):
                    self.assertIn("/actions/workflows/", url)
                    is_backfill = "created=" in url
                    rows = [run] if is_backfill == (source == "backfill") else []
                    return {"total_count": len(rows), "workflow_runs": rows}
                _, collection = collector.collect(
                    REPO, cursor, api, download=lambda *_: {"pending_reason": "ARTIFACT_NOT_AVAILABLE"})
                self.assertEqual(set(collection["pending"]), {"304:2"})
                collector.record_cursor_outcomes(cursor, collection, canonical_tower({}))
                self.assertEqual(cursor["battery_runs"]["pending"]["304:1"], old)
                self.assertIn("304:2", cursor["battery_runs"]["pending"])
                self.assertEqual(cursor["battery_runs"]["acknowledged"], {})

    def test_new_running_attempt_remains_durable_after_terminal_predecessor(self):
        run = make_run(305, attempt=2, status="in_progress")
        cursor = initial_cursor(pending={"305:1": {"reason": "REJECTED_TERMINAL"}})
        api = FakeGitHub([run])
        _, collection = collector.collect(REPO, cursor, api)
        collector.record_cursor_outcomes(cursor, collection, canonical_tower({}))
        self.assertIn("305:2", cursor["battery_runs"]["pending"])
        api.runs[305] = make_run(305, attempt=2)
        selected, _ = collector.collect_run_pages(REPO, cursor, api)
        self.assertEqual([meta["run_key"] for meta, _ in selected], ["305:2"])

    def test_superseded_transient_cannot_requeue_a_terminal_replacement(self):
        run = make_run(306, attempt=2)
        cursor = initial_cursor(pending={
            "306:1": {"reason": "ARTIFACT_NOT_AVAILABLE"},
            "306:2": {"reason": "REJECTED_TERMINAL"},
        })
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
        self.assertEqual(selected, [])

    def test_exact_terminal_receipt_parks_attempt_without_ack_or_history_loss(self):
        run = make_run(307)
        cursor = initial_cursor()
        download_calls = []
        def download(*args):
            download_calls.append(args)
            return {"results": [], "artifact_id": 999, "artifact_sha256": "sha256:" + "a" * 64}
        api = FakeGitHub([run])
        _, collection = collector.collect(REPO, cursor, api, download=download)
        observation = collection["observations"][0]
        receipt = {"contract": collector.RECEIPT_CONTRACT, "effect_id": "envelope-rejected",
                   "payload_sha256": observation["input_sha256"], "outcome": "REJECTED_TERMINAL",
                   "receipt_id": "receipt-rejected", "occurred_at": "2026-10-04T12:01:00Z"}
        tower = canonical_tower({"operations/receipts/rejected.json": {"encoding": "json", "value": receipt}})
        collector.record_cursor_outcomes(cursor, collection, tower)
        saved = copy.deepcopy(cursor["battery_runs"]["pending"]["307:1"])
        self.assertEqual(saved["reason"], "REJECTED_TERMINAL")
        self.assertEqual(saved["input_sha256"], observation["input_sha256"])
        # A changed global Tower revision or missing old receipt is not a source change.
        for _ in range(3):
            _, replay = collector.collect(REPO, cursor, api, download=download)
            self.assertEqual(replay["observations"], [])
            collector.record_cursor_outcomes(cursor, replay, canonical_tower({}))
            self.assertEqual(cursor["battery_runs"]["pending"]["307:1"], saved)
            self.assertEqual(cursor["battery_runs"]["acknowledged"], {})
        self.assertEqual(len(download_calls), 1)

    def test_download_pending_reason_is_durable_not_a_keyerror(self):
        run = make_run(3)
        metadata = collector._run_metadata(run)
        updates, observations, pending = collector.build_updates(
            [(metadata, run)], REPO,
            download=lambda *_: {"pending_reason": "ARTIFACT_ATTEMPT_AMBIGUOUS"},
        )
        self.assertEqual(updates, [])
        self.assertEqual(observations, [])
        self.assertEqual(pending["3:1"]["reason"], "ARTIFACT_ATTEMPT_AMBIGUOUS")

    def test_artifact_download_uses_exact_id_and_validates_attempt_manifest(self):
        run = make_run(31)
        manifest = {"run_id": 31, "run_attempt": 1, "battery_id": "bat-031"}
        committed = {"contract": "NEXO_BATTERY_RESULTS_V1", "manifest": manifest, "results": []}
        document = {**committed, "invocation_sha256": hashlib.sha256(collector._canonical(committed)).hexdigest()}
        archive_bytes = io.BytesIO()
        with zipfile.ZipFile(archive_bytes, "w") as archive:
            archive.writestr("battery-results.json", json.dumps(document, separators=(",", ":")))
        artifact_list = {"total_count": 1, "artifacts": [{
            "id": 7001,
            "name": "battery-results",
            "expired": False,
            "created_at": "2026-10-04T11:59:00Z",
            "workflow_run": {"id": 31},
        }]}
        with patch.object(collector, "read_api_json", side_effect=[run, artifact_list, run]) as read_api, \
                patch.object(collector.subprocess, "run",
                             return_value=subprocess.CompletedProcess([], 0, archive_bytes.getvalue(), b"")) as gh:
            result = collector._download_result(run, REPO, Path("/tmp/test-battery-download"))
        self.assertEqual(result["results"], [])
        self.assertEqual(result["artifact_id"], 7001)
        self.assertTrue(result["artifact_archive_sha256"].startswith("sha256:"))
        self.assertIn("/actions/artifacts/7001/zip", gh.call_args.args[0][-1])
        self.assertEqual(read_api.call_count, 3, "run attempt is revalidated after exact artifact download")

        wrong_manifest = {**manifest, "run_attempt": 2}
        wrong_committed = {"contract": "NEXO_BATTERY_RESULTS_V1", "manifest": wrong_manifest, "results": []}
        wrong_document = {**wrong_committed,
                          "invocation_sha256": hashlib.sha256(collector._canonical(wrong_committed)).hexdigest()}
        wrong_archive = io.BytesIO()
        with zipfile.ZipFile(wrong_archive, "w") as archive:
            archive.writestr("battery-results.json", json.dumps(wrong_document, separators=(",", ":")))
        with patch.object(collector, "read_api_json", side_effect=[run, artifact_list]), \
                patch.object(collector.subprocess, "run",
                             return_value=subprocess.CompletedProcess([], 0, wrong_archive.getvalue(), b"")):
            result = collector._download_result(run, REPO, Path("/tmp/test-battery-download-wrong"))
        self.assertEqual(result, {"pending_reason": "ARTIFACT_MANIFEST_MISMATCH"})

    def test_only_stable_completed_failure_with_no_artifacts_emits_missing_results(self):
        run = make_run(32)
        run["conclusion"] = "failure"
        artifacts = {"total_count": 0, "artifacts": []}
        with patch.object(collector, "read_api_json", side_effect=[run, artifacts, run]):
            result = collector._download_result(run, REPO, Path("/tmp/test-battery-no-artifact"))
        updates, observations, pending = collector.build_updates(
            [(collector._run_metadata(run), run)], REPO, download=lambda *_: result,
        )
        self.assertEqual(pending, {})
        self.assertTrue(updates[-1]["payload"]["results_missing"])
        self.assertTrue(observations[0]["results_missing"])

        success = make_run(33)
        with patch.object(collector, "read_api_json", side_effect=[success, artifacts, success]):
            result = collector._download_result(success, REPO, Path("/tmp/test-battery-success-no-artifact"))
        _, _, pending = collector.build_updates(
            [(collector._run_metadata(success), success)], REPO, download=lambda *_: result,
        )
        self.assertEqual(pending["33:1"]["reason"], "ARTIFACT_NOT_AVAILABLE")

    def test_unusable_artifact_is_not_misreported_as_absent(self):
        run = make_run(34)
        artifacts = {"total_count": 1, "artifacts": [{
            "id": 711,
            "name": "battery-results",
            "expired": True,
            "created_at": "2026-10-04T11:59:00Z",
            "workflow_run": {"id": 34},
        }]}
        with patch.object(collector, "read_api_json", side_effect=[run, artifacts]):
            result = collector._download_result(run, REPO, Path("/tmp/test-battery-expired-artifact"))
        self.assertEqual(result, {"pending_reason": "ARTIFACT_NOT_AVAILABLE"})

    def test_paginated_discovery_reaches_more_than_twenty_runs(self):
        runs = [make_run(run_id) for run_id in range(1, 26)]
        api = FakeGitHub(runs)
        cursor = initial_cursor()
        pending_artifact = lambda *_: {"pending_reason": "ARTIFACT_NOT_AVAILABLE"}
        empty_tower = canonical_tower({})

        for _ in range(3):
            _, collection = collector.collect(REPO, cursor, api, download=pending_artifact,
                                              per_page=10, work_dir="/tmp/test-battery")
            collector.record_cursor_outcomes(cursor, collection, empty_tower)

        state = cursor["battery_runs"]
        self.assertEqual(len(state["pending"]), 25)
        self.assertTrue(all(f"{run_id}:1" in state["pending"] for run_id in range(1, 26)))
        self.assertTrue(any("created" in query for query in api.list_queries))
        self.assertEqual(state["scan"]["next_page"], 1)
        self.assertEqual(state["scan"]["window"]["start"], "2026-01-01",
                         "completed date window should advance into earlier history")

    def test_overflow_split_windows_are_durably_consumed(self):
        cursor = initial_cursor(window={"start": "2026-10-04", "end": "2026-10-10",
                                        "through": "2026-10-10T23:59:59Z"})

        class OverflowAPI:
            @staticmethod
            def __call__(url):
                query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
                if not query.get("created"):
                    return {"total_count": 0, "workflow_runs": []}
                if query["created"][0] == "2026-10-04T00:00:00Z..2026-10-10T23:59:59Z":
                    return {"total_count": 1000, "workflow_runs": []}
                return {"total_count": 0, "workflow_runs": []}

        api = OverflowAPI()
        _, parent_window = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertTrue(parent_window["overflow"])
        recent = make_run(222, status="in_progress")
        parent_window["recent_runs"] = [collector._run_metadata(recent)]
        collector.record_cursor_outcomes(cursor, {"backfill": parent_window}, canonical_tower({}))
        scan = cursor["battery_runs"]["scan"]
        self.assertIn("222:1", cursor["battery_runs"]["pending"],
                      "recent observations must persist even when backfill is split")
        self.assertEqual(scan["window"], {"start": "2026-10-08", "end": "2026-10-10",
                                           "through": "2026-10-10T23:59:59Z"})
        self.assertEqual(len(scan["window_queue"]), 1)

        _, right_window = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertFalse(right_window["overflow"])
        collector.record_cursor_outcomes(cursor, {"backfill": right_window}, canonical_tower({}))
        scan = cursor["battery_runs"]["scan"]
        self.assertEqual(scan["window"], {"start": "2026-10-04", "end": "2026-10-07",
                                           "through": "2026-10-07T23:59:59Z"})
        self.assertEqual(scan["window_queue"], [])

    def test_saturated_single_day_fails_closed(self):
        cursor = initial_cursor()

        def api(url):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            if query.get("created"):
                return {"total_count": 1000, "workflow_runs": []}
            return {"total_count": 0, "workflow_runs": []}

        with self.assertRaisesRegex(RuntimeError, "GITHUB_BATTERY_DAILY_WINDOW_AT_CAP_1000"):
            collector.collect_run_pages(REPO, cursor, api, per_page=10)

    def test_old_pending_attempt_is_retried_after_scan_window_moves(self):
        run = make_run(87, created="2026-09-20T10:00:00Z")
        pending = {"87:1": {**collector._run_metadata(run), "last_attempted_at": "2026-10-01T00:00:00Z"}}
        cursor = initial_cursor(pending=pending)
        api = FakeGitHub([run])
        selected, _ = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertEqual([meta["run_key"] for meta, _ in selected], ["87:1"])

    def test_in_progress_run_is_durable_before_falling_off_recent_page(self):
        runs = [make_run(1, status="in_progress", created="2026-10-04T09:00:00Z")]
        runs.extend(make_run(run_id, created="2026-10-04T10:00:00Z") for run_id in range(2, 12))
        api = FakeGitHub(runs)
        cursor = initial_cursor()
        cursor["battery_runs"]["scan"]["next_page"] = 2
        _, collection = collector.collect(REPO, cursor, api,
                                          download=lambda *_: {"pending_reason": "ARTIFACT_NOT_AVAILABLE"},
                                          per_page=10, work_dir="/tmp/test-battery")
        collector.record_cursor_outcomes(cursor, collection, canonical_tower({}))
        self.assertIn("1:1", cursor["battery_runs"]["pending"])
        self.assertEqual(cursor["battery_runs"]["scan"]["window"]["start"], "2026-01-01",
                         "scan should advance while retaining the in-progress run")

        api.runs[1] = make_run(1, status="completed", created="2026-10-04T09:00:00Z")
        selected, _ = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertIn("1:1", [metadata["run_key"] for metadata, _ in selected],
                      "late completion must be retried by run ID outside the latest-run page")

    def test_recent_in_progress_is_saved_while_backfill_scans_an_older_year(self):
        run = make_run(1, status="in_progress", created="2026-10-04T09:00:00Z")
        runs = [run]
        runs.extend(make_run(run_id, created="2026-10-03T10:00:00Z") for run_id in range(2, 12))
        api = FakeGitHub(runs)
        cursor = initial_cursor(window={"start": "2025-01-01", "end": "2025-12-31",
                                        "through": "2025-12-31T23:59:59Z"})
        _, collection = collector.collect(REPO, cursor, api,
                                          download=lambda *_: {"pending_reason": "ARTIFACT_NOT_AVAILABLE"},
                                          per_page=10, work_dir="/tmp/test-battery")
        collector.record_cursor_outcomes(cursor, collection, canonical_tower({}))
        self.assertIn("1:1", cursor["battery_runs"]["pending"],
                      "recent runs must be durable even when the backfill scans another year")

        api.runs[1] = make_run(1, status="completed", created="2026-10-04T09:00:00Z")
        for run_id in range(12, 22):
            api.runs[run_id] = make_run(run_id, created=f"2026-10-{run_id - 7:02d}T10:00:00Z")
        selected, _ = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        latest_ids = [run["id"] for run in sorted(api.runs.values(),
                                                    key=lambda row: (row["created_at"], row["id"]),
                                                    reverse=True)[:10]]
        self.assertNotIn(1, latest_ids, "completed run has fallen off the recent page")
        self.assertIn("1:1", [metadata["run_key"] for metadata, _ in selected],
                      "pending run must be recovered after it falls off the recent page")

    def test_backfill_window_includes_runs_earlier_than_today(self):
        run = make_run(88, created="2026-03-01T10:00:00Z")
        cursor = initial_cursor(window={"start": "2026-01-01", "end": "2026-10-04",
                                        "through": "2026-10-04T23:59:59Z"})
        api = FakeGitHub([run])
        _, backfill = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertEqual(backfill["run_keys"], ["88:1"])
        self.assertEqual(collector._current_scan_window(datetime_date(2026, 10, 4))["start"], "2026-01-01")

    def test_superseded_pending_entries_do_not_starve_retries(self):
        run = make_run(200, created="2026-09-20T10:00:00Z")
        pending = {
            f"{run_id}:1": {"run_id": run_id, "run_attempt": 1,
                            "superseded_by_attempt": 2, "last_attempted_at": "2026-09-30T00:00:00Z"}
            for run_id in range(100, 110)
        }
        pending["200:1"] = {**collector._run_metadata(run), "last_attempted_at": "2026-10-01T00:00:00Z"}
        cursor = initial_cursor(pending=pending)
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]), per_page=10)
        self.assertEqual([meta["run_key"] for meta, _ in selected], ["200:1"])

    def test_rerun_attempt_is_queued_when_old_pending_attempt_is_superseded(self):
        run = make_run(91, attempt=2, status="in_progress", created="2026-09-20T10:00:00Z")
        saved = {**collector._run_metadata(make_run(91, attempt=1, created="2026-09-20T10:00:00Z")),
                 "last_attempted_at": "2026-10-01T00:00:00Z"}
        cursor = initial_cursor(pending={"91:1": saved})
        api = FakeGitHub([run])
        _, backfill = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        collection = {"backfill": backfill, "observations": [], "pending": {}}
        collector.record_cursor_outcomes(cursor, collection, canonical_tower({}))
        self.assertEqual(cursor["battery_runs"]["pending"]["91:1"]["reason"], "RUN_ATTEMPT_SUPERSEDED")
        self.assertEqual(cursor["battery_runs"]["pending"]["91:2"]["reason"], "RERUN_ATTEMPT_DISCOVERED")

        api.runs[91] = make_run(91, attempt=2, status="completed", created="2026-09-20T10:00:00Z")
        selected, _ = collector.collect_run_pages(REPO, cursor, api, per_page=10)
        self.assertIn("91:2", [meta["run_key"] for meta, _ in selected])

    def test_canonical_ack_requires_exact_receipt_and_replay_is_idempotent(self):
        run = make_run(121)
        metadata = collector._run_metadata(run)
        results = [{
            "test_id": "test-a",
            "attempt_id": "attempt-" + "a" * 32,
            "recipe_sha256": "b" * 64,
            "started_at": "2026-10-04T10:02:00Z",
            "executed_at": "2026-10-04T11:59:00Z",
            "ok": True,
        }]
        download = lambda *_: {
            "results": results,
            "artifact_id": 456,
            "artifact_sha256": "sha256:" + "1" * 64,
            "artifact_archive_sha256": "sha256:" + "2" * 64,
            "artifact_created_at": "2026-10-04T12:00:01Z",
            "invocation_sha256": "3" * 64,
        }
        _, observations, _ = collector.build_updates([(metadata, run)], REPO, download=download)
        observation = observations[0]
        self.assertEqual(observation["artifact_id"], 456)
        self.assertEqual(observation["artifact_sha256"], "sha256:" + "1" * 64)
        receipt = {
            "contract": "OPERATION_RECEIPT_V1",
            "effect_id": "envelope-battery-test",
            "payload_sha256": observation["input_sha256"],
            "outcome": "APPLIED",
            "receipt_id": "receipt-456",
            "occurred_at": "2026-10-04T12:01:00Z",
        }
        battery = {
            "id": metadata["battery_id"],
            "status": "DONE",
            "run_ref": metadata["run_ref"],
            "completed_at": observation["completed_at"],
            "conclusion": "success",
            "ok": True,
            "failed": 0,
            "tests": [{
                "test_id": "test-a",
                "attempt_id": results[0]["attempt_id"],
                "recipe_sha256": results[0]["recipe_sha256"],
            }],
        }
        files = {
            "operations/receipts/receipt-456.json": {"encoding": "json", "value": receipt},
            "evolution/batteries.json": {"encoding": "json", "value": {"batteries": [battery]}},
        }
        tower = canonical_tower(files)
        cursor = initial_cursor()
        collection = {"backfill": {}, "observations": observations, "pending": {}}

        collector.record_cursor_outcomes(cursor, collection, tower)
        ack = cursor["battery_runs"]["acknowledged"]["121:1"]
        self.assertEqual(ack["receipt_id"], "receipt-456")
        self.assertEqual(ack["artifact_id"], 456)
        self.assertEqual(ack["artifact_archive_sha256"], "sha256:" + "2" * 64)
        self.assertNotIn("121:1", cursor["battery_runs"]["pending"])

        collector.record_cursor_outcomes(cursor, collection, tower)
        self.assertEqual(cursor["battery_runs"]["acknowledged"]["121:1"], ack)
        self.assertNotIn("121:1", cursor["battery_runs"]["pending"])

    def test_global_revision_without_matching_receipt_never_acknowledges(self):
        run = make_run(122)
        metadata = collector._run_metadata(run)
        _, observations, _ = collector.build_updates(
            [(metadata, run)], REPO,
            download=lambda *_: {"results": [], "artifact_id": 1, "artifact_sha256": "sha256:x"},
        )
        cursor = initial_cursor()
        collector.record_cursor_outcomes(cursor, {"observations": observations}, canonical_tower({}))
        self.assertNotIn("122:1", cursor["battery_runs"]["acknowledged"])
        self.assertEqual(cursor["battery_runs"]["pending"]["122:1"]["reason"], "CANONICAL_CONFIRMATION_MISSING")


if __name__ == "__main__":
    unittest.main()
