import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from scripts.nexo_autonomy_runtime import verified_context, reconcile, scientific_step_starts, validate_package, dispatch_once, fresh_writer_job, implementation_matches, MODE


class TransportTests(unittest.TestCase):
    def test_authority_is_verified_externally_and_quota_fails_closed(self):
        gateway = {"items": [{"envelope": {"_human_authorization": {"signature": "forged"}}}]}
        def unavailable(url):
            raise OSError("quota unavailable")
        value = verified_context(gateway, verify=lambda *args: {"verified": False}, api=unavailable, timestamp="2026-10-08T23:00:00Z")
        self.assertEqual(value["proposal_sha256"], [])
        self.assertEqual(value["capacity_observation"]["quota"]["status"], "UNVERIFIED")
        responses = [{"private": False, "visibility": "public"}, {"state": "active"},
                     {"workflow_runs": [{"id": 10, "head_sha": "a" * 40, "run_attempt": 1, "status": "completed", "conclusion": "success", "head_repository": {"full_name": "byDenoso/Pantheon"}}]},
                     {"jobs": [{"name": "executor-runtime-smoke", "status": "completed", "conclusion": "success", "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1"}]},
                     {"id": 11, "head_sha": "a" * 40, "head_branch": "main", "run_attempt": 1, "status": "in_progress",
                      "path": ".github/workflows/nexo-writer-robot.yml", "head_repository": {"full_name": "byDenoso/Pantheon"}},
                     {"jobs": [{"id": 12, "name": "write", "status": "in_progress", "started_at": "2026-10-08T22:59:00Z",
                                "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1"}]}]
        value = verified_context(gateway, verify=lambda *args: {"verified": True, "proposal_sha256": "a" * 64},
                                 api=lambda url: responses.pop(0), timestamp="2026-10-08T23:00:00Z", implementation_revision="a" * 40,
                                 current_run_id="11", current_revision="a" * 40)
        self.assertEqual(value["proposal_sha256"], ["a" * 64])
        self.assertEqual(value["capacity_observation"]["quota"]["status"], "AVAILABLE_FREE")

    def test_capacity_requires_fresh_exact_public_writer_job(self):
        run = {"id": 11, "head_sha": "a" * 40, "head_branch": "main", "run_attempt": 1, "status": "in_progress",
               "path": ".github/workflows/nexo-writer-robot.yml", "head_repository": {"full_name": "byDenoso/Pantheon"}}
        job = {"id": 12, "name": "write", "status": "in_progress", "started_at": "2026-10-08T22:59:00Z",
               "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1"}
        check = lambda r, j: fresh_writer_job(r, {"jobs": [j]}, run_id="11", revision="a" * 40, checked_at="2026-10-08T23:00:00Z")
        self.assertEqual(check(run, job), job)
        for changed in ({"started_at": "2026-10-08T20:00:00Z"}, {"started_at": "2026-10-09T00:00:00Z"},
                        {"labels": ["ubuntu-latest", "self-hosted"]}, {"runner_name": "custom-runner"}, {"status": "queued"}):
            self.assertIsNone(check(run, dict(job, **changed)))
        for changed in ({"head_sha": "b" * 40}, {"head_branch": "feature"}, {"run_attempt": 2}, {"path": "other.yml"}):
            self.assertIsNone(check(dict(run, **changed), job))

    def test_only_writer_operational_markers_can_advance_the_approved_revision(self):
        comparison = {"status": "ahead", "merge_base_commit": {"sha": "a" * 40},
                      "files": [{"filename": "nexo-one/tower-head.json", "status": "modified"}]}
        self.assertTrue(implementation_matches(lambda _: comparison, "a" * 40, "b" * 40))
        for filename in ("scripts/nexo_autonomy_runtime.py", ".github/workflows/nexo-writer-robot.yml", "nexo-one/server/autonomy/authority.mjs"):
            changed = dict(comparison, files=[{"filename": filename, "status": "modified"}])
            self.assertFalse(implementation_matches(lambda _: changed, "a" * 40, "b" * 40))
        self.assertFalse(implementation_matches(lambda _: dict(comparison, status="diverged"), "a" * 40, "b" * 40))

    def test_uncertain_dispatch_binds_only_unique_matching_first_run(self):
        tower = {"files": {"evolution/batteries.json": {"value": {"batteries": [
            {"id": "bat-one", "status": "DISPATCH_PENDING", "transport": MODE,
             "dispatch_requested_at": "2026-10-08T23:00:00Z", "source_revision": "a" * 40}]}}}}
        run = {"id": 42, "run_attempt": 1, "head_branch": "main", "head_sha": "a" * 40,
               "created_at": "2026-10-08T23:01:00Z", "event": "workflow_dispatch", "display_title": "battery bat-one"}
        result = reconcile(tower, [run])
        self.assertEqual(result[0]["payload"]["run_ref"], "actions/runs/42")
        self.assertEqual(set(result[0]), {"kind", "source", "payload"})
        for rows in [[run, dict(run, id=43)], [dict(run, run_attempt=2)], [dict(run, head_branch="other")],
                     [dict(run, created_at="2026-10-08T22:59:00Z")], [dict(run, head_sha="b" * 40)]]:
            self.assertEqual(reconcile(tower, rows), [])

    def progress_fixture(self):
        battery = {"id": "bat-one", "status": "DISPATCH_PENDING", "transport": MODE,
                   "dispatch_requested_at": "2026-10-08T23:00:00Z", "source_revision": "a" * 40,
                   "tests": [{"test_id": "T-one"}, {"test_id": "T-two"}]}
        run = {"id": 42, "run_attempt": 1, "head_branch": "main", "head_sha": "a" * 40,
               "created_at": "2026-10-08T23:01:00Z", "event": "workflow_dispatch",
               "display_title": "battery bat-one", "status": "in_progress"}
        job = {"id": 51, "name": "run (T-one, 0)", "run_id": 42, "run_attempt": 1,
               "head_sha": "a" * 40, "status": "in_progress", "started_at": "2026-10-08T23:01:30Z",
               "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1",
               "steps": [{"name": "Run frozen scientific script", "status": "in_progress",
                          "started_at": "2026-10-08T23:02:00Z", "completed_at": None}]}
        return battery, run, job

    def test_running_progress_requires_the_current_real_scientific_step(self):
        battery, run, job = self.progress_fixture()
        check = lambda value: scientific_step_starts(battery, run, {"total_count": 1, "jobs": [value]},
                                                     checked_at="2026-10-08T23:03:00Z")
        self.assertEqual(check(job), {"T-one": "2026-10-08T23:02:00Z"})
        documented_job = {key: value for key, value in job.items() if key != "run_attempt"}
        self.assertEqual(check(documented_job), {"T-one": "2026-10-08T23:02:00Z"})
        self.assertEqual(scientific_step_starts(battery, dict(run, run_attempt=2), {"jobs": [job]},
                         checked_at="2026-10-08T23:03:00Z"), {})
        for change in ({"name": "run (T-one, 1)"}, {"name": "run (T-unknown, 0)"},
                       {"run_id": 99}, {"run_attempt": 2}, {"head_sha": "b" * 40},
                       {"status": "queued"}, {"labels": ["ubuntu-latest", "self-hosted"]},
                       {"runner_name": "custom"}, {"started_at": None}):
            self.assertEqual(check(dict(job, **change)), {})
        for change in ({"status": "pending"}, {"status": "completed"}, {"started_at": None},
                       {"started_at": "2026-10-09T00:00:00Z"}, {"completed_at": "2026-10-08T23:03:00Z"},
                       {"name": "Install deterministic runtime dependencies"}):
            self.assertEqual(check(dict(job, steps=[dict(job["steps"][0], **change)])), {})
        self.assertEqual(scientific_step_starts(battery, run, {"jobs": [job, job]},
                         checked_at="2026-10-08T23:03:00Z"), {})
        self.assertEqual(scientific_step_starts(battery, run, {"jobs": [job], "total_count": 2},
                         checked_at="2026-10-08T23:03:00Z"), {})

    def test_reconciliation_exposes_running_shards_without_receiving_scientific_logs(self):
        battery, run, job = self.progress_fixture()
        tower = {"files": {"evolution/batteries.json": {"value": {"batteries": [battery]}}}}
        responses = [{"total_count": 1, "jobs": [job]}, run]
        urls = []
        def api(url):
            urls.append(url)
            return responses.pop(0)
        updates = reconcile(tower, [run], api=api, checked_at="2026-10-08T23:03:00Z")
        self.assertEqual([update["payload"]["status"] for update in updates], ["DISPATCHED", "RUNNING"])
        self.assertEqual(updates[-1]["payload"]["started_tests"], {"T-one": "2026-10-08T23:02:00Z"})
        self.assertTrue(all("logs" not in url for url in urls))
        self.assertEqual(set(updates[-1]["payload"]), {"battery_id", "status", "run_ref", "run_attempt", "started_tests"})

    def test_reconciliation_refuses_stale_progress_if_the_run_is_retried_or_completed(self):
        battery, run, job = self.progress_fixture()
        tower = {"files": {"evolution/batteries.json": {"value": {"batteries": [battery]}}}}
        for change in ({"run_attempt": 2}, {"status": "completed"}, {"head_sha": "b" * 40}):
            responses = [{"jobs": [job]}, dict(run, **change)]
            updates = reconcile(tower, [run], api=lambda url: responses.pop(0), checked_at="2026-10-08T23:03:00Z")
            self.assertEqual([update["payload"]["status"] for update in updates], ["DISPATCHED"])

    def test_package_preserves_numeric_bytes_and_rejects_tampering(self):
        raw = '{"schema":"NEXO_SCIENTIFIC_PACKAGE_V1","battery_id":"bat-one","parallelism":1,"tests":[{"test_id":"T-one","params":{"x":1e-05}}]}'
        document = {"package_json": raw, "package_sha256": hashlib.sha256(raw.encode()).hexdigest()}
        self.assertEqual(validate_package(document, "bat-one"), raw)
        with self.assertRaises(ValueError):
            validate_package(dict(document, package_json=raw.replace("1e-05", "0.2")), "bat-one")
        with self.assertRaises(ValueError):
            validate_package(document, "bat-other")

    def test_uncertain_dispatch_never_retries_and_never_exports_spec(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "bat-one.json")
            path.write_text(json.dumps({"id": "bat-one", "transport": MODE, "source_revision": "a" * 40, "tests": [{"private": "must not forward"}]}))
            calls = []
            def uncertain(command):
                calls.append(command)
                return SimpleNamespace(returncode=1)
            dispatch_once([path], invoke=uncertain, main_revision=lambda: "a" * 40)
            self.assertEqual(len(calls), 1)
            self.assertFalse(path.exists())
            self.assertNotIn("must not forward", str(calls))

    def test_main_revision_change_never_dispatches_or_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "bat-one.json")
            path.write_text(json.dumps({"id": "bat-one", "transport": MODE, "source_revision": "a" * 40}))
            calls = []
            dispatch_once([path], invoke=lambda command: calls.append(command), main_revision=lambda: "b" * 40)
            self.assertEqual(calls, [])
            self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
