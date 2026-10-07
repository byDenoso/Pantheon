import copy
import unittest
from scripts import collect_battery_runs as collector
from test_collect_battery_runs import FakeGitHub, initial_cursor, make_run, REPO, canonical_tower


class TerminalRejectionTests(unittest.TestCase):
    def test_terminal_is_not_selected_by_retry_or_rediscovery(self):
        run = make_run(1)
        saved = {**collector._run_metadata(run), 'reason': 'REJECTED_TERMINAL',
                 'input_sha256': 'sha256:rejected', 'retry_count': 4}
        cursor = initial_cursor(pending={'1:1': saved})
        before = copy.deepcopy(cursor['battery_runs']['pending'])
        api = FakeGitHub([run])
        for _ in range(3):
            selected, scan = collector.collect_run_pages(REPO, cursor, api)
            self.assertEqual(selected, [])
            collector.record_cursor_outcomes(cursor, {'backfill': scan}, canonical_tower({}))
        self.assertEqual(cursor['battery_runs']['pending'], before)
        self.assertEqual(cursor['battery_runs']['acknowledged'], {})

    def test_terminal_outside_discovery_does_not_consume_retry_budget(self):
        pending = {f'{i}:1': {'reason': 'REJECTED_TERMINAL', 'retry_count': 10}
                   for i in range(1, 19)}
        run = make_run(80)
        pending['80:1'] = {**collector._run_metadata(run), 'reason': 'ARTIFACT_NOT_AVAILABLE'}
        cursor = initial_cursor(pending=pending)
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
        self.assertEqual([m['run_key'] for m, _ in selected], ['80:1'])

    def test_new_attempt_eligible_without_acknowledging_rejected_attempt(self):
        run = make_run(1, attempt=2)
        cursor = initial_cursor(pending={'1:1': {'reason': 'REJECTED_TERMINAL'}})
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
        self.assertEqual([m['run_key'] for m, _ in selected], ['1:2'])
        self.assertEqual(cursor['battery_runs']['pending']['1:1']['reason'], 'REJECTED_TERMINAL')
        self.assertEqual(cursor['battery_runs']['acknowledged'], {})

    def test_transient_failures_still_retry(self):
        for reason in ['ARTIFACT_NOT_AVAILABLE', 'DEFERRED_DEPENDENCY', 'RETRYABLE_TRANSPORT']:
            with self.subTest(reason=reason):
                run = make_run(1)
                cursor = initial_cursor(pending={'1:1': {**collector._run_metadata(run), 'reason': reason}})
                selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
                self.assertEqual([m['run_key'] for m, _ in selected], ['1:1'])

    def test_timestamp_change_alone_does_not_clear_terminal_rejection(self):
        run = make_run(1)
        run['updated_at'] = '2026-10-07T03:00:00Z'
        cursor = initial_cursor(pending={'1:1': {'reason': 'REJECTED_TERMINAL'}})
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
        self.assertEqual(selected, [])

    def test_rejected_receipt_is_retained_without_success_ack(self):
        run = make_run(1)
        observation = {**collector._run_metadata(run), 'input_sha256': 'sha256:payload',
                       'results': [], 'results_missing': False}
        receipt = {'contract': collector.RECEIPT_CONTRACT,
                   'effect_id': 'envelope-test', 'payload_sha256': 'sha256:payload',
                   'outcome': 'REJECTED_TERMINAL', 'receipt_id': 'OR-test',
                   'occurred_at': '2026-10-07T03:00:00Z'}
        tower = canonical_tower({'operations/receipts/test.json': {'encoding': 'json', 'value': receipt}})
        cursor = initial_cursor()
        collector.record_cursor_outcomes(cursor, {'observations': [observation]}, tower)
        self.assertEqual(cursor['battery_runs']['pending']['1:1']['reason'], 'REJECTED_TERMINAL')
        self.assertEqual(cursor['battery_runs']['pending']['1:1']['rejection_receipt_id'], 'OR-test')
        self.assertEqual(cursor['battery_runs']['pending']['1:1']['rejected_payload_sha256'], 'sha256:payload')
        self.assertEqual(cursor['battery_runs']['acknowledged'], {})
        selected, _ = collector.collect_run_pages(REPO, cursor, FakeGitHub([run]))
        self.assertEqual(selected, [])
