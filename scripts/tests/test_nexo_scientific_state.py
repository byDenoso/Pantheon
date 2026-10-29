"""Technical state-machine controls; fixtures are not cosmological results."""
import copy
import datetime as dt
import json
import unittest

from scripts import nexo_scientific_state as s


AT = "2026-10-29T01:00:00Z"
NOW = dt.datetime(2026, 10, 29, 1, 30, tzinfo=dt.timezone.utc)
INPUT_HASH = "a" * 64
OUTPUT_HASH = "b" * 64


def identity(question="technical-control-a"):
    return {"question": question, "estimand": "mean", "observable": "fixture",
            "data": [{"id": "technical-fixture", "version": "1", "sha256": INPUT_HASH}],
            "design": {"null": "zero", "rival": "nonzero", "controls": ["finite-input"]}}


def event(kind="QUESTION", *, key="event-001", science=None, **extra):
    science = science or identity()
    value = {"schema": s.SCHEMA, "event_id": key, "science_id": s.scientific_id(science),
             "identity": science, "kind": kind, "at": AT, "role": "S1"}
    if kind == "QUESTION":
        value.update(activity="E1", dependencies=[{
            "id": "data-method-runtime", "status": "verified", "evidence": "local-control-receipt",
            "checked_at": AT, "expires_at": "2026-10-30T01:00:00Z"}],
            priority={"originality": 1, "discrimination": 1, "impact": 1, "cost": 1})
    if kind == "STARTED":
        value.update(run_id="technical-run-1", lease_until="2026-10-29T02:00:00Z")
    if kind == "CALCULATED":
        value.update(activity="E1", run_id="technical-run-1", numeric_result={"mean": 2.0},
                     scientific_status="INCONCLUSIVE", artifact={"uri": "https://example.org/private-output.json",
                     "sha256": OUTPUT_HASH, "verified_sha256": OUTPUT_HASH,
                     "verified_at": "2026-10-29T01:10:00Z"},
                     receipt={"run_id": "technical-run-1", "runtime": "local_sandbox", "class": "E1",
                              "script_sha256": "c" * 64, "output_sha256": OUTPUT_HASH,
                              "input_hashes": {"fixture.json": INPUT_HASH}})
    value.update(extra)
    return value


def envelope(value, tab="MURAL"):
    if tab == "MURAL":
        row = [value["at"], value["role"], "WRITER", s.PREFIX + json.dumps(value),
               "", "SCIENCE", value["identity"]["question"], value["event_id"]]
    else:
        copied = copy.deepcopy(value)
        method = {s.SCHEMA: copied}
        if "receipt" in copied:
            method["EXECUTOR_RECEIPT_V1"] = copied.pop("receipt")
        row = [value["at"], value["role"], value["identity"]["question"], value["event_id"],
               value.get("scientific_status", "INCONCLUSIVE"), json.dumps(method),
               json.dumps(value.get("numeric_result", {})), "technical control only", "", value.get("artifact", {}).get("uri", "")]
    return {"tab": tab, "stable_id": value["event_id"], "values": row}


def stored(*items):
    result = {"MURAL": {}, "RESULTADOS": {}}
    for item in items:
        result[item["tab"]][item["stable_id"]] = tuple(item["values"])
    return result


class ScientificIdentityTests(unittest.TestCase):
    def test_schedule_seed_and_nonmaterial_code_do_not_create_science(self):
        original = identity()
        changed = dict(original, task_id="new-task", run_id="new-run", seed=100, code_version="new-code")
        changed["design"] = dict(original["design"], random_seed=44, script_sha256="f" * 64)
        self.assertEqual(s.scientific_id(original), s.scientific_id(changed))

    def test_material_design_and_release_change_identity(self):
        changed = copy.deepcopy(identity())
        changed["design"]["material_revision"] = "different-selection-model"
        self.assertNotEqual(s.scientific_id(identity()), s.scientific_id(changed))
        changed = copy.deepcopy(identity())
        changed["data"][0]["version"] = "2"
        self.assertNotEqual(s.scientific_id(identity()), s.scientific_id(changed))

    def test_dataset_order_is_irrelevant_but_unknown_identity_fields_are_errors(self):
        value = identity()
        value["data"].append({"id": "second-fixture", "version": "1", "sha256": "d" * 64})
        self.assertEqual(s.scientific_id(value), s.scientific_id(dict(value, data=list(reversed(value["data"])))))
        with self.assertRaisesRegex(ValueError, "UNKNOWN_IDENTITY_FIELD"):
            s.scientific_id(dict(value, estmiand="typo"))

    def test_nan_missing_hash_and_empty_material_identity_rejected(self):
        for field, value in (("data", []), ("design", {"seed": 1}), ("design", {"x": float("nan")}), ("question", "")):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                s.scientific_id(dict(identity(), **{field: value}))


