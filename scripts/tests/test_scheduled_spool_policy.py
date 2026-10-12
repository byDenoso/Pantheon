"""Scheduled role envelopes cannot smuggle privileged or cross-role operations."""
import base64
import json
import unittest

from scripts.scheduled_spool_policy import ScheduledSpoolError, validate_scheduled_envelope


def make(kind="BOARD_POST", role="PITIA", payload=None, **changes):
    data = {
        "kind": kind,
        "source": role,
        "created_at": "2026-10-12T15:00:00Z",
        "intent_id": "TASK-STABLE-0001",
        "payload": payload if payload is not None else {
            "to": "LEARNER", "text": "Leia a fonte e retorne uma hipotese."
        },
    }
    data.update(changes)
    return {
        "stable_id": "sched-v1-nexo-proposal-0001",
        "role": role,
        "envelope_b64url": base64.urlsafe_b64encode(
            json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
        ).decode().rstrip("="),
    }


class ScheduledSpoolPolicyTests(unittest.TestCase):
    def test_autonomous_governed_kinds_keep_writer_envelope(self):
        for kind, role, payload in [
            ("BOARD_POST", "PITIA", {"to": "LEARNER", "text": "revise"}),
            ("INTEGRITY_REPORT", "GUARDIAO", {"status": "YELLOW"}),
            ("LEARNING_SIGNAL", "LEARNER", {"gap_type": "TOOL"}),
            ("HYPOTHESIS_PROPOSAL", "LEARNER", {"question": "Nova hipotese?"}),
            ("SEMANTIC_BACKFILL", "ADVISOR", {"items": []}),
            ("DATA_BINDING", "EXECUTOR", {"items": []}),
            ("MUTATION_PROPOSAL", "EXECUTOR", {"test_id": "T-SYNTH", "result": {}}),
            ("CONTEST", "REFEREE_1", {"test_id": "T-SYNTH", "reason": "check"}),
            ("VERDICT_REVIEW", "REFEREE_1", {"test_id": "T-SYNTH"}),
        ]:
            with self.subTest(kind=kind):
                row = make(kind, role, payload)
                accepted = validate_scheduled_envelope(row)
                self.assertEqual(accepted["kind"], kind)
                self.assertEqual(accepted["source"], role)
                self.assertEqual(accepted["intent_id"], "TASK-STABLE-0001")
                self.assertNotIn("_inbox_source", accepted)

    def test_human_authority_and_private_handoff_still_refused(self):
        for kind, role in [
            ("HANDOFF", "LEARNER"),
            ("HANDOFF_TRANSITION", "EXECUTOR"),
            ("OPERATOR_INTENT", "DENER"),
            ("OPERATIONAL_CANARY", "GUARDIAO"),
            ("OPERATIONAL_RECEIPT", "EXECUTOR"),
            ("ENXAME_EVENT", "LEARNER"),
            ("BATCH", "PITIA"),
            ("TEST_BATTERY", "EXECUTOR"),
            ("FAMILY_CHARTER", "PITIA"),
            ("FITNESS_REPORT", "GUARDIAO"),
        ]:
            with self.subTest(kind=kind):
                with self.assertRaises(ScheduledSpoolError):
                    validate_scheduled_envelope(make(kind, role))

    def test_cross_role_result_and_review_refused(self):
        for kind, role in [
            ("MUTATION_PROPOSAL", "LEARNER"),
            ("VERDICT_REVIEW", "EXECUTOR"),
            ("CONTEST", "PITIA"),
        ]:
            with self.subTest(kind=kind):
                with self.assertRaises(ScheduledSpoolError):
                    validate_scheduled_envelope(make(kind, role))

    def test_role_claim_must_match_private_spool_column(self):
        r = make(role="GUARDIAO")
        r["role"] = "LEARNER"
        with self.assertRaisesRegex(ScheduledSpoolError, "ROLE_NOT_AUTHORIZED"):
            validate_scheduled_envelope(r)

    def test_bad_json_and_unexpected_fields_are_not_implicitly_inferred(self):
        r = make(extra_admin_field=True)
        with self.assertRaisesRegex(ScheduledSpoolError, "ENVELOPE_FIELDS"):
            validate_scheduled_envelope(r)
        r = make()
        r["envelope_b64url"] = base64.urlsafe_b64encode(
            b'{"kind":"BOARD_POST","kind":"OPERATOR_INTENT"}'
        ).decode().rstrip("=")
        with self.assertRaisesRegex(ScheduledSpoolError, "DUPLICATE_JSON_KEY"):
            validate_scheduled_envelope(r)

    def test_identity_and_timestamp_are_bounded_and_explicit(self):
        r = make(created_at="2026-10-12T15:00:00-03:00")
        with self.assertRaisesRegex(ScheduledSpoolError, "TIMESTAMP_INVALID"):
            validate_scheduled_envelope(r)
        r = make()
        r["stable_id"] = "bad/private/identifier"
        with self.assertRaisesRegex(ScheduledSpoolError, "STABLE_ID_INVALID"):
            validate_scheduled_envelope(r)


if __name__ == "__main__":
    unittest.main()
