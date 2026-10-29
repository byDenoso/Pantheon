"""Research-planning regression tests, with explicitly synthetic software fixtures."""
import copy
import datetime as dt
import unittest

from scripts import nexo_scientific_state as s
from scripts.tests.test_nexo_scientific_state import (
    AT, NOW, OUTPUT_HASH, envelope, event, identity, stored,
)


def opportunity(seconds=10, information=.8):
    return {
        "physical_question": "Do the two fixture mechanisms predict distinct observables?",
        "hypotheses": [{"id": "null", "prediction": "zero conditional mean"},
                       {"id": "rival", "prediction": "nonzero conditional mean"}],
        "discriminator": "conditional mean with its declared covariance",
        "expected_information": {"rating": information, "basis": "synthetic test of ranking; no measured power"},
        "cost": {"seconds": seconds, "basis": "fixture estimate, not measured runtime"},
        "literature": {"status": "pending", "scope": "software fixture only", "references": []},
    }


def distinct_identity(name, estimand=None):
    value = identity(name)
    value["estimand"] = estimand or name + "-estimand"
    return value


def historical_row():
    return {"tab": "RESULTADOS", "stable_id": "Historical result: descriptive title",
            "values": [AT, "S1", "old-item", "Historical result: descriptive title",
                       "INCONCLUSIVE", "Real prior method, opaque to this software fixture", "2.0",
                       "conditional result only", "existing-reference", "private-existing-uri"]}


def history_link(source, relation="equivalent"):
    return {"tab": source["tab"], "stable_id": source["stable_id"],
            "row_sha256": s.canonical_row_sha256(source["values"]), "relation": relation,
            "basis": "Explicit scientist comparison: same estimand, observable, bytes and design",
            "checked_at": AT}