class ScientificStateTests(unittest.TestCase):
    def build(self, *records, pending=None, **kw):
        return s.build_state(stored(*records), pending or [], now=NOW, **kw)

    def question(self, state):
        return state["questions"][s.scientific_id(identity())]

    def test_empty_state_and_legacy_records_never_fabricate_tests(self):
        legacy = {"tab": "RESULTADOS", "stable_id": "legacy-001", "values": [
            AT, "S1", "R1-1.1", "legacy-001", "COMPLETED READY_NOW", "{broken legacy json", "2", "l", "", ""]}
        state = self.build(legacy)
        self.assertEqual(state["legacy_unclassified"], 1)
        self.assertEqual(state["metrics"]["distinct_quantitative"], 0)
        self.assertEqual(state["incidents"], [])
        self.assertEqual(s.select_next(state, "S1"), [])
        self.assertTrue(s.checkpoint_next_action(state, "S1", "R1-1.1 READY_NOW").startswith("UNVERIFIED_CURSOR"))

    def test_historical_free_text_result_title_is_unclassified_not_invalid(self):
        title = "Historical result: a descriptive title with spaces and punctuation"
        row = ("date", "S4", "item", title, "TECH_CHECK", "legacy method", "1", "limit", "", "local")
        state = s.build_state({"RESULTADOS": {title: row}}, [], now=NOW)
        self.assertEqual(state["legacy_unclassified"], 1)
        self.assertEqual(state["metrics"]["distinct_quantitative"], 0)
        self.assertEqual(state["incidents"], [])
        # The new-event validator remains strict; historical compatibility is
        # not permission to mint a new invalid Writer identity.
        with self.assertRaisesRegex(ValueError, "ROW_SCHEMA_INVALID"):
            s.science_event({"tab": "RESULTADOS", "stable_id": title, "values": list(row)}, now=NOW)

    def test_eligible_question_is_recommendation_without_mutation(self):
        state = self.build(envelope(event()))
        before = copy.deepcopy(state)
        chosen = s.select_next(state, "S1")
        self.assertEqual([x["science_id"] for x in chosen], [s.scientific_id(identity())])
        self.assertEqual(state, before)
        self.assertFalse(chosen[0]["execution_authorized"])

    def test_calculated_pending_survives_timeout_and_new_question_event(self):
        question = envelope(event())
        calculation = envelope(event("CALCULATED", key="result-001"), "RESULTADOS")
        newer = envelope(event(key="event-new", at="2026-10-29T01:20:00Z"))
        state = self.build(question, newer, pending=[{"data": calculation, "state": "CLAIMED:unknown"}])
        q = self.question(state)
        self.assertEqual(q["lifecycle"], "calculated")
        self.assertFalse(q["record_persisted"])
        self.assertEqual(s.select_next(state, "S1"), [])
        self.assertEqual(state["metrics"]["distinct_quantitative"], 1)
        self.assertTrue(s.checkpoint_next_action(state, "S1", "READY_NOW").startswith("PERSIST"))

    def test_same_exact_pending_event_promotes_only_after_canonical_result_readback(self):
        calculation = envelope(event("CALCULATED", key="result-001"), "RESULTADOS")
        before = self.build(pending=[{"data": calculation, "state": "APPLIED:hash"}])
        self.assertEqual(self.question(before)["lifecycle"], "calculated")
        after = self.build(calculation, previous=before)
        self.assertEqual(self.question(after)["lifecycle"], "persisted")
        self.assertEqual(after["ingestion"], {"parsed": 0, "unchanged": 1})
        replay = self.build(calculation, pending=[{"data": calculation, "state": "APPLIED:hash"}], previous=after)
        self.assertEqual(replay["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(replay["metrics"]["persisted"], 1)

    def test_record_presence_does_not_verify_local_or_unread_artifact(self):
        value = event("CALCULATED", key="result-001")
        value["artifact"].pop("verified_sha256")
        q = self.question(self.build(envelope(value, "RESULTADOS")))
        self.assertTrue(q["record_persisted"])
        self.assertFalse(q["artifact_verified"])
        self.assertEqual(q["lifecycle"], "calculated")
        value["artifact"].update(verified_sha256=OUTPUT_HASH, uri="sandbox:/local/output.json")
        self.assertFalse(self.question(self.build(envelope(value, "RESULTADOS")))["artifact_verified"])

    def test_supports_seven_scientific_worker_roles(self):
        for role in ('S5','S6','S7'):
            with self.subTest(role=role):
                proposal = event(key='worker-'+role, role=role)
                proposal['identity']['question'] = 'WORKER-'+role
                proposal['science_id'] = s.scientific_id(proposal['identity'])
                parsed = s.science_event(envelope(proposal), now=NOW)
                self.assertEqual(parsed['role'], role)

    def test_recommendation_limit_is_not_fixed_at_six(self):
        state = s.build_state(stored(), [], now=NOW)
        self.assertEqual(len(s.plan_research(state, 'S5', limit=10)['recommendations']), 0)
        with self.assertRaises(ValueError):
            s.plan_research(state,'S5',limit=51)

    def test_mural_or_spool_persisted_claim_is_not_canonical_scientific_persistence(self):
        calculated = envelope(event("CALCULATED", key="result-001"))
        claim = envelope(event("PERSISTED", key="claim-001", run_id="technical-run-1"))
        state = self.build(calculated, claim)
        self.assertEqual(self.question(state)["lifecycle"], "calculated")
        self.assertEqual(state["metrics"]["persisted"], 0)

    def test_expired_lease_demands_reconciliation_and_does_not_reopen(self):
        started = event("STARTED", key="start-001", lease_until="2026-10-29T01:10:00Z")
        state = self.build(envelope(event()), envelope(started))
        q = self.question(state)
        self.assertEqual(q["lifecycle"], "running")
        self.assertTrue(q["reconciliation_required"])
        self.assertFalse(q["execution_authorized"])
        self.assertIn("LEASE_EXPIRED_RECONCILE", q["reasons"])
        self.assertEqual(s.select_next(state, "S1"), [])

    def test_pending_start_prevents_duplicate_but_does_not_authorize_execution(self):
        pending = {"data": envelope(event("STARTED", key="start-001")), "state": ""}
        state = self.build(envelope(event()), pending=[pending])
        self.assertEqual(self.question(state)["lifecycle"], "running")
        self.assertFalse(self.question(state)["execution_authorized"])
        self.assertEqual(s.select_next(state, "S1"), [])

    def test_confirmed_nonexecution_can_release_only_its_run_not_a_calculation(self):
        base = [envelope(event()), envelope(event("STARTED", key="start-001"))]
        released = envelope(event("RECONCILED", key="reconcile-001", at="2026-10-29T01:20:00Z",
                                  run_id="technical-run-1", outcome="not_executed", evidence="verified-backend-receipt"))
        self.assertEqual(len(s.select_next(self.build(*base, released), "S1")), 1)
        pending_only = self.build(*base, pending=[{"data": released, "state": ""}])
        self.assertEqual(s.select_next(pending_only, "S1"), [])
        calculated = envelope(event("CALCULATED", key="result-001"), "RESULTADOS")
        self.assertEqual(s.select_next(self.build(*base, calculated, released), "S1"), [])

    def test_blocked_and_expired_dependencies_do_not_monopolize_other_questions(self):
        blocked = event()
        blocked["dependencies"][0]["status"] = "missing"
        other = event(key="event-other", science=identity("independent-question"))
        state = self.build(envelope(blocked), envelope(other))
        self.assertEqual([q["identity"]["question"] for q in s.select_next(state, "S1")], ["independent-question"])
        blocked["dependencies"][0].update(status="verified", expires_at="2026-10-29T01:01:00Z")
        state = self.build(envelope(blocked), envelope(other))
        self.assertEqual(self.question(state)["lifecycle"], "blocked")
        self.assertTrue(s.checkpoint_next_action(state, "S1", "old READY_NOW").startswith("NEXT "))
        self.assertNotIn("old READY_NOW", s.checkpoint_next_action(state, "S1", "old READY_NOW"))

    def test_missing_readiness_is_never_assumed(self):
        state = self.build(envelope(event(dependencies=[])))
        self.assertEqual(self.question(state)["lifecycle"], "blocked")

    def test_dependency_delta_rechecks_evidence_not_expiry_alone(self):
        old = event()
        old["dependencies"][0]["status"] = "missing"
        before = self.build(envelope(old))
        checked = event("DEPENDENCY", key="dependency-001", at="2026-10-29T01:20:00Z",
                        dependency={"id": "data-method-runtime", "status": "verified", "evidence": "new-real-readback",
                                    "checked_at": "2026-10-29T01:19:00Z", "expires_at": "2026-10-30T01:00:00Z"})
        after = self.build(envelope(checked), previous=before)
        self.assertEqual(len(s.select_next(after, "S1")), 1)

    def test_closed_inconclusive_question_stays_consumed(self):
        close = event("CLOSED", key="close-001", at="2026-10-29T01:10:00Z",
                      reason="Question investigated; no discriminating result", evidence="real-result-reference")
        state = self.build(envelope(event("CALCULATED", key="result-001"), "RESULTADOS"),
                           envelope(close), envelope(event(key="ready-again", at="2026-10-29T01:20:00Z")))
        q = self.question(state)
        self.assertEqual(q["lifecycle"], "closed")
        self.assertEqual(q["scientific_status"], "INCONCLUSIVE")
        self.assertEqual(q["result_state"], "persisted")
        self.assertEqual(state["metrics"]["persisted"], 1)
        self.assertEqual(s.select_next(state, "S1"), [])
        pending_result = event("CALCULATED", key="result-001")
        pending_result["artifact"].pop("verified_sha256")
        pending = self.build(envelope(pending_result, "RESULTADOS"), envelope(close))
        self.assertEqual(self.question(pending)["lifecycle"], "closed")
        self.assertEqual(pending["metrics"]["calculated"], 1)

    def test_different_task_runs_for_same_science_count_once(self):
        one = event("CALCULATED", key="result-001")
        two = copy.deepcopy(one)
        two.update(event_id="result-002", run_id="technical-run-2", task_id="other-scheduler")
        two["receipt"]["run_id"] = "technical-run-2"
        state = self.build(envelope(one, "RESULTADOS"), envelope(two, "RESULTADOS"))
        self.assertEqual(state["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(state["metrics"]["duplicate_executions"], 1)

    def test_reviews_qa_setup_and_heartbeats_do_not_inflate_new_test_count(self):
        for activity in ("E1-REVIEW", "QA", "TECH_CHECK", "SETUP", "HEARTBEAT"):
            value = event("CALCULATED", key="result-001", activity=activity)
            value["receipt"]["class"] = activity
            with self.subTest(activity=activity):
                state = self.build(envelope(value, "RESULTADOS"))
                self.assertEqual(state["metrics"]["distinct_quantitative"], 0)
                self.assertEqual(state["metrics"]["quantitative_reviews"], int(activity == "E1-REVIEW"))
        self.assertEqual(s.select_next(self.build(envelope(event(activity="QA"))), "S1"), [])

    def test_priority_is_deterministic_and_configurable(self):
        records = []
        for i in range(8):
            distinct = identity(f"question-{i}")
            # This test concerns distinct scientific estimands, not eight
            # aliases of the same physical calculation.
            distinct["estimand"] = f"moment-{i+1}"
            value = event(key=f"candidate-{i}", science=distinct,
                          priority={"originality": 1, "discrimination": 1, "impact": 1, "cost": i+1})
            records.append(envelope(value))
        state = self.build(*reversed(records))
        self.assertEqual([q["identity"]["question"] for q in s.select_next(state, "S1")],
                         [f"question-{i}" for i in range(8)])
        self.assertEqual(len(s.select_next(state, "S1", 6)), 6)
        self.assertEqual(s.select_next(state, "S2"), [])
        with self.assertRaises(ValueError):
            s.select_next(state, "S1", 51)

    def test_circular_prerequisites_block_only_their_dependents(self):
        one, two = event(), event(key="event-two", science=identity("question-two"))
        one["requires"], two["requires"] = [two["science_id"]], [one["science_id"]]
        third = event(key="event-three", science=identity("question-three"))
        state = self.build(envelope(one), envelope(two), envelope(third))
        self.assertEqual([q["identity"]["question"] for q in s.select_next(state, "S1")], ["question-three"])

    def test_same_id_different_content_blocks_question_and_preserves_first(self):
        first = envelope(event())
        second = envelope(event(priority={"cost": 2}))
        state = self.build(first, pending=[{"data": second, "state": ""}])
        self.assertTrue(self.question(state)["reconciliation_required"])
        self.assertEqual(s.select_next(state, "S1"), [])
        self.assertIn("EVENT_CONTENT_CONFLICT", [x["reason"] for x in state["incidents"]])

    def test_same_run_conflicting_outputs_do_not_count_as_verified_test(self):
        one, two = event("CALCULATED", key="result-001"), event("CALCULATED", key="result-002")
        two["receipt"]["output_sha256"] = "d" * 64
        two["artifact"].update(sha256="d"*64, verified_sha256="d"*64)
        state = self.build(envelope(one, "RESULTADOS"), envelope(two, "RESULTADOS"))
        self.assertTrue(self.question(state)["reconciliation_required"])
        self.assertEqual(state["metrics"]["distinct_quantitative"], 0)

    def test_malformed_typed_calculation_prevents_blind_reexecution(self):
        value = event("CALCULATED", key="result-001")
        value["receipt"]["output_sha256"] = "not-a-hash"
        state = self.build(envelope(event()), envelope(value, "RESULTADOS"))
        self.assertTrue(self.question(state)["reconciliation_required"])
        self.assertEqual(s.select_next(state, "S1"), [])

    def test_opt_in_duplicate_json_keys_and_nonfinite_values_rejected(self):
        record = envelope(event())
        record["values"][3] = s.PREFIX + '{"schema":"NEXO_SCIENCE_V1","schema":"duplicate"}'
        self.assertEqual(self.build(record)["incidents"][0]["reason"], "DUPLICATE_JSON_KEY")
        value = event("CALCULATED", key="result-001", numeric_result={"bad": float("nan")})
        self.assertEqual(self.build(envelope(value, "RESULTADOS"))["incidents"][0]["reason"], "NONFINITE_JSON")

    def test_row_sender_event_id_and_science_id_are_bound(self):
        for field, value in (("event_id", "wrong-id"), ("science_id", "science-" + "f"*64), ("role", "S2")):
            record = envelope(event())
            changed = event(**{field: value})
            record["values"][3] = s.PREFIX + json.dumps(changed)
            with self.subTest(field=field):
                self.assertTrue(self.build(record)["incidents"])
                with self.assertRaises(ValueError):
                    s.science_event(record, now=NOW)

    def test_timezone_and_future_event_are_explicit_errors(self):
        with self.assertRaisesRegex(ValueError, "TIMEZONE_REQUIRED"):
            s.build_state({}, [], now=dt.datetime(2026, 1, 1))
        future = self.build(envelope(event(at="2027-01-01T00:00:00Z")))
        self.assertEqual(future["incidents"][0]["reason"], "FUTURE_EVENT")

    def test_serial_reservation_admission_requires_ready_question_and_readback(self):
        proposal = s.science_event(envelope(event("STARTED", key="start-001")), now=NOW)
        empty = self.build()
        self.assertEqual(s.reservation_error(empty, proposal), "QUESTION_NOT_DECLARED")
        ready = self.build(envelope(event()))
        self.assertIsNone(s.reservation_error(ready, proposal))
        accepted = self.build(envelope(event()), envelope(event("STARTED", key="start-001")))
        self.assertIsNone(s.reservation_error(accepted, proposal))
        duplicate = dict(proposal, event_id="start-002", run_id="other-run")
        self.assertEqual(s.reservation_error(accepted, duplicate), "SCIENTIFIC_QUESTION_NOT_ELIGIBLE")
        completed = self.build(envelope(event("CALCULATED", key="result-001"), "RESULTADOS"))
        self.assertEqual(s.reservation_error(completed, duplicate), "SCIENTIFIC_QUESTION_NOT_ELIGIBLE")

    def test_terminally_rejected_second_reservation_does_not_poison_accepted_science(self):
        base = [envelope(event()), envelope(event("STARTED", key="start-001"))]
        refused = envelope(event("STARTED", key="start-002", run_id="duplicate-run"))
        state = self.build(*base, pending=[{"data": refused,
                          "state": "INVALID:SCIENCE_RESERVATION_SCIENTIFIC_QUESTION_NOT_ELIGIBLE"}])
        q = self.question(state)
        self.assertEqual(q["lifecycle"], "running")
        self.assertFalse(q["reconciliation_required"])
        self.assertEqual(q["run_id"], "technical-run-1")
        self.assertTrue(state["incidents"])
        with self.assertRaisesRegex(ValueError, "RESERVATION_REQUIRES_MURAL"):
            s.science_event(envelope(event("STARTED", key="start-001"), "RESULTADOS"), now=NOW)

    def test_incremental_rejection_preserves_incident_without_poisoning_question(self):
        proposal = envelope(event("STARTED", key="start-002", run_id="other-run"))
        before = self.build(envelope(event()), pending=[{"data": proposal, "state": ""}])
        after = self.build(pending=[{"data": proposal,
                         "state": "INVALID:SCIENCE_RESERVATION_QUESTION_NOT_ELIGIBLE"}], previous=before)
        self.assertEqual(self.question(after)["lifecycle"], "eligible")
        self.assertFalse(self.question(after)["reconciliation_required"])
        self.assertTrue(after["incidents"])


if __name__ == "__main__":
    unittest.main()
