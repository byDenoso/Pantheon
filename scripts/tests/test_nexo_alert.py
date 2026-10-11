import unittest
from datetime import datetime, timedelta, timezone

from scripts import nexo_alert as alert


NOW = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)


def problem(code, **identity):
    return {
        "identity": {"category": "test", "code": code, **identity},
        "message": f"Observed {code}",
    }


def valid_projection(generated_at):
    manifest = {
        "authority": "TOWER_V06",
        "projection_only": True,
        "writeback": "FORBIDDEN",
        "tower_file_id": "fixture-file",
        "tower_revision": "sha256:" + "a" * 64,
        "event_cursor": "20261011T120000000000Z-fixture",
        "projection_fingerprint": "sha256:" + "b" * 64,
        "generated_at": generated_at,
    }
    return {
        "contract": "NEXO_PUBLIC_PROJECTION_V1",
        "manifest": manifest,
        "event_cursor": manifest["event_cursor"],
        "work": [],
        "tests": [],
        "capabilities": {},
        "activity": [],
    }


class FakeGitHub:
    def __init__(self):
        self.issues = {}
        self.next_number = 1
        self.posted_comments = []
        self.comment_attempts = 0
        self.fail_comment_before_write = False
        self.fail_comment_after_write = False
        self.fail_finalize_before_write = False
        self.fail_finalize_after_write = False
        self.fail_close_before_write = False
        self.fail_close_after_write = False
        self.close_attempts = 0

    def find_open_issue(self, title):
        return next((issue for issue in self.issues.values()
                     if issue["open"] and issue["title"] == title), None)

    def get_issue(self, number):
        return dict(self.issues[number])

    def create_issue(self, title, body):
        number = self.next_number
        self.next_number += 1
        self.issues[number] = {"number": number, "title": title, "body": body, "open": True}
        return dict(self.issues[number])

    def edit_issue(self, number, body):
        pending_before = alert.pending_notification(self.issues[number]["body"])
        pending_after = alert.pending_notification(body)
        if pending_before and not pending_after and self.fail_finalize_before_write:
            self.fail_finalize_before_write = False
            raise RuntimeError("simulated confirmation timeout")
        self.issues[number]["body"] = body
        if pending_before and not pending_after and self.fail_finalize_after_write:
            self.fail_finalize_after_write = False
            raise RuntimeError("simulated confirmation timeout after write")

    def list_comments(self, number):
        return [comment for issue_number, comment in self.posted_comments
                if issue_number == number]

    def create_comment(self, number, body):
        self.comment_attempts += 1
        if self.fail_comment_before_write:
            self.fail_comment_before_write = False
            raise RuntimeError("simulated comment failure")
        self.posted_comments.append((number, body))
        if self.fail_comment_after_write:
            self.fail_comment_after_write = False
            raise RuntimeError("simulated comment timeout after write")

    def close_issue(self, number):
        self.close_attempts += 1
        if self.fail_close_before_write:
            self.fail_close_before_write = False
            raise RuntimeError("simulated close timeout")
        self.issues[number]["open"] = False
        if self.fail_close_after_write:
            self.fail_close_after_write = False
            raise RuntimeError("simulated close timeout after write")


