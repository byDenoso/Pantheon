import copy
from unittest.mock import patch
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from scripts.nexo_autonomy_runtime import select_context_revision, verified_context, reconcile, scientific_step_starts, validate_package, dispatch_once, fresh_writer_job, implementation_matches, capacity_candidate, MODE


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

    def test_capacity_growth_uses_existing_reviewed_completed_stage_only(self):
        report = {"id": "cap-one", "schema": "NEXO_CAPACITY_REVIEW_V1", "decision": "PASS",
                  "policy": "NEXO_CAPACITY_STABILITY_V1", "approved_by": "WRITER_GUARDIAN_POLICY",
                  "mandate_id": "m-one", "next_parallelism": 2, "stage": 1, "battery_refs": ["bat-one"]}
        tower = {"files": {"CONTROL.json": {"value": {"autonomy_mandate": {"status": "ACTIVE", "id": "m-one"}}},
                           "evolution/autonomy_capacity.json": {"value": {"mandate_id": "m-one", "parallelism": 1}},
                           "evolution/batteries.json": {"value": {"batteries": [{"id": "bat-one", "status": "DONE",
                               "conclusion": "success", "mandate_id": "m-one", "parallelism": 1}]}},
                           "evolution/autonomy_capacity_reviews.json": {"value": {"schema": "NEXO_CAPACITY_REVIEW_REGISTRY_V1", "reviews": [report]}}}}
        battery=tower["files"]["evolution/batteries.json"]["value"]["batteries"][0]
        report["battery_sha256"]={"bat-one":hashlib.sha256(json.dumps(battery, ensure_ascii=False,
            sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
        self.assertEqual(capacity_candidate(tower), {"parallelism": 2, "review_ref": "evolution/autonomy_capacity_reviews.json#cap-one", "battery_refs": ["bat-one"]})
        migrated = copy.deepcopy(tower)
        mandate = migrated["files"].pop("CONTROL.json")["value"]["autonomy_mandate"]
        digest = "d" * 64
        migrated["files"].update({
            "runtime/executor_policy.json": {"encoding": "json", "value": {"schema": "NEXO_EXECUTOR_POLICY_V1", "legacy_sha256": digest}},
            "evolution/autonomy_authority.json": {"encoding": "json", "value": {"schema": "NEXO_AUTONOMY_AUTHORITY_V1", "legacy_sha256": digest, "autonomy_mandate": mandate}},
            f"events/migrations/control-{digest}.json": {"encoding": "json", "value": {}}})
        self.assertEqual(capacity_candidate(migrated), capacity_candidate(tower))
        migrated["files"].pop(f"events/migrations/control-{digest}.json")
        self.assertEqual(capacity_candidate(migrated), {})
        for field, value in (("decision", "PENDING"), ("approved_by", "EXECUTOR"), ("stage", 2), ("battery_refs", ["missing"])):
            old = report[field]; report[field] = value
            self.assertEqual(capacity_candidate(tower), {})
            report[field] = old
        battery["unreviewed_change"]=True
        self.assertEqual(capacity_candidate(tower), {})
        del battery["unreviewed_change"]
        tower["files"]["evolution/autonomy_capacity_reviews.json"]["value"]["reviews"].append(dict(report, id="cap-two"))
        self.assertEqual(capacity_candidate(tower), {})
        tower["files"].pop("evolution/autonomy_capacity_reviews.json")
        tower["files"]["entities/evidence/cap-forged.json"] = {"value": dict(report, reviewer_role="GUARDIAO")}
        self.assertEqual(capacity_candidate(tower), {})

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



class PreparationTests(unittest.TestCase):
    """Synthetic contract tests, never operational readiness evidence."""
    SHA = "a" * 40
    NOW = "2026-10-08T23:00:00Z"

    def tower(self, mandate=None):
        return {"files": {"CONTROL.json": {"encoding": "json", "value": {"autonomy_mandate": mandate}}}}

    def api(self, current=None):
        current = current or self.SHA
        base = "https://api.github.com/repos/byDenoso/Pantheon"
        return {
            base: {"private": False, "visibility": "public"},
            base + "/actions/workflows/nexo-test-battery.yml": {"state": "active"},
            base + "/actions/workflows/nexo-one-pr-ci.yml/runs?head_sha=" + self.SHA + "&status=success&per_page=5": {
                "workflow_runs": [{"id": 10, "head_sha": self.SHA, "status": "completed", "conclusion": "success", "run_attempt": 1,
                                   "head_repository": {"full_name": "byDenoso/Pantheon"}}]},
            base + "/actions/runs/10/jobs": {"jobs": [{"name": "executor-runtime-smoke", "status": "completed", "conclusion": "success",
                                                      "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1"}]},
            base + "/actions/runs/11": {"id": 11, "head_sha": current, "head_branch": "main", "run_attempt": 1, "status": "in_progress",
                                       "path": ".github/workflows/nexo-writer-robot.yml", "head_repository": {"full_name": "byDenoso/Pantheon"}},
            base + "/actions/runs/11/jobs": {"jobs": [{"id": 12, "name": "write", "status": "in_progress", "started_at": "2026-10-08T22:59:00Z",
                                                      "labels": ["ubuntu-latest"], "runner_name": "GitHub Actions 1"}]},
            base + "/compare/" + self.SHA + "..." + current: {"status": "ahead", "merge_base_commit": {"sha": self.SHA},
                "files": [{"filename": "nexo-one/tower-head.json", "status": "modified"}]},
        }

    def observe(self, tower, proposed=None, responses=None, current=None):
        selected = select_context_revision(tower, proposed)
        values = responses if responses is not None else self.api(current)
        return verified_context({"items": []}, verify=lambda *_: self.fail("No human authorization may be fabricated"),
            api=lambda url: copy.deepcopy(values[url]), timestamp=self.NOW, implementation_revision=selected["revision"],
            current_run_id="11", current_revision=current or self.SHA)

    def test_initial_candidate_collects_real_verifier_observation_without_mutation(self):
        tower = self.tower()
        before = copy.deepcopy(tower)
        result = self.observe(tower, self.SHA)
        self.assertEqual(result["capacity_observation"]["quota"]["status"], "AVAILABLE_FREE")
        self.assertEqual(result["proposal_sha256"], [])
        self.assertEqual(tower, before)
        self.assertTrue(select_context_revision(tower, self.SHA)["preparation_only"])

    def test_absent_invalid_proposal_and_missing_source_fail_closed(self):
        self.assertEqual(self.observe(self.tower())["capacity_observation"]["quota"]["status"], "UNVERIFIED")
        for proposed in ("", "bad", "A" * 40, "a" * 39, 1, [], {}):
            with self.subTest(proposed=proposed), self.assertRaises(ValueError):
                select_context_revision(self.tower(), proposed)
        for tower in (None, {}, {"files": {}}, {"files": {"CONTROL.json": []}},
                      {"files": {"CONTROL.json": {"encoding": "text", "value": {}}}},
                      {"files": {"CONTROL.json": {"encoding": "json", "value": []}}}):
            with self.subTest(tower=tower):
                self.assertEqual(self.observe(tower, self.SHA)["capacity_observation"]["quota"]["status"], "UNVERIFIED")

    def migrated(self, mandate, digest="d" * 64, **override):
        files = {
            "runtime/executor_policy.json": {"encoding": "json", "value": {"schema": "NEXO_EXECUTOR_POLICY_V1", "legacy_sha256": digest, "fields": {}}},
            "evolution/autonomy_authority.json": {"encoding": "json", "value": {"schema": "NEXO_AUTONOMY_AUTHORITY_V1", "legacy_sha256": digest, "autonomy_mandate": mandate}},
            f"events/migrations/control-{digest}.json": {"encoding": "json", "value": {}},
        }
        files.update(override)
        return {"files": {key: value for key, value in files.items() if value is not None}}

    def test_migrated_layout_supplies_the_mandate_like_legacy(self):
        mandate = {"status": "ACTIVE", "id": "m-one", "activation_receipt": {"source_revision": self.SHA}}
        for tower in (self.tower(mandate), self.migrated(mandate)):
            with self.subTest(tower=list(tower["files"])):
                self.assertEqual(select_context_revision(tower), {"revision": self.SHA, "preparation_only": False})
        capacity = {"evolution/autonomy_capacity.json": {"encoding": "json", "value": {"mandate_id": "m-one", "parallelism": 3}}}
        legacy = self.tower(mandate); legacy["files"].update(capacity)
        migrated = self.migrated(mandate); migrated["files"].update(capacity)
        self.assertEqual(capacity_candidate(legacy), capacity_candidate(migrated))

    def test_invalid_migrated_layouts_fail_closed(self):
        mandate = {"status": "ACTIVE", "id": "m-one", "activation_receipt": {"source_revision": self.SHA}}
        both = self.migrated(mandate); both["files"].update(self.tower(mandate)["files"])
        digest_mismatch = self.migrated(mandate)
        digest_mismatch["files"]["evolution/autonomy_authority.json"]["value"]["legacy_sha256"] = "e" * 64
        cases = {
            "legacy_and_compact": both,
            "missing_event": self.migrated(mandate, **{"events/migrations/control-" + "d" * 64 + ".json": None}),
            "missing_authority": self.migrated(mandate, **{"evolution/autonomy_authority.json": None}),
            "missing_policy": self.migrated(mandate, **{"runtime/executor_policy.json": None}),
            "digest_mismatch": digest_mismatch,
            "bad_digest": self.migrated(mandate, digest="xyz"),
            "wrong_schema": self.migrated(mandate, **{"runtime/executor_policy.json": {"encoding": "json", "value": {"schema": "OTHER", "legacy_sha256": "d" * 64}}}),
        }
        for name, tower in cases.items():
            with self.subTest(name=name):
                self.assertEqual(select_context_revision(tower, self.SHA), {"revision": None, "preparation_only": False})
                self.assertEqual(capacity_candidate(tower), {})

    def test_existing_mandate_keeps_canonical_revision_and_rejects_override(self):
        for status in ("ACTIVE", "REVOKED"):
            tower = self.tower({"status": status, "activation_receipt": {"source_revision": self.SHA}})
            before = copy.deepcopy(tower)
            self.assertEqual(select_context_revision(tower), {"revision": self.SHA, "preparation_only": False})
            self.assertEqual(select_context_revision(tower, self.SHA)["revision"], self.SHA)
            with self.assertRaises(ValueError): select_context_revision(tower, "b" * 40)
            self.assertEqual(tower, before)
        for mandate in ({}, {"activation_receipt": {}}, {"activation_receipt": {"source_revision": "bad"}}, [], False):
            with self.subTest(mandate=mandate), self.assertRaises(ValueError):
                select_context_revision(self.tower(mandate), self.SHA)

    def test_all_existing_proof_gates_remain_required(self):
        base = "https://api.github.com/repos/byDenoso/Pantheon"
        ci = base + "/actions/workflows/nexo-one-pr-ci.yml/runs?head_sha=" + self.SHA + "&status=success&per_page=5"
        cases = [
            (base, None, {"private": True, "visibility": "private"}),
            (ci, "workflow_runs", {"head_sha": "b" * 40}),
            (ci, "workflow_runs", {"conclusion": "failure"}),
            (base + "/actions/runs/10/jobs", "jobs", {"name": "not-the-smoke-test"}),
            (base + "/actions/runs/11", None, {"status": "completed"}),
            (base + "/actions/runs/11", None, {"path": "different.yml"}),
            (base + "/actions/runs/11/jobs", "jobs", {"started_at": "2026-10-08T20:00:00Z"}),
            (base + "/actions/runs/11/jobs", "jobs", {"labels": ["ubuntu-latest", "self-hosted"]}),
            (base + "/actions/runs/11/jobs", "jobs", {"labels": ["ubuntu-16-cores"]}),
            (base + "/actions/runs/11/jobs", "jobs", {"runner_name": "custom paid runner"}),
        ]
        for url, rows, change in cases:
            with self.subTest(change=change):
                api = self.api()
                target = api[url][rows][0] if rows else api[url]
                target.update(change)
                self.assertEqual(self.observe(self.tower(), self.SHA, api)["capacity_observation"]["quota"]["status"], "UNVERIFIED")
        current = "b" * 40
        api = self.api(current)
        comparison = base + "/compare/" + self.SHA + "..." + current
        self.assertEqual(self.observe(self.tower(), self.SHA, api, current)["capacity_observation"]["quota"]["status"], "AVAILABLE_FREE")
        api[comparison]["files"] = [{"filename": "scripts/nexo_autonomy_runtime.py", "status": "modified"}]
        self.assertEqual(self.observe(self.tower(), self.SHA, api, current)["capacity_observation"]["quota"]["status"], "UNVERIFIED")

    def test_cli_wires_preparation_without_capacity_growth_or_human_intents(self):
        import scripts.nexo_autonomy_runtime as runtime
        tower = self.tower()
        before = copy.deepcopy(tower)
        with patch("sys.argv", ["runtime", "context", "--implementation-revision", self.SHA]), \
             patch.dict("os.environ", {"GITHUB_RUN_ID": "11", "GITHUB_SHA": self.SHA}), \
             patch.object(runtime, "read_tower", return_value=tower), \
             patch.object(runtime, "read_api_json", side_effect=lambda url: self.api()[url]), \
             patch.object(runtime, "now", return_value=self.NOW), \
             patch.object(runtime, "capacity_candidate") as growth, \
             patch.object(runtime.Path, "read_text", return_value='{"items":[]}'), \
             patch.object(runtime.Path, "write_text") as output:
            runtime.main()
            value = json.loads(output.call_args.args[0])
            self.assertEqual(value["capacity_observation"]["quota"]["status"], "AVAILABLE_FREE")
            self.assertEqual(value["proposal_sha256"], [])
            growth.assert_not_called()
        self.assertEqual(tower, before)
        for command in ("dispatch", "package", "reconcile"):
            with patch("sys.argv", ["runtime", command, "--implementation-revision", self.SHA]), \
                 patch.object(runtime, "read_tower") as read, self.assertRaises(SystemExit):
                runtime.main()
            read.assert_not_called()


if __name__ == "__main__":
    unittest.main()