class ResearchPlannerTests(unittest.TestCase):
    def build(self, *items, **kw):
        return s.build_state(stored(*items), [], now=NOW, **kw)

    def test_renaming_aliasing_and_new_seed_cannot_repeat_calculated_science(self):
        old = event("CALCULATED", key="old-result")
        renamed = identity("same-science-renamed")
        renamed.update(title="A new title", seed=77)
        renamed["data"][0].update(id="same-bytes-new-storage-alias", version="new-label")
        self.assertNotEqual(s.scientific_id(old["identity"]), s.scientific_id(renamed))
        self.assertEqual(s.equivalence_id(old["identity"]), s.equivalence_id(renamed))
        proposal = event(key="renamed-proposal", science=renamed)
        state = self.build(envelope(old, "RESULTADOS"), envelope(proposal))
        self.assertEqual(s.select_next(state, "S1"), [])
        self.assertEqual(state["metrics"]["distinct_quantitative"], 1)
        self.assertIn("EQUIVALENT_ALREADY_TESTED", " ".join(state["questions"][proposal["science_id"]]["reasons"]))

    def test_material_estimand_or_covariance_change_can_be_evaluated_separately(self):
        other = distinct_identity("conditional-variance", "variance")
        covariance_change = copy.deepcopy(identity())
        covariance_change["design"]["covariance"] = "different-validated-noise-model"
        for value in (other, covariance_change):
            with self.subTest(value=value):
                proposal = event(key="new-proposal", science=value)
                state = self.build(envelope(event("CALCULATED", key="old-result"), "RESULTADOS"), envelope(proposal))
                self.assertEqual([q["science_id"] for q in s.select_next(state, "S1")], [proposal["science_id"]])

    def test_distinct_counter_deduplicates_equivalent_completed_runs(self):
        one = event("CALCULATED", key="result-one")
        alias = identity("renamed-equivalent")
        two = event("CALCULATED", key="result-two", science=alias, run_id="run-two")
        two["receipt"]["run_id"] = "run-two"
        state = self.build(envelope(one, "RESULTADOS"), envelope(two, "RESULTADOS"))
        self.assertEqual(state["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(state["metrics"]["duplicate_executions"], 1)

    def test_equivalence_is_cross_role_and_reservation_admission_rejects_alias(self):
        base = event()
        renamed = event(key="other-role-question", science=identity("same-physical-science"), role="S2")
        start = event("STARTED", key="start-one")
        state = self.build(envelope(base), envelope(start), envelope(renamed))
        proposal = event("STARTED", key="start-two", science=renamed["identity"], role="S2", run_id="different-run")
        self.assertEqual(s.reservation_error(state, proposal), "SCIENTIFIC_QUESTION_NOT_ELIGIBLE")
        self.assertEqual(s.select_next(state, "S2"), [])

    def test_local_start_deduplicates_without_claiming_distributed_authority(self):
        local = event("STARTED", key="local-start", execution_mode="LOCAL_ISOLATED")
        ready = self.build(envelope(event()))
        self.assertIsNone(s.reservation_error(ready, s.science_event(envelope(local), now=NOW)))
        state = self.build(envelope(event()), envelope(local))
        q = state["questions"][local["science_id"]]
        self.assertEqual(q["lifecycle"], "running")
        self.assertFalse(q["execution_authorized"])
        self.assertIn("LOCAL_EXECUTION_NOT_DISTRIBUTED_RESERVATION", q["reasons"])
        self.assertNotIn("RESERVATION_READBACK_PENDING", q["reasons"])
        self.assertEqual(s.select_next(state, "S1"), [])
        expired = dict(local, lease_until="2026-10-29T01:10:00Z")
        after = self.build(envelope(event()), envelope(expired))
        self.assertTrue(after["questions"][local["science_id"]]["reconciliation_required"])
        self.assertIn("LEASE_EXPIRED_RECONCILE", after["questions"][local["science_id"]]["reasons"])
        # Legacy semantics are retained; the external capability requirement
        # is documented and explicit in the recommendation, not inferred here.
        coordinated = self.build(envelope(event()), envelope(event("STARTED", key="legacy-start")))
        self.assertTrue(coordinated["questions"][local["science_id"]]["execution_authorized"])
        self.assertIn("externally verified deployed Writer admission capability",
                      ready["questions"][local["science_id"]]["next_action"])
        for mode in ("UNKNOWN", None, []):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "EXECUTION_MODE_INVALID"):
                s.science_event(envelope(event("STARTED", key="invalid-start", execution_mode=mode)), now=NOW)

    def test_legacy_equivalence_requires_exact_canonical_source_and_mints_no_result(self):
        legacy = historical_row()
        question = event(prior_evidence=[history_link(legacy)])
        state = self.build(legacy, envelope(question))
        q = state["questions"][question["science_id"]]
        self.assertEqual(q["lifecycle"], "closed")
        self.assertTrue(q["historical_equivalent"])
        self.assertFalse(q["has_calculation"])
        self.assertFalse(q["record_persisted"])
        self.assertEqual(state["metrics"]["distinct_quantitative"], 0)
        self.assertEqual(state["metrics"]["historical_equivalents_reused"], 1)
        # Subsequent READY/QUESTION declarations cannot erase known equivalence.
        after = self.build(envelope(event(key="ready-again", at="2026-10-29T01:20:00Z")), previous=state)
        self.assertEqual(s.select_next(after, "S1"), [])

    def test_unverified_or_changed_history_blocks_only_scoped_question(self):
        source = historical_row()
        question = event(prior_evidence=[history_link(source)])
        other = event(key="independent-candidate", science=distinct_identity("independent"))
        for rows in ([], [dict(source, values=source["values"][:-1] + ["different-uri"]) ]):
            with self.subTest(rows=rows):
                state = self.build(*rows, envelope(question), envelope(other))
                self.assertEqual([q["science_id"] for q in s.select_next(state, "S1")], [other["science_id"]])
                self.assertEqual(state["metrics"]["distinct_quantitative"], 0)

    def test_exact_historical_reuse_needs_no_fresh_execution_inputs(self):
        source = historical_row()
        question = event(dependencies=[], prior_evidence=[history_link(source)])
        state = self.build(source, envelope(question))
        q = state["questions"][question["science_id"]]
        self.assertEqual(q["lifecycle"], "closed")
        self.assertTrue(q["historical_equivalent"])
        self.assertEqual(s.plan_research(state, "S1")["dependency_actions"], [])
        self.assertEqual(state["metrics"]["distinct_quantitative"], 0)
        # An actual unresolved event conflict is not hidden by historical reuse.
        conflicting = envelope(event(dependencies=[], prior_evidence=[history_link(source)],
                                     title="changed bytes under same event id"))
        conflict = s.build_state(stored(source, envelope(question)),
                                 [{"data": conflicting, "state": ""}], now=NOW)
        self.assertTrue(conflict["questions"][question["science_id"]]["reconciliation_required"])
        self.assertEqual(len(s.plan_research(conflict, "S1")["dependency_actions"]), 1)

    def test_pending_source_and_conflicted_source_never_verify_historical_link(self):
        source = historical_row()
        question = event(prior_evidence=[history_link(source)])
        pending = s.build_state(stored(envelope(question)), [{"data": source, "state": ""}], now=NOW)
        self.assertFalse(pending["questions"][question["science_id"]]["historical_equivalent"])
        class ConflictIndex(dict):
            conflicts = {source["stable_id"]}
        source_index = ConflictIndex({source["stable_id"]: tuple(source["values"])})
        state = s.build_state({"MURAL": stored(envelope(question))["MURAL"], "RESULTADOS": source_index}, [], now=NOW)
        self.assertFalse(state["questions"][question["science_id"]]["historical_equivalent"])

    def test_informs_link_does_not_close_materially_new_estimand(self):
        source = historical_row()
        question = event(science=distinct_identity("new-estimand"), prior_evidence=[history_link(source, "informs")])
        state = self.build(source, envelope(question))
        self.assertEqual(len(s.select_next(state, "S1")), 1)
        self.assertFalse(state["questions"][question["science_id"]]["historical_equivalent"])

    def test_plan_reselects_after_result_and_block_without_new_queue(self):
        one = event(key="candidate-one", opportunity=opportunity(seconds=1))
        two = event(key="candidate-two", science=distinct_identity("second-physical-estimand"),
                    opportunity=opportunity(seconds=2))
        three = event(key="candidate-three", science=distinct_identity("third-physical-estimand"),
                      opportunity=opportunity(seconds=3))
        initial = self.build(*(envelope(x) for x in (one, two, three)))
        plan = s.plan_research(initial, "S1", 1)
        self.assertEqual(plan["recommendations"][0]["science_id"], one["science_id"])
        complete = event("CALCULATED", key="result-one", interpretation={
            "physical_meaning": "Conditional test has insufficient discriminatory precision",
            "hypothesis_update": "Both fixture hypotheses remain viable",
            "effect_origin": "statistical conditional to this fixture",
            "not_identifiable": "physical mechanism",
            "next_observation": "Independent second observable with different rival prediction"})
        after = self.build(envelope(complete, "RESULTADOS"), previous=initial)
        plan = s.plan_research(after, "S1", 1)
        self.assertEqual(plan["recommendations"][0]["science_id"], two["science_id"])
        blocked = event("DEPENDENCY", key="missing-input", science=two["identity"],
                        at="2026-10-29T01:20:00Z", dependency={"id": "data-method-runtime", "status": "missing",
                        "evidence": "Observed absent input", "checked_at": "2026-10-29T01:20:00Z",
                        "expires_at": "2026-10-30T01:00:00Z"})
        final = self.build(envelope(blocked), previous=after)
        plan = s.plan_research(final, "S1", 1)
        self.assertEqual(plan["recommendations"][0]["science_id"], three["science_id"])
        self.assertEqual(plan["feedback"][0]["status"], "RECORDED")
        self.assertEqual(final["metrics"]["distinct_quantitative"], 1)
        self.assertEqual(len(final["_records"]), 5)
        self.assertTrue(plan["selection_only"])
        self.assertFalse(plan["dispatch_performed"])

    def test_information_and_cost_estimates_rank_with_basis_and_respect_budget(self):
        expensive = event(key="candidate-expensive", opportunity=opportunity(seconds=100, information=1))
        cheap = event(key="candidate-cheap", science=distinct_identity("cheaper"),
                      opportunity=opportunity(seconds=5, information=.6))
        state = self.build(envelope(expensive), envelope(cheap))
        before = copy.deepcopy(state)
        plan = s.plan_research(state, "S1", budget_seconds=6)
        self.assertEqual([q["science_id"] for q in plan["recommendations"]], [cheap["science_id"]])
        self.assertEqual(plan["remaining_estimated_seconds"], 1)
        self.assertFalse(plan["ranking"][0]["score_basis"]["measured_information_gain"])
        self.assertIn("information_basis", plan["ranking"][0]["score_basis"])
        self.assertEqual(state, before)
        plan["recommendations"][0]["identity"]["design"]["tamper"] = True
        self.assertEqual(state, before)

    def test_unknown_cost_is_not_invented_when_budget_is_bounded(self):
        state = self.build(envelope(event()))
        self.assertEqual(s.plan_research(state, "S1", budget_seconds=100)["recommendations"], [])
        self.assertEqual(s.plan_research(state, "S1")["recommendations"][0]["science_id"], event()["science_id"])

    def test_pending_literature_does_not_block_exploration_or_claim_originality(self):
        question = event(opportunity=opportunity(), priority={"originality": 1e6})
        state = self.build(envelope(question))
        plan = s.plan_research(state, "S1")
        self.assertEqual(len(plan["recommendations"]), 1)
        self.assertAlmostEqual(plan["ranking"][0]["score"], .16)
        self.assertFalse(plan["history_coverage"]["complete_history_novelty_claim"])

    def test_local_calculated_dependency_uses_actual_hash_readback_not_transport(self):
        result = event("CALCULATED", key="local-result")
        result["artifact"] = {"uri": "sandbox:/local/result.json", "sha256": OUTPUT_HASH}
        dependency = {"science_id": result["science_id"], "minimum_state": "calculated",
                      "artifact_readback": {"uri": "sandbox:/local/result.json", "sha256": OUTPUT_HASH,
                      "evidence": "Local bytes read and SHA256 checked", "checked_at": AT,
                      "expires_at": "2026-10-30T01:00:00Z"}}
        follow = event(key="followup-question", science=distinct_identity("followup"), requires=[dependency])
        state = self.build(envelope(result, "RESULTADOS"), envelope(follow))
        self.assertEqual(state["questions"][result["science_id"]]["result_state"], "calculated")
        self.assertEqual([q["science_id"] for q in s.select_next(state, "S1")], [follow["science_id"]])
        wrong = copy.deepcopy(follow)
        wrong["requires"][0]["artifact_readback"]["sha256"] = "d" * 64
        self.assertEqual(s.select_next(self.build(envelope(result, "RESULTADOS"), envelope(wrong)), "S1"), [])
        legacy = dict(follow, requires=[result["science_id"]])
        self.assertEqual(s.select_next(self.build(envelope(result, "RESULTADOS"), envelope(legacy)), "S1"), [])

    def test_invalid_opportunity_and_source_claim_are_rejected(self):
        cases = []
        bad = opportunity(); bad["hypotheses"] = bad["hypotheses"][:1]; cases.append({"opportunity": bad})
        bad = opportunity(); bad["cost"]["seconds"] = 0; cases.append({"opportunity": bad})
        bad = opportunity(); bad["expected_information"]["rating"] = float("nan"); cases.append({"opportunity": bad})
        bad = history_link(historical_row()); bad["row_sha256"] = "guessed"; cases.append({"prior_evidence": [bad]})
        for kw in cases:
            with self.subTest(kw=kw), self.assertRaises(ValueError):
                s.science_event(envelope(event(**kw)), now=NOW)


if __name__ == "__main__":
    unittest.main()
