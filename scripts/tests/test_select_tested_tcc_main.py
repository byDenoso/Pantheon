from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('selector', Path(__file__).parents[1]/'select_tested_tcc_main.py')
selector = importlib.util.module_from_spec(spec);spec.loader.exec_module(selector)
CURRENT = 'a'*40
OLD = 'b'*40


def run(sha=CURRENT, **changes):
    return {'head_sha':sha, 'head_branch':'main', 'event':'push', 'status':'completed',
            'conclusion':'success', 'path':'.github/workflows/nexo-runtime-reconciler-ci.yml', **changes}


def api_for(runs, heads=(CURRENT,CURRENT)):
    values = iter([{'ref':'refs/heads/main','object':{'sha':heads[0]}}, {'workflow_runs':runs},
                   {'ref':'refs/heads/main','object':{'sha':heads[1]}}])
    calls=[]
    def api(endpoint):
        calls.append(endpoint)
        return next(values)
    api.calls=calls
    return api


class Selection(unittest.TestCase):
    def test_public_reader_omits_ambient_actions_authorization(self):
        observed = {}

        def open_public(request, timeout):
            observed['request'] = request
            observed['timeout'] = timeout
            return io.BytesIO(b'{"workflow_runs": []}')

        with patch.dict(os.environ, {'GH_TOKEN': 'pantheon-installation-token'}), \
                patch.object(selector.urllib.request, 'urlopen', side_effect=open_public):
            self.assertEqual(selector.github('repos/byDenoso/TCC/actions/runs'), {'workflow_runs': []})

        self.assertEqual(observed['request'].full_url,
                         'https://api.github.com/repos/byDenoso/TCC/actions/runs')
        self.assertEqual(observed['timeout'], 30)
        self.assertNotIn('Authorization', observed['request'].headers)
        self.assertEqual(observed['request'].headers['User-agent'],
                         'nexo-writer-robot-tcc-ci-gate')

    def test_public_api_denial_rate_limit_and_timeout_fail_closed_without_retry(self):
        failures = [
            urllib.error.HTTPError('https://api.github.com/test', 403, 'forbidden', {}, None),
            urllib.error.HTTPError('https://api.github.com/test', 429, 'rate limited', {}, None),
            TimeoutError('timed out'),
        ]
        for failure in failures:
            with self.subTest(failure=repr(failure)), \
                    patch.object(selector.urllib.request, 'urlopen', side_effect=failure) as opened:
                stdout, stderr = io.StringIO(), io.StringIO()
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    selector.main()
                self.assertEqual(stdout.getvalue(), '')
                self.assertIn('could not be verified', stderr.getvalue())
                self.assertEqual(opened.call_count, 1)

    def test_current_success_selected_even_if_stale_run_sorts_first(self):
        api=api_for([run(OLD),run()])
        self.assertEqual(selector.select_tested_main(api),CURRENT)
        self.assertIn('head_sha='+CURRENT,api.calls[1])
        self.assertEqual(api.calls[0],api.calls[-1])

    def test_old_success_never_rolls_back_current_main(self):
        self.assertIsNone(selector.select_tested_main(api_for([run(OLD)])))

    def test_pending_failed_and_other_branch_event_or_workflow_not_accepted(self):
        for change in ({'status':'in_progress'}, {'conclusion':'failure'}, {'event':'pull_request'},
                       {'head_branch':'stale-feature'}, {'path':'.github/workflows/other.yml'}):
            with self.subTest(change=change):
                self.assertIsNone(selector.select_tested_main(api_for([run(**change),run(OLD)])))

    def test_new_main_without_ci_retains_active_bundle(self):
        self.assertIsNone(selector.select_tested_main(api_for([])))

    def test_main_moving_during_selection_retains_active_bundle(self):
        self.assertIsNone(selector.select_tested_main(api_for([run()], heads=(CURRENT,OLD))))

    def test_bad_ref_rejected(self):
        with self.assertRaises(ValueError):selector.select_tested_main(lambda endpoint: {'object':{'sha':'main'}})

    def test_workflow_rechecks_main_before_upload(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        selection=text.index('tested_sha=$(python scripts/select_tested_tcc_main.py)')
        recheck=text.index('verified_sha=$(python scripts/select_tested_tcc_main.py)')
        upload=text.index('response = session.patch(')
        self.assertLess(selection,recheck);self.assertLess(recheck,upload)
        self.assertIn('if [ "$verified_sha" != "$tested_sha" ]; then', text)
        self.assertIn('retaining the Drive bundle',text)

    def test_public_inbox_reads_are_pinned_to_captured_ref_sha(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        capture=text.index('ref_api=f"https://api.github.com/repos/{repo}/git/ref/heads/{branch}"')
        compare=text.index('compare/{base}...{head}')
        tree=text.index('trees/{head}?recursive=1')
        raw=text.index('raw.githubusercontent.com/"+repo+"/"+head+"/')
        self.assertLess(capture,compare)
        self.assertLess(capture,tree)
        self.assertLess(capture,raw)
        self.assertNotIn('raw.githubusercontent.com/"+repo+"/"+branch+"/',text)

    def test_public_cursor_consumes_only_final_receipt_outcomes(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        self.assertIn('gateway_reported',text)
        self.assertIn('gateway_resolved',text)
        self.assertIn('{"APPLIED","ALREADY_APPLIED","REJECTED_TERMINAL"}',text)
        self.assertIn('cursor_resolved(path,fingerprint)',text)
        self.assertNotIn('gateway_applied',text)

if __name__=='__main__':unittest.main()