class NexoAlertIdentityTests(unittest.TestCase):
    def test_age_text_changes_without_changing_problem_signature(self):
        def stale_problem(age_hours):
            generated_at = (NOW - timedelta(hours=age_hours)).isoformat()
            found = alert.collect_problems(
                valid_projection(generated_at), [], NOW)
            return next(item for item in found
                        if item["identity"]["code"] == "projection_stale")

        at_three_hours = stale_problem(3)
        at_seven_hours = stale_problem(7)
        self.assertNotEqual(at_three_hours["message"], at_seven_hours["message"])
        self.assertEqual(alert.problem_signature([at_three_hours]),
                         alert.problem_signature([at_seven_hours]))
        below_threshold = alert.collect_problems(
            valid_projection((NOW - timedelta(hours=3, seconds=-1)).isoformat()), [], NOW)
        self.assertFalse(any(item["identity"]["code"] == "projection_stale"
                             for item in below_threshold))

    def test_recipe_version_is_preserved_as_identity(self):
        version_one = problem("recipe_health_open", recipe_id="solver_recipe_v1")
        version_two = problem("recipe_health_open", recipe_id="solver_recipe_v2")
        self.assertNotEqual(alert.problem_signature([version_one]),
                            alert.problem_signature([version_two]))

    def test_recipe_health_collection_keeps_both_versioned_identifiers(self):
        found = alert.collect_problems(
            {**valid_projection(NOW.isoformat()), "evolution": {"recipe_health": {
                 "solver_recipe_v2": {"state": "OPEN"},
                 "solver_recipe_v1": {"state": "OPEN"},
             }}}, [], NOW)
        recipe_ids = {item["identity"]["recipe_id"] for item in found
                      if item["identity"]["code"] == "recipe_health_open"}
        self.assertEqual(recipe_ids, {"solver_recipe_v1", "solver_recipe_v2"})

    def test_missing_public_activity_is_observation_only(self):
        found = alert.collect_problems(
            valid_projection(NOW.isoformat()), [], NOW)
        role_ids = {item["identity"].get("role") for item in found
                    if item["identity"]["code"] == "role_activity_not_observed"}
        self.assertEqual(role_ids, {"EXECUTOR", "LEARNER", "REFUTADOR", "GUARDIAO"})
        self.assertTrue(all("parou" not in item["message"] and "pausado" not in item["message"]
                            for item in found))

    def test_invalid_manifest_is_read_degraded_not_empty_healthy(self):
        projection = valid_projection(NOW.isoformat())
        projection["manifest"]["authority"] = "UNKNOWN"
        found = alert.collect_problems(projection, [], NOW)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["identity"]["code"], "projection_read_degraded")
        self.assertEqual(found[0]["identity"]["reason"], "manifest_authority_invalid")

    def test_invalid_optional_cosmology_state_is_read_degraded(self):
        projection = valid_projection(NOW.isoformat())
        projection["cosmology_state"] = {
            "model": "COSMOLOGY_STATE_V1",
            "authority": "TOWER",
            "projection_only": True,
            "frontiers": [{"id": "H0", "state": "OPEN",
                           "key_evidence": [{"id": "missing-test"}]}],
            "historical_tests": [],
        }
        found = alert.collect_problems(projection, [], NOW)
        self.assertEqual(found[0]["identity"]["code"], "projection_read_degraded")
        self.assertEqual(found[0]["identity"]["reason"],
                         "projection_cosmology_evidence_reference_missing")

    def test_malformed_public_json_remains_an_active_observation(self):
        found = alert.collect_problems(None, [], NOW, projection_invalid=True)
        self.assertEqual(found[0]["identity"]["code"], "projection_json_invalid")
        self.assertIn("não contém JSON válido", found[0]["message"])

    def test_problem_order_does_not_change_signature(self):
        rows = [problem("execution_failed", workflow="writer_v1"),
                problem("recipe_health_open", recipe_id="solver_recipe_v2")]
        self.assertEqual(alert.problem_signature(rows),
                         alert.problem_signature(list(reversed(rows))))


