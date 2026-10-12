import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

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

    def test_projection_publisher_retains_derivative_if_tested_revision_moves(self):
        workflow=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        section=workflow.split('- name: Publish derived NEXO state projection from tested code',1)[1].split('      - name: ',1)[0]
        self.assertIn("steps.bundle.outputs.tested_sha != ''",section)
        self.assertIn("steps.robot.outcome == 'success'",section)
        self.assertIn('echo "tested_sha=$tested_sha" >> "$GITHUB_OUTPUT"',workflow)
        script=textwrap.dedent(section.split('        run: |\n',1)[1])
        self.assertNotIn('/tmp/tcc_proj',script)
        self.assertNotIn('gh workflow run nexo-one-pages.yml',workflow)
        for selected, checkout, projects in (([OLD],CURRENT,0),([CURRENT],OLD,0),([CURRENT,OLD],CURRENT,1)):
            with self.subTest(selected=selected,checkout=checkout), tempfile.TemporaryDirectory() as work:
                root=Path(work)
                tools=root/'bin';tools.mkdir()
                source=root/'checkout';source.mkdir()
                selector=root/'selected.json';selector.write_text(json.dumps(selected))
                calls=root/'calls'
                python_mock=tools/'python'
                python_mock.write_text(f'#!{sys.executable}\n'+textwrap.dedent('''
                    import json, os, sys
                    from pathlib import Path
                    if sys.argv[1] == 'scripts/select_tested_tcc_main.py':
                        path=Path(os.environ['SELECTOR_VALUES'])
                        values=json.loads(path.read_text())
                        print(values.pop(0))
                        path.write_text(json.dumps(values))
                    else:
                        with open(os.environ['CALLS'],'a') as log: log.write('project\\n')
                    '''))
                git_mock=tools/'git'
                git_mock.write_text(f'#!{sys.executable}\n'+textwrap.dedent('''
                    import os, sys
                    if sys.argv[1:2] == ['-C'] and sys.argv[-2:] == ['rev-parse','HEAD']:
                        print(os.environ['CHECKOUT_SHA'])
                    else:
                        with open(os.environ['CALLS'],'a') as log: log.write('publish\\n')
                    '''))
                python_mock.chmod(0o755);git_mock.chmod(0o755)
                result=subprocess.run(['bash','-c',script.replace('/tmp/tcc-tested',str(source))],
                    text=True,capture_output=True,env={**os.environ,'PATH':str(tools)+os.pathsep+os.environ['PATH'],
                    'TESTED_SHA':CURRENT,'CHECKOUT_SHA':checkout,'SELECTOR_VALUES':str(selector),'CALLS':str(calls)})
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertIn('retaining the previous derivative',result.stdout)
                self.assertEqual(calls.read_text() if calls.exists() else '', 'project\n'*projects)

    def test_alarm_reads_existing_derivative_without_requiring_pages_data(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-alert.yml').read_text()
        self.assertNotIn('github.io/Pantheon/tower-projection',text)
        self.assertIn('raw.githubusercontent.com/${GITHUB_REPOSITORY}/nexo-projection/projection.json',text)

    def test_public_inbox_reads_are_pinned_to_captured_ref_sha(self):
        root=Path(__file__).parents[2]
        text=(root/'scripts/collect_tcc_inbox.py').read_text()
        self.assertIn('git/ref/heads/{branch}',text)
        self.assertIn('compare/{base}...{head}',text)
        self.assertIn('git/trees/{head}',text)
        self.assertIn('git/blobs/{blob_sha}',text)
        self.assertIn('" + repo + "/" + head + "/"',text)
        self.assertNotIn('" + repo + "/" + branch + "/"',text)

    def test_public_cursor_consumes_only_final_receipt_outcomes(self):
        root=Path(__file__).parents[2]
        text=(root/'.github/workflows/nexo-writer-robot.yml').read_text()
        helper=(root/'scripts/collect_tcc_inbox.py').read_text()
        self.assertIn('gateway_reported',text)
        self.assertIn('gateway_resolved',text)
        self.assertIn("RESOLVED_OUTCOMES = {\"APPLIED\", \"ALREADY_APPLIED\", \"REJECTED_TERMINAL\"}",helper)
        self.assertIn('cursor_resolved(cursor, path, fingerprint)',helper)
        self.assertIn('cursor["base_commit"] = mapping.get("head_sha")',helper)
        self.assertIn('pending[path] = {"fingerprint": fingerprint',helper)
        self.assertNotIn('gateway_applied',text)

    def test_cursor_update_runs_for_empty_inbox_and_records_blob_recovery(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        section=text.split('- name: Record public TCC operation receipts',1)[1].split('- name: Acknowledge applied scheduled Sheet spool proposals',1)[0]
        self.assertIn("if: steps.cred.outputs.ok == 'true'",section)
        self.assertNotIn('if: steps.robot.outputs.gateway_reported !=',section)
        self.assertIn('record_cursor_outcomes(cursor,mapping,reported,resolved,receipt_items,now,rev)',section)
        self.assertIn('pending.pop(removed, None)',(Path(__file__).parents[1]/'collect_tcc_inbox.py').read_text())

if __name__=='__main__':unittest.main()
