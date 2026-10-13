import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from scripts import nexo_alert as alert


def run(identity, conclusion):
    return {"id": identity, "status": "completed", "conclusion": conclusion}


class IssueCommands:
    def __init__(self, body=""):
        self.body, self.state, self.calls = body, "OPEN", []

    def __call__(self, args):
        self.calls.append(args)
        if args[1] == "view":
            return json.dumps({"number": 1, "title": alert.TITLE, "state": self.state, "body": self.body})
        if args[1] == "close":
            self.state = "CLOSED"
            return ""
        self.body = Path(args[-1]).read_text()
        return "https://github.com/owner/repo/issues/1\n" if args[1] == "create" else ""


class WriterAlertTests(unittest.TestCase):
    def test_failures_open_once_and_same_condition_never_comments(self):
        observed = alert.observation({"workflow_runs": [run(12, "timed_out"), run(11, "failure")]})
        command = IssueCommands()
        self.assertEqual(alert.reconcile("owner/repo", observed, [], command), "OPENED")
        self.assertIn("actions/runs/12", command.body)
        self.assertEqual([args[1] for args in command.calls], ["create", "view"])
        existing = [{"number": 1, "title": alert.TITLE, "body": command.body}]
        fresh = alert.observation({"workflow_runs": [run(14, "failure"), run(13, "failure")]})
        blocked = Mock(side_effect=AssertionError("duplicate issue notification"))
        self.assertEqual(alert.reconcile("owner/repo", fresh, existing, blocked), "UNCHANGED")
        blocked.assert_not_called()

    def test_only_confirmed_workflow_success_closes_existing_incident(self):
        existing = [{"number": 1, "title": alert.TITLE, "body": alert.MARKER}]
        for rows in ([], [run(12, "cancelled")], [run(12, "failure"), run(11, "success")]):
            command = Mock()
            self.assertEqual(alert.reconcile("owner/repo", alert.observation({"workflow_runs": rows}), existing, command), "UNCONFIRMED")
            command.assert_not_called()
        command = IssueCommands(alert.MARKER)
        observed = alert.observation({"workflow_runs": [run(13, "success"), run(12, "failure")]})
        self.assertEqual(alert.reconcile("owner/repo", observed, existing, command), "CLOSED")
        self.assertIn("13", command.calls[0][-1])
        self.assertIn("não atesta", command.calls[0][-1])
        self.assertEqual([args[1] for args in command.calls], ["close", "view"])

    def test_manual_title_collision_is_preserved_across_failure_and_success(self):
        existing = [{"number": 1, "title": alert.TITLE, "body": "papel privado parado"}]
        command = Mock()
        for rows in ([run(12, "failure"), run(11, "failure")], [run(13, "success")]):
            observed = alert.observation({"workflow_runs": rows})
            self.assertEqual(alert.reconcile("owner/repo", observed, existing, command), "UNMANAGED")
        self.assertEqual(existing[0]["body"], "papel privado parado")
        command.assert_not_called()

    def test_writer_incident_has_separate_title_and_does_not_adopt_legacy_issue(self):
        legacy = {"number": 7, "title": "NEXO: alerta de infraestrutura", "body": "pendência privada original"}
        failed = alert.observation({"workflow_runs": [run(12, "failure"), run(11, "failure")]})
        command = IssueCommands()
        self.assertEqual(alert.TITLE, "NEXO: falhas técnicas do Writer")
        self.assertEqual(alert.reconcile("owner/repo", failed, [legacy], command), "OPENED")
        managed = {"number": 1, "title": alert.TITLE, "body": command.body}
        recovered = alert.observation({"workflow_runs": [run(13, "success")]})
        self.assertEqual(alert.reconcile("owner/repo", recovered, [legacy, managed], command), "CLOSED")
        mutations = [args for args in command.calls if args[1] != "view"]
        self.assertEqual([args[1] for args in mutations], ["create", "close"])
        self.assertEqual(mutations[1][2], "1")
        self.assertEqual(legacy["body"], "pendência privada original")

    def test_writer_success_does_not_close_unmanaged_legacy_incident(self):
        observed = alert.observation({"workflow_runs": [run(13, "success")]})
        command = Mock()
        self.assertEqual(alert.reconcile("owner/repo", observed,
            [{"number": 1, "title": alert.TITLE, "body": "papel privado parado"}], command), "UNMANAGED")
        command.assert_not_called()

    def test_mutation_without_matching_readback_never_reports_success(self):
        existing = [{"number": 1, "title": alert.TITLE, "body": alert.MARKER}]
        recovered = alert.observation({"workflow_runs": [run(13, "success")]})
        failed = alert.observation({"workflow_runs": [run(12, "failure"), run(11, "failure")]})
        bad_readback = json.dumps({"number": 1, "title": alert.TITLE, "state": "OPEN", "body": "wrong body"})
        cases = [(recovered, existing, ""), (failed, [], "https://github.com/owner/repo/issues/1")]
        for observed, issues, result in cases:
            with self.subTest(state=observed["state"], issues=issues):
                with self.assertRaisesRegex(ValueError, "READBACK_FAILED"):
                    alert.reconcile("owner/repo", observed, issues, Mock(side_effect=[result, bad_readback]))

    def test_unavailable_or_malformed_api_never_mutates_issue(self):
        for value in ({}, {"workflow_runs": [{"id": 12, "status": "queued", "conclusion": "success"}]}):
            with self.assertRaises(ValueError):
                alert.observation(value)
        with patch.dict("os.environ", {"GITHUB_REPOSITORY": "owner/repo"}), \
             patch.object(alert, "gh", side_effect=RuntimeError("unavailable")) as command:
            with self.assertRaises(RuntimeError):
                alert.main()
        self.assertEqual(command.call_count, 1)

    def test_duplicate_issue_identity_cannot_close_or_modify_wrong_issue(self):
        observed = alert.observation({"workflow_runs": [run(13, "success")]})
        with self.assertRaisesRegex(ValueError, "AMBIGUOUS"):
            alert.reconcile("owner/repo", observed, [{"title": alert.TITLE}, {"title": alert.TITLE}], Mock())

    def test_workflow_uses_actions_only_and_single_incident_reconciler(self):
        workflow = (Path(__file__).parents[2] / ".github/workflows/nexo-alert.yml").read_text()
        self.assertIn("python scripts/nexo_alert.py", workflow)
        self.assertIn("group: nexo-alert", workflow)
        self.assertNotIn("projection.json", workflow)
        self.assertNotIn("gh issue comment", workflow)


if __name__ == "__main__":
    unittest.main()
