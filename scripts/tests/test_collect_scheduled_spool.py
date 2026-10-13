import base64
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from scripts import collect_scheduled_spool as collector


def digest(value):
    raw = json.dumps({"contract": "OPERATION_RECEIPT_V1", "payload": value},
                     ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def envelope():
    return {"kind": "BOARD_POST", "source": "ENGINEER", "created_at": "2026-10-13T00:00:00Z",
            "intent_id": "fixture-private-intent", "payload": {"to": "GUARDIAO", "text": "Synthetic fixture"}}


def csv_row(value=None, stable="sched-v1-fixture"):
    encoded = base64.urlsafe_b64encode(json.dumps(value or envelope()).encode()).decode().rstrip("=")
    return f"{stable},ENGINEER,{encoded}\n"


def response(status=200, *, content=b"fixture-tower", text=""):
    return SimpleNamespace(status_code=status, content=content, text=text)


def runtime(receipt=None):
    return SimpleNamespace(read=Mock(return_value={"stable_file_id": collector.TOWER_ID, "revision": "fixture-rev"}),
                           verify=Mock(return_value="fixture-rev"), payload_hash=digest,
                           receipt_index=Mock(return_value={}),
                           receipt_status=Mock(return_value={"receipt": receipt}))


class ScheduledSpoolCollection(unittest.TestCase):
    def sheet(self, row=None):
        return response(text="stable_id,role,envelope_b64url\n" + (row or csv_row()))

    def test_private_applied_or_terminal_receipt_is_not_reoffered_by_exact_identity(self):
        for outcome in ("APPLIED", "ALREADY_APPLIED", "REJECTED_TERMINAL"):
            with self.subTest(outcome=outcome):
                reader = runtime({"outcome": outcome})
                existing = {"items": [{"id": "independent-source"}]}
                session = Mock(get=Mock(side_effect=[response(), self.sheet()]))
                result, counts = collector.collect(session, "private-spool", existing, reader)
                self.assertEqual(result, existing)
                self.assertEqual(counts["resolved"], 1)
                reader.receipt_status.assert_called_once_with(reader.read.return_value, {
                    "intent_id": "fixture-private-intent", "payload_sha256": digest(envelope())}, index={})
                reader.receipt_index.assert_called_once_with(reader.read.return_value)

    def test_unresolved_has_private_source_and_preserves_envelope_bytes_semantics(self):
        reader = runtime()
        session = Mock(get=Mock(side_effect=[response(), self.sheet()]))
        result, counts = collector.collect(session, "private-spool", {"items": [{"id": "other"}]}, reader)
        self.assertEqual(result["items"][1], {"id": "sheet-sched-v1-fixture",
                         "source": "SHEET_PRIVATE", "envelope": envelope()})
        self.assertEqual(counts["collected"], 1)

    def test_429_503_and_timeout_are_bounded_and_recover_on_same_source(self):
        for failure in (response(429), response(503), TimeoutError()):
            with self.subTest(failure=failure):
                session = Mock(get=Mock(side_effect=[response(), failure, self.sheet()]))
                pause = Mock()
                result, counts = collector.collect(session, "private-spool", {"items": []}, runtime(), pause=pause)
                self.assertEqual(counts["collected"], 1)
                calls = session.get.call_args_list
                self.assertEqual(calls[1], calls[2])
                self.assertEqual(calls[1].kwargs["timeout"], 15)
                pause.assert_called_once_with(1)

    def test_exhausted_source_or_authorization_refusal_preserves_independent_feed(self):
        for failure, attempts in ((response(429), 3), (response(503), 3), (TimeoutError(), 3),
                                  (response(403), 1), (response(401), 1)):
            with self.subTest(failure=failure):
                existing = {"items": [{"id": "independent-source"}]}
                session = Mock(get=Mock(side_effect=[response(), *[failure] * attempts]))
                with self.assertRaises(collector.SourceUnavailable):
                    collector.collect(session, "private-spool", existing, runtime(), pause=lambda _: None)
                self.assertEqual(existing, {"items": [{"id": "independent-source"}]})
                self.assertEqual(session.get.call_count, attempts + 1)

    def test_conflicting_stable_identity_or_invalid_tower_never_commits_partial_source(self):
        rows = csv_row() + csv_row({**envelope(), "payload": {"to": "GUARDIAO", "text": "Changed"}})
        existing = {"items": [{"id": "independent"}]}
        session = Mock(get=Mock(side_effect=[response(), self.sheet(rows)]))
        with self.assertRaisesRegex(ValueError, "STABLE_ID_CONFLICT"):
            collector.collect(session, "private-spool", existing, runtime())
        self.assertEqual(existing, {"items": [{"id": "independent"}]})
        reader = runtime()
        reader.verify.side_effect = ValueError("integrity")
        session = Mock(get=Mock(return_value=response()))
        with self.assertRaisesRegex(ValueError, "integrity"):
            collector.collect(session, "private-spool", existing, reader)
        self.assertEqual(session.get.call_count, 1)

    def test_main_failure_leaves_feed_readable_for_writer_and_reports_no_private_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gateway.json"
            original = '{"items":[{"id":"independent"}]}'
            path.write_text(original)
            with patch.dict("os.environ", {"NEXO_GATEWAY_ITEMS": str(path), "GOOGLE_SERVICE_ACCOUNT_JSON": "{}", "SPOOL_ID": "fixture"}), \
                 patch.object(collector, "authorized_session", return_value=Mock()), \
                 patch.object(collector, "load_runtime", return_value=runtime()), \
                 patch.object(collector, "collect", side_effect=collector.SourceUnavailable("AUTHORIZATION_DENIED")), \
                 patch("builtins.print") as log:
                self.assertEqual(collector.main(), 0)
            self.assertEqual(path.read_text(), original)
            log.assert_called_once_with('{"sheet_spool": "DEFERRED", "reason": "AUTHORIZATION_DENIED"}')

    def test_workflow_collects_independently_and_never_publishes_private_ack(self):
        workflow = (Path(__file__).parents[2] / ".github/workflows/nexo-writer-robot.yml").read_text()
        section = workflow.split("- name: Collect proposals from scheduled Sheet spool", 1)[1].split("- name: Collect finished test batteries", 1)[0]
        self.assertIn("python -m scripts.collect_scheduled_spool", section)
        self.assertNotIn("gateway_resolved", section)
        ack = workflow.split("- name: Acknowledge applied scheduled Sheet spool proposals", 1)[1].split("- name: Signal the ATLAS", 1)[0]
        self.assertNotIn('"--method","PUT"', ack)
        self.assertNotIn("scheduled-spool-ack.json", ack)


if __name__ == "__main__":
    unittest.main()