class NexoAlertRecoveryTests(unittest.TestCase):
    def test_new_problem_opens_issue_and_resolved_set_comments_then_closes(self):
        github = FakeGitHub()
        active = [problem("execution_failed", workflow="writer_v1")]

        alert.reconcile_alert(github, active, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        self.assertIsNotNone(issue)
        self.assertEqual(github.posted_comments, [])
        for status in ("Projeção/observabilidade", "Execução observada em GitHub Actions",
                       "Entrega da projeção", "Aplicação canônica"):
            self.assertIn(status, issue["body"])
        self.assertIn("não comprova agente parado nem scheduler pausado", issue["body"])
        self.assertIn("execuções ChatGPT e estado do scheduler são desconhecidos", issue["body"])
        self.assertIn("não diagnostica a causa nem confirma autorização/rede", issue["body"])
        self.assertIn("Entrega privada, email ou notificação: não verificada", issue["body"])
        self.assertIn("(APPLIED): não verificada", issue["body"])
        self.assertIn("não inicia, pausa ou altera a execução científica", issue["body"])

        alert.reconcile_alert(github, [], NOW + timedelta(hours=1))
        self.assertFalse(github.issues[issue["number"]]["open"])
        self.assertEqual(len(github.posted_comments), 1)
        self.assertIn("resolvido", github.posted_comments[0][1])

    def test_failed_comment_remains_pending_and_retry_resumes(self):
        github = FakeGitHub()
        previous = [problem("execution_failed", workflow="writer_v1")]
        changed = [problem("execution_failed", workflow="writer_v2")]
        alert.reconcile_alert(github, previous, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_comment_before_write = True

        with self.assertRaisesRegex(RuntimeError, "comment failure"):
            alert.reconcile_alert(github, changed, NOW + timedelta(minutes=1))
        pending = alert.pending_notification(github.issues[issue["number"]]["body"])
        self.assertIsNotNone(pending)
        self.assertEqual(pending["target_signature"], alert.problem_signature(changed))
        self.assertEqual(alert.acknowledged_signature(
            github.issues[issue["number"]]["body"]), alert.problem_signature(previous))

        alert.reconcile_alert(github, changed, NOW + timedelta(minutes=2))
        body = github.issues[issue["number"]]["body"]
        self.assertIsNone(alert.pending_notification(body))
        self.assertEqual(alert.acknowledged_signature(body), alert.problem_signature(changed))
        self.assertEqual(len(github.posted_comments), 1)
        self.assertEqual(github.comment_attempts, 2)

    def test_incomplete_projection_does_not_close_existing_alert(self):
        github = FakeGitHub()
        active = [problem("execution_failed", workflow="writer_v1")]
        alert.reconcile_alert(github, active, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        degraded = alert.collect_problems({"contract": "NEXO_PUBLIC_PROJECTION_V1"}, [],
                                          NOW)
        self.assertTrue(degraded)

        alert.reconcile_alert(github, degraded, NOW + timedelta(minutes=1))
        self.assertTrue(github.issues[issue["number"]]["open"])
        self.assertEqual(len(github.posted_comments), 1)

    def test_comment_timeout_after_write_is_recovered_by_nonce(self):
        github = FakeGitHub()
        previous = [problem("execution_failed", workflow="writer_v1")]
        changed = [problem("execution_failed", workflow="writer_v2")]
        alert.reconcile_alert(github, previous, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_comment_after_write = True

        alert.reconcile_alert(github, changed, NOW + timedelta(minutes=1))
        alert.reconcile_alert(github, changed, NOW + timedelta(minutes=2))
        body = github.issues[issue["number"]]["body"]
        self.assertIsNone(alert.pending_notification(body))
        self.assertEqual(alert.acknowledged_signature(body), alert.problem_signature(changed))
        self.assertEqual(len(github.posted_comments), 1)
        self.assertEqual(github.comment_attempts, 1)

    def test_comment_success_followed_by_confirmation_timeout_does_not_duplicate(self):
        github = FakeGitHub()
        previous = [problem("execution_failed", workflow="writer_v1")]
        changed = [problem("execution_failed", workflow="writer_v2")]
        alert.reconcile_alert(github, previous, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_finalize_before_write = True

        with self.assertRaisesRegex(RuntimeError, "confirmation timeout"):
            alert.reconcile_alert(github, changed, NOW + timedelta(minutes=1))
        self.assertIsNotNone(alert.pending_notification(
            github.issues[issue["number"]]["body"]))

        alert.reconcile_alert(github, changed, NOW + timedelta(minutes=2))
        self.assertIsNone(alert.pending_notification(
            github.issues[issue["number"]]["body"]))
        self.assertEqual(alert.acknowledged_signature(
            github.issues[issue["number"]]["body"]), alert.problem_signature(changed))
        self.assertEqual(len(github.posted_comments), 1)
        self.assertEqual(github.comment_attempts, 1)

    def test_acknowledgement_timeout_after_write_resumes_without_duplicate_comment(self):
        github = FakeGitHub()
        previous = [problem("execution_failed", workflow="writer_v1")]
        changed = [problem("execution_failed", workflow="writer_v2")]
        alert.reconcile_alert(github, previous, NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_finalize_after_write = True

        with self.assertRaisesRegex(RuntimeError, "confirmation timeout after write"):
            alert.reconcile_alert(github, changed, NOW + timedelta(minutes=1))
        body_after_timeout = github.issues[issue["number"]]["body"]
        self.assertIsNone(alert.pending_notification(body_after_timeout))
        self.assertEqual(alert.acknowledged_signature(body_after_timeout),
                         alert.problem_signature(changed))
        self.assertEqual(len(github.posted_comments), 1)

        alert.reconcile_alert(github, changed, NOW + timedelta(minutes=2))
        self.assertEqual(alert.acknowledged_signature(
            github.issues[issue["number"]]["body"]), alert.problem_signature(changed))
        self.assertEqual(len(github.posted_comments), 1)
        self.assertEqual(github.comment_attempts, 1)

    def test_resolution_resumes_close_after_comment_and_confirmation_succeeded(self):
        github = FakeGitHub()
        alert.reconcile_alert(github, [problem("execution_failed", workflow="writer_v1")], NOW)
        issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_close_before_write = True

        with self.assertRaisesRegex(RuntimeError, "close timeout"):
            alert.reconcile_alert(github, [], NOW + timedelta(hours=1))
        body = github.issues[issue["number"]]["body"]
        self.assertIsNone(alert.pending_notification(body))
        self.assertEqual(alert.acknowledged_signature(body), alert.EMPTY_SIGNATURE)

        alert.reconcile_alert(github, [], NOW + timedelta(hours=2))
        self.assertFalse(github.issues[issue["number"]]["open"])
        self.assertEqual(len(github.posted_comments), 1)

    def test_close_timeout_after_close_resumes_without_duplicate_and_keeps_next_alert(self):
        github = FakeGitHub()
        alert.reconcile_alert(
            github, [problem("execution_failed", workflow="writer_v1")], NOW)
        resolved_issue = github.find_open_issue(alert.ISSUE_TITLE)
        github.fail_close_after_write = True

        with self.assertRaisesRegex(RuntimeError, "close timeout after write"):
            alert.reconcile_alert(github, [], NOW + timedelta(hours=1))
        self.assertFalse(github.issues[resolved_issue["number"]]["open"])
        self.assertEqual(alert.acknowledged_signature(
            github.issues[resolved_issue["number"]]["body"]), alert.EMPTY_SIGNATURE)
        self.assertEqual(len(github.posted_comments), 1)

        alert.reconcile_alert(github, [], NOW + timedelta(hours=2))
        self.assertFalse(github.issues[resolved_issue["number"]]["open"])
        self.assertEqual(github.close_attempts, 1)
        self.assertEqual(len(github.posted_comments), 1)

        next_alert = [problem("execution_failed", workflow="writer_v2")]
        alert.reconcile_alert(github, next_alert, NOW + timedelta(hours=3))
        new_issue = github.find_open_issue(alert.ISSUE_TITLE)
        self.assertIsNotNone(new_issue)
        self.assertNotEqual(new_issue["number"], resolved_issue["number"])
        self.assertEqual(alert.acknowledged_signature(new_issue["body"]),
                         alert.problem_signature(next_alert))
        self.assertEqual(len(github.posted_comments), 1)


if __name__ == "__main__":
    unittest.main()
