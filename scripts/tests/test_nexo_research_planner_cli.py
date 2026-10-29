"""End-to-end producer/CLI controls. All inputs below are technical fixtures.

No catalogue, inference, receipt or hash in this file is scientific evidence.
The tests invoke the real executable and round-trip its proposals through the
existing Writer; they never submit proposals or connect to remote services.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts import nexo_research_planner as cli
from scripts import nexo_scientific_state as science
from scripts import nexo_shadow_writer as writer


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "nexo_research_planner.py"
AT = "2026-01-01T00:00:00Z"
NOW = "2026-01-01T01:00:00Z"


def question(label, *, status="verified", cost=10):
    identity = {
        "question": "technical-fixture-" + label,
        "estimand": "technical mean of fixture " + label,
        "observable": "synthetic unit-test fixture, no observations",
        "data": [{"id": "fixture-" + label, "version": "1", "sha256": "a" * 64}],
        "design": {"null": "fixture mean zero", "rival": "fixture mean nonzero", "control": label},
    }
    return {
        "schema": science.SCHEMA, "event_id": "fixture-question-" + label,
        "science_id": science.scientific_id(identity), "identity": identity,
        "kind": "QUESTION", "at": AT, "role": "S1", "activity": "E1",
        "title": "TECHNICAL FIXTURE ONLY " + label,
        "dependencies": [{"id": "fixture-data-" + label, "status": status,
                          "evidence": "technical fixture only", "checked_at": AT,
                          "expires_at": "2026-01-02T00:00:00Z"}],
        "priority": {"originality": 0, "discrimination": 1, "impact": 1, "cost": cost},
        "opportunity": {
            "physical_question": "Technical fixture only: distinguish two toy means",
            "discriminator": "Difference between synthetic fixture means",
            "hypotheses": [{"id": "zero", "prediction": "fixture mean zero"},
                           {"id": "nonzero", "prediction": "fixture mean nonzero"}],
            "expected_information": {"rating": 0.5, "basis": "declared technical fixture"},
            "cost": {"seconds": cost, "basis": "declared technical fixture"},
            "literature": {"status": "pending", "scope": "technical fixture only", "references": []},
        },
    }


def calculation(q):
    return {
        "schema": science.SCHEMA, "event_id": q["event_id"].replace("question", "result"),
        "science_id": q["science_id"], "identity": copy.deepcopy(q["identity"]),
        "kind": "CALCULATED", "at": "2026-01-01T00:30:00Z", "role": "S1",
        "activity": "E1", "run_id": "fixture-run-" + q["identity"]["question"],
        "scientific_status": "INCONCLUSIVE", "numeric_result": {"toy_mean": 1.5},
        "artifact": {"uri": "fixture-local-output.json", "sha256": "b" * 64},
        "receipt": {"run_id": "fixture-run-" + q["identity"]["question"],
                    "runtime": "local_sandbox", "class": "E1", "script_sha256": "c" * 64,
                    "output_sha256": "b" * 64, "input_hashes": {"fixture.json": "a" * 64}},
        "limitations": "Technical fixture only; no cosmological evidence or durable artifact.",
    }


def connector(tab, rows, *, wrapped=True):
    end = {"MURAL": "H", "RESULTADOS": "J", "SHADOW_V2": "O"}[tab]
    value = {"range": "'" + tab + "'!A1:" + end + str(max(1, len(rows))),
             "majorDimension": "ROWS", "values": rows}
    return {"isError": False, "structuredContent": {"structuredContent": value}} if wrapped else value


class ResearchPlannerCliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="nexo-planner-cli-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def put(self, name, value, *, raw=False):
        path = self.directory / name
        path.write_text(value if raw else json.dumps(value), encoding="utf-8")
        return path

    def invoke(self, *args, success=True):
        result = subprocess.run([sys.executable, str(SCRIPT), "--now", NOW, "--role", "S1",
                                 *map(str, args)], cwd=ROOT, capture_output=True, text=True,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, timeout=15)
        self.assertEqual(result.returncode, 0 if success else 2, result.stderr or result.stdout)
        if not success:
            self.assertIn("PLANNER_INPUT_ERROR:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
        return result

    def empty_source(self):
        return self.put("snapshot.json", {"schema": cli.SNAPSHOT_SCHEMA, "stored": {}, "pending": []})

    def recommended_ids(self, report):
        return [q["science_id"] for q in report["plans"]["S1"]["recommendations"]]

    def test_native_connector_read_produces_recommendation_without_reservation_or_mutation(self):
        q = question("one")
        row = cli.event_envelope(q)["values"]
        source = self.put("mural.json", connector("MURAL", [["data", "task"], row]))
        before = source.read_bytes()
        state_path = self.directory / "state.json"
        result = self.invoke("--mural-read", source, "--state-out", state_path)
        report = json.loads(result.stdout)
        self.assertEqual(self.recommended_ids(report), [q["science_id"]])
        self.assertEqual(report["mode"], "READ_ONLY_RECOMMENDATIONS")
        self.assertFalse(report["reservation_acquired"])
        self.assertFalse(report["execution_dispatched"])
        self.assertEqual(report["network_writes"], 0)
        self.assertFalse(report["plans"]["S1"]["recommendations"][0]["execution_authorized"])
        self.assertEqual(report["coverage"]["reads"][0]["sha256"], hashlib.sha256(before).hexdigest())
        state = json.loads(state_path.read_text())
        self.assertEqual(state["metrics"]["running"], 0)
        self.assertEqual(source.read_bytes(), before)

    def test_question_and_calculation_proposals_roundtrip_existing_writer_without_promotion(self):
        q = question("proposed")
        events = self.put("events.json", [q, calculation(q)])
        spool_path, state_path = self.directory / "spool.json", self.directory / "state.json"
        result = self.invoke("--snapshot", self.empty_source(), "--events", events,
                             "--spool-out", spool_path, "--state-out", state_path)
        report, state = json.loads(result.stdout), json.loads(state_path.read_text())
        rows = json.loads(spool_path.read_text())
        self.assertEqual(len(rows), 2)
        self.assertEqual({row[3] for row in rows}, {"MURAL", "RESULTADOS"})
        for row in rows:
            self.assertEqual(len(row), 15)
            envelope, marker = writer.decode_plain(row)
            self.assertEqual(marker, "")
            writer.validate_new_event(envelope)
            self.assertIn(envelope["stable_id"], report["unsubmitted_proposal_ids"])
        self.assertEqual(state["metrics"]["calculated"], 1)
        self.assertEqual(state["metrics"]["records_persisted"], 0)
        self.assertEqual(state["metrics"]["persisted"], 0)
        self.assertEqual(self.recommended_ids(report), [])

    def test_applied_spool_marker_without_canonical_target_never_promotes_result(self):
        q = question("pending")
        envelope = cli.event_envelope(calculation(q))
        row = cli.plain_spool_row(envelope)
        row[-1] = "APPLIED:" + writer.digest_for(envelope)
        source = self.put("spool-read.json", connector("SHADOW_V2", [writer.PLAIN_HEADER, row]))
        result = self.invoke("--spool-read", source)
        report = json.loads(result.stdout)
        self.assertEqual(report["metrics"]["calculated"], 1)
        self.assertEqual(report["metrics"]["records_persisted"], 0)
        self.assertEqual(report["metrics"]["persisted"], 0)
        self.assertEqual(self.recommended_ids(report), [])

    def test_conflicting_canonical_identity_is_quarantined_while_independent_question_continues(self):
        first, independent = question("conflict"), question("independent")
        conflicting = copy.deepcopy(first)
        conflicting["title"] = "Conflicting bytes under the same fixture event id"
        source = self.put("conflicts.json", {"schema": cli.SNAPSHOT_SCHEMA, "stored": {"MURAL": [
            cli.event_envelope(q)["values"] for q in (first, conflicting, independent)]}})
        original = source.read_bytes()
        state_path = self.directory / "state.json"
        result = self.invoke("--snapshot", source, "--state-out", state_path)
        report, state = json.loads(result.stdout), json.loads(state_path.read_text())
        self.assertEqual(self.recommended_ids(report), [independent["science_id"]])
        self.assertTrue(any(i["reason"] == "CANONICAL_ID_CONFLICT" for i in report["incidents"]))
        self.assertEqual(source.read_bytes(), original)
        self.assertFalse(state["questions"][independent["science_id"]]["reconciliation_required"])

    def test_completion_delta_selects_next_question_and_replayed_delta_does_not_duplicate(self):
        blocked, first, second = question("blocked", status="missing", cost=1), question("first", cost=2), question("second", cost=9)
        source = self.put("initial.json", connector("MURAL", [cli.event_envelope(q)["values"] for q in (blocked, first, second)]))
        state_one = self.directory / "state-one.json"
        before = json.loads(self.invoke("--mural-read", source, "--limit", 1, "--state-out", state_one).stdout)
        self.assertEqual(self.recommended_ids(before), [first["science_id"]])
        delta = self.put("delta.json", connector("RESULTADOS", [cli.event_envelope(calculation(first))["values"]]))
        state_two = self.directory / "state-two.json"
        after = json.loads(self.invoke("--previous", state_one, "--results-read", delta, "--limit", 1,
                                      "--state-out", state_two).stdout)
        self.assertEqual(self.recommended_ids(after), [second["science_id"]])
        self.assertEqual(after["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(after["metrics"]["blocked"], 1)
        state_three = self.directory / "state-three.json"
        replay = json.loads(self.invoke("--previous", state_two, "--results-read", delta, "--limit", 1,
                                       "--state-out", state_three).stdout)
        self.assertEqual(self.recommended_ids(replay), [second["science_id"]])
        self.assertEqual(replay["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(replay["metrics"]["duplicate_executions"], 0)
        self.assertEqual(len(json.loads(state_two.read_text())["_records"]), len(json.loads(state_three.read_text())["_records"]))

    def test_connector_wrong_sheet_dimensions_and_bounds_fail_explicitly(self):
        q = question("bounds")
        valid = connector("MURAL", [cli.event_envelope(q)["values"]], wrapped=False)
        cases = [dict(valid, range="RESULTADOS!A1:H1"), dict(valid, range="MURAL!B1:I1"),
                 dict(valid, majorDimension="COLUMNS"), dict(valid, values=valid["values"] * 2),
                 {"isError": True, "structuredContent": valid}]
        for number, value in enumerate(cases):
            with self.subTest(number=number):
                source = self.put("bad-read.json", value)
                result = self.invoke("--mural-read", source, success=False)
                self.assertEqual(result.stdout, "")

    def test_invalid_json_numbers_and_duplicate_keys_never_become_source_state(self):
        cases = ['{"schema":"NEXO_RESEARCH_SNAPSHOT_V1","schema":"NEXO_RESEARCH_SNAPSHOT_V1"}',
                 '{"schema":"NEXO_RESEARCH_SNAPSHOT_V1","pending":NaN}']
        for value in cases:
            with self.subTest(value=value):
                source = self.put("invalid.json", value, raw=True)
                self.invoke("--snapshot", source, success=False)

    def test_invalid_snapshot_index_cannot_change_canonical_identity(self):
        q = question("indexed")
        source = self.put("index.json", {"schema": cli.SNAPSHOT_SCHEMA, "stored": {
            "MURAL": {"a-different-event-id": cli.event_envelope(q)["values"]}}})
        result = self.invoke("--snapshot", source, success=False)
        self.assertIn("CANONICAL_INDEX_KEY_MISMATCH", result.stderr)

    def test_unmarked_unparseable_spool_fails_explicitly(self):
        envelope = cli.event_envelope(question("bad-spool"))
        invalid = cli.plain_spool_row(envelope)
        invalid[0] = "another-valid-id"
        source = self.put("bad-spool.json", connector("SHADOW_V2", [invalid]))
        result = self.invoke("--spool-read", source, success=False)
        self.assertIn("MISMATCHED_ROW_ID", result.stderr)

    def test_explicit_legacy_quarantine_is_preserved_and_independent_question_continues(self):
        envelope = cli.event_envelope(question("bad-spool"))
        invalid = cli.plain_spool_row(envelope)
        invalid[0], invalid[-1] = "another-valid-id", "INVALID:MISMATCHED_ROW_ID"
        independent = question("independent-spool")
        source = self.put("quarantined.json", connector("SHADOW_V2", [
            writer.PLAIN_HEADER, invalid, cli.plain_spool_row(cli.event_envelope(independent))]))
        original = source.read_bytes()
        result = self.invoke("--spool-read", source)
        report = json.loads(result.stdout)
        self.assertEqual(self.recommended_ids(report), [independent["science_id"]])
        self.assertEqual(len(report["source_quarantine"]), 1)
        record = report["source_quarantine"][0]
        self.assertEqual(record["event_id"], invalid[0])
        self.assertEqual(record["observed_marker"], invalid[-1])
        self.assertEqual(record["reason"], "MISMATCHED_ROW_ID")
        self.assertEqual(record["row"], 2)
        self.assertEqual(record["row_sha256"], hashlib.sha256(json.dumps(
            invalid, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest())
        self.assertEqual(source.read_bytes(), original)
        self.assertFalse(report["reservation_acquired"])

    def test_output_path_collisions_preserve_all_source_bytes(self):
        source = self.empty_source()
        original = source.read_bytes()
        for args in (("--out", source), ("--out", self.directory / "same.json", "--state-out", self.directory / "same.json")):
            with self.subTest(args=args):
                result = self.invoke("--snapshot", source, *args, success=False)
                self.assertIn("INPUT_OUTPUT_PATH_COLLISION", result.stderr)
                self.assertEqual(source.read_bytes(), original)
        self.assertFalse((self.directory / "same.json").exists())

    def test_proposal_without_sources_or_missing_result_limits_is_not_accepted(self):
        q = question("invalid-proposal")
        events = self.put("events.json", [q])
        self.invoke("--events", events, success=False)
        result = calculation(q)
        result.pop("limitations")
        events = self.put("events.json", [result])
        rejected = self.invoke("--snapshot", self.empty_source(), "--events", events, success=False)
        self.assertIn("RESULT_LIMITATIONS_REQUIRED", rejected.stderr)

    def test_invalid_budget_never_produces_recommendation(self):
        source = self.empty_source()
        for value in ("-1", "nan", "inf", "0"):
            with self.subTest(value=value):
                result = self.invoke("--snapshot", source, "--budget-seconds", value, success=False)
                self.assertIn("BUDGET_INVALID", result.stderr)


if __name__ == "__main__":
    unittest.main()
