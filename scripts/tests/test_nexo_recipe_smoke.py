import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'nexo_recipe_smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def test_retired_live_probe_never_executes_and_never_claims_ready(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / 'smoke').mkdir()
            (root / 'smoke/tower_native.json').write_text('{"mode":"readiness_yield"}')
            (root / 'smoke/public_recipe.json').write_text('{}')
            calls = []
            def execute(args, **kwargs):
                calls.append(args[-1])
                Path(kwargs['env']['RESULT_PATH']).write_text(json.dumps(dict.fromkeys(smoke.REQUIRED)))
                return subprocess.CompletedProcess(args, 0, '', '')
            report_path = root / 'report.json'
            self.assertEqual(smoke.run_smoke(root, report_path, execute), 0)
            self.assertEqual(calls, [str(root / 'public_recipe.py')])
            report = json.loads(report_path.read_text())
            self.assertIn({'recipe': 'tower_native', 'state': 'SKIPPED', 'reason': 'SKIPPED_PUBLIC_SOURCE_RETIRED'}, report['rows'])
            body = smoke.issue_body('', report, 'run/1')
            self.assertIn('state:PARTIAL', body)
            self.assertNotIn('state:READY', body)

    def test_repeated_faults_order_and_run_url_do_not_trigger_notification(self):
        rows = [{'recipe': 'b', 'state': 'FAILED', 'reason': 'HTTP404'},
                {'recipe': 'a', 'state': 'FAILED', 'reason': 'RECIPE_TIMEOUT'}]
        report = {'rows': rows}
        body = smoke.issue_body('Original issue details', report, 'run/1')
        self.assertIsNone(smoke.issue_body(body, {'rows': rows[::-1]}, 'run/2'))
        changed = smoke.issue_body(body, {'rows': rows[:1]}, 'run/3')
        self.assertTrue(changed.startswith('Original issue details'))
        self.assertEqual(changed.count(smoke.START), 1)
        self.assertIn('run/3', changed)

    def test_changed_fault_and_recovery_change_state(self):
        failed = {'rows': [{'recipe': 'a', 'state': 'FAILED', 'reason': 'HTTP404'}]}
        body = smoke.issue_body('', failed, 'run/1')
        self.assertIsNotNone(smoke.issue_body(body, {'rows': [{'recipe': 'a', 'state': 'FAILED', 'reason': 'HTTP503'}]}, 'run/2'))
        recovered = smoke.issue_body(body, {'rows': [{'recipe': 'a', 'state': 'PASS', 'reason': 'OUTPUT_SHAPE_VALID'}]}, 'run/3')
        self.assertIn('state:READY', recovered)

    def test_failed_recipe_keeps_failure_and_full_output_required(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            (root / 'smoke').mkdir()
            (root / 'smoke/public_recipe.json').write_text('{}')
            def execute(args, **kwargs):
                Path(kwargs['env']['RESULT_PATH']).write_text('{"verdict":"INCONCLUSIVE"}')
                return subprocess.CompletedProcess(args, 0, '', '')
            self.assertEqual(smoke.run_smoke(root, root / 'report.json', execute), 1)
            self.assertIn('OUTPUT_FIELDS_MISSING:', (root / 'report.json').read_text())

    def test_notification_failure_not_recorded_and_retry_readback(self):
        report = {'rows': [{'recipe': 'a', 'state': 'FAILED', 'reason': 'HTTP404'}]}
        issue = {'number': 421, 'title': smoke.TITLE, 'body': 'Existing diagnosis'}
        written = []
        def gh(args, **kwargs):
            if args[1] == 'api':
                output = json.dumps([[issue]])
            elif args[1:3] == ['issue', 'edit']:
                written.append(Path(args[-1]).read_text())
                issue['body'] = written[-1]
                output = ''
            elif args[1:3] == ['issue', 'view']:
                output = json.dumps({'body': issue['body']})
            else:
                raise AssertionError(args)
            return subprocess.CompletedProcess(args, 0, output, '')
        with patch.dict(os.environ, {'GH_REPO': 'owner/repo'}):
            smoke.notify(report, 'run/1', gh)
            smoke.notify(report, 'run/2', gh)
        self.assertEqual(len(written), 1)

    def test_issue_mutation_failure_can_retry(self):
        report = {'rows': [{'recipe': 'a', 'state': 'FAILED', 'reason': 'HTTP404'}]}
        def gh(args, **kwargs):
            if args[1] == 'api':
                return subprocess.CompletedProcess(args, 0, json.dumps([[{'number': 421, 'title': smoke.TITLE, 'body': ''}]]), '')
            raise subprocess.CalledProcessError(1, args)
        with patch.dict(os.environ, {'GH_REPO': 'owner/repo'}):
            for _ in range(2):
                with self.assertRaises(subprocess.CalledProcessError):
                    smoke.notify(report, 'run/1', gh)

    def test_ambiguous_issue_and_failed_readback_remain_unverified(self):
        report = {'rows': [{'recipe': 'a', 'state': 'FAILED', 'reason': 'HTTP404'}]}
        issue = {'number':421, 'title':smoke.TITLE, 'body':''}
        def gh(args, **kwargs):
            output=json.dumps([[issue, {**issue,'number':422}]])
            return subprocess.CompletedProcess(args, 0, output, '')
        with patch.dict(os.environ, {'GH_REPO':'owner/repo'}):
            with self.assertRaisesRegex(ValueError, 'IDENTITY_AMBIGUOUS'):
                smoke.notify(report, 'run/1', gh)
        def lost(args, **kwargs):
            output=json.dumps([[issue]]) if args[1]=='api' else json.dumps({'body':''}) if args[2]=='view' else ''
            return subprocess.CompletedProcess(args, 0, output, '')
        with patch.dict(os.environ, {'GH_REPO':'owner/repo'}):
            with self.assertRaisesRegex(ValueError, 'READBACK_FAILED'):
                smoke.notify(report, 'run/1', lost)


if __name__ == '__main__':
    unittest.main()
