import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest.mock import patch

RUNTIME = Path(__file__).resolve().parents[1]
ROOT = RUNTIME / 'recipes'
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(RUNTIME))
from recipe_param_preflight import validate_params
from receipt_validation import classify_payload

MANIFEST = json.loads((ROOT / 'preflight/w0wa_bao_sn_multi.json').read_text())
PARAMS = {'bao_release': 'dr1', 'mode': 'bao_tracer_jackknife',
          'compilations': ['des_sn5yr', 'union3'],
          'tracer_groups': [{'label': 'LRG', 'z': [.51, .706, .93]},
                            {'label': 'ELG', 'z': [.93, 1.317]},
                            {'label': 'QSO+Lya', 'z': [1.491, 2.33]}]}


def inputs_for(params):
    values = list(MANIFEST['releases'][params.get('bao_release', 'dr2')]['inputs'])
    for comp in params.get('compilations') or ['pantheon_plus', 'des_sn5yr']:
        values += MANIFEST['compilations'][comp]['inputs']
    return copy.deepcopy(values)


def check(params=PARAMS, inputs=None, root=ROOT):
    return validate_params('w0wa_bao_sn_multi', params, inputs if inputs is not None else inputs_for(params), root)


class Preflight(unittest.TestCase):
    def test_valid_immutable_dr1_selection_without_network_or_fit(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
            value = check()
        self.assertTrue(value['eligible'], value)
        self.assertEqual(value['contract'], 'RECIPE_PARAM_PREFLIGHT_V1')
        self.assertEqual(value['manifest_sha256'], hashlib.sha256((ROOT/'preflight/w0wa_bao_sn_multi.json').read_bytes()).hexdigest())
        self.assertEqual(len(value['validator_sha256']), 64)

    def test_invalid_dr2_selectors_in_dr1_are_not_remapped(self):
        params = copy.deepcopy(PARAMS)
        params['tracer_groups'][0]['z'][-1] = .934
        params['tracer_groups'][1]['z'] = [.934, 1.321]
        params['tracer_groups'][2]['z'][0] = 1.484
        before = copy.deepcopy(params)
        value = check(params)
        self.assertFalse(value['eligible'])
        self.assertIn('DATA_RELEASE_PARAM_MISMATCH', value['reasons'])
        self.assertEqual(len(value['details']), 3)
        self.assertEqual(params, before)

    def test_dr2_selectors_pass_with_dr2_binding(self):
        params = copy.deepcopy(PARAMS)
        params['bao_release'] = 'dr2'
        params['tracer_groups'] = [{'label': 'LRG', 'z': [.51, .706, .934]}]
        self.assertTrue(check(params)['eligible'])

    def test_manifest_source_and_compilation_mismatch_fail(self):
        for field, replacement in [('sha256', '0'*64), ('version', 'main'), ('url', 'https://example.org/data')]:
            inputs = inputs_for(PARAMS)
            inputs[0][field] = replacement
            self.assertIn('INPUT_RECIPE_MANIFEST_MISMATCH', check(inputs=inputs)['reasons'])
        self.assertFalse(check(inputs=inputs_for(PARAMS)[:-1])['eligible'])
        self.assertFalse(check(inputs=inputs_for(PARAMS)*2)['eligible'])

    def test_unsupported_and_unused_parameters_fail(self):
        for key, value in [('mode', 'unknown'), ('garbage', True), ('bands', [[0, 1]]), ('bao_release', 'dr3')]:
            params = {**copy.deepcopy(PARAMS), key: value}
            self.assertFalse(check(params, inputs_for(PARAMS))['eligible'])

    def test_invalid_priors_and_compilations_fail(self):
        for prior in [[.3, 0], [.3, True], [float('nan'), .1], [.3], 'ignored']:
            self.assertFalse(check({**PARAMS, 'priors': {'omega_m': prior}})['eligible'])
        self.assertFalse(check({**PARAMS, 'priors': {'unknown': [.3, .1]}})['eligible'])
        self.assertFalse(check({**PARAMS, 'compilations': ['union3','union3']}, inputs_for(PARAMS))['eligible'])

    def test_empty_invalid_duplicate_and_overlarge_holdouts_fail(self):
        for groups in [[], [{'label': 'a', 'z': [True]}], [{'label': 'a', 'z': [.51,.51]}],
                       [{'label': 'a', 'z': [.51]}, {'label': 'a', 'z': [.706]}],
                       [{'label': 'all', 'z': [.295,.51,.706,.93,1.317,1.491,2.33]}]]:
            self.assertFalse(check({**PARAMS, 'tracer_groups': groups})['eligible'])

    def test_bands_are_checked_without_fitting(self):
        params = {'mode':'redshift_jackknife', 'bao_release':'dr1', 'compilations':['union3'], 'bands':[[0,.5]]}
        self.assertTrue(check(params)['eligible'])
        self.assertFalse(check({**params,'bands':[[.5,0]]})['eligible'])
        self.assertFalse(check({**params,'bands':[[0,float('inf')]]})['eligible'])

    def test_missing_corrupt_and_changed_manifest_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); (root/'preflight').mkdir()
            self.assertEqual(check(root=root)['reasons'], ['PREFLIGHT_CONTRACT_MISSING'])
            path=root/'preflight/w0wa_bao_sn_multi.json';path.write_text('{')
            self.assertEqual(check(root=root)['reasons'], ['PREFLIGHT_CONTRACT_INVALID'])
            path.write_text(json.dumps(MANIFEST)+' ')
            self.assertTrue(check(root=root)['eligible'])
            self.assertNotEqual(check(root=root)['manifest_sha256'], check()['manifest_sha256'])

    def test_operational_errors_never_count_as_science(self):
        for payload in [{'verdict':'INCONCLUSIVE','decision':'INPUT_OR_FIT_UNAVAILABLE','summary':'bad selector'},
                        {'execution_status':'INPUT_OR_FIT_UNAVAILABLE','error':'bad selector'}]:
            ok, stage, error=classify_payload(0,payload)
            self.assertFalse(ok);self.assertEqual(stage,'INPUT_OR_FIT_UNAVAILABLE');self.assertIsNotNone(error)
        self.assertEqual(classify_payload(0, {'verdict':'INCONCLUSIVE','decision':'MIXED_TRACER_ROBUSTNESS'}), (True,None,None))
        self.assertFalse(classify_payload(1, {'verdict':'PROMOTED'})[0])

    def test_recipe_error_exits_nonzero_without_scientific_verdict(self):
        with tempfile.TemporaryDirectory() as temp:
            params=Path(temp)/'params.json';params.write_text(json.dumps({'mode':'unsupported','compilations':['union3','union3']}))
            result=Path(temp)/'result.json'
            process=subprocess.run([sys.executable,str(ROOT/'w0wa_bao_sn_multi.py')],env={**os.environ,'PARAMS_PATH':str(params),'RESULT_PATH':str(result),'OPENBLAS_NUM_THREADS':'1'},capture_output=True,text=True)
            self.assertEqual(process.returncode,1,process.stderr)
            value=json.loads(result.read_text());self.assertNotIn('verdict',value)
            self.assertEqual(value['execution_status'],'INPUT_OR_FIT_UNAVAILABLE')

    def test_recipe_source_matches_manifest(self):
        import w0wa_bao_sn_multi as recipe
        for group in list(MANIFEST['releases'].values()) + list(MANIFEST['compilations'].values()):
            for item in group['inputs']:
                self.assertEqual(recipe.SOURCES[item['url']],item['sha256'])


class WorkflowIntegration(unittest.TestCase):
    def test_real_prepare_and_receipt_blocks_invalid_params_before_dependencies(self):
        workflow=(RUNTIME.parents[1]/'.github/workflows/nexo-test-battery.yml').read_text()
        def code_at(step):
            section=workflow.split(step,1)[1]
            return textwrap.dedent(section.split("python3 - <<'PY'\n",1)[1].split('\n          PY',1)[0])
        for invalid in (False, True, 'missing', 'manifest', 'validator'):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as temp:
                base=Path(temp);(base/'runtime-base').symlink_to(RUNTIME.parents[1],target_is_directory=True)
                fixtures=base/'battery-specs/batteries';fixtures.mkdir(parents=True)
                job=base/'job';job.mkdir();params=copy.deepcopy(PARAMS)
                if invalid is True:params['tracer_groups'][0]['z'][-1]=.934
                test={'test_id':'test-one','recipe':'w0wa_bao_sn_multi','params':params,'inputs':inputs_for(params),
                      'attempt_id':'attempt-'+'a'*32,'recipe_sha256':hashlib.sha256((ROOT/'w0wa_bao_sn_multi.py').read_bytes()).hexdigest(),
                      'param_preflight':check()}
                if invalid == 'missing': test.pop('param_preflight')
                if invalid == 'manifest': test['param_preflight']['manifest_sha256'] = '0'*64
                if invalid == 'validator': test['param_preflight']['validator_sha256'] = '0'*64
                (fixtures/'bat-one.json').write_text(json.dumps({'tests':[test]}))
                env={**os.environ,'BID':'bat-one','IDX':'0','MATRIX_TEST_ID':'test-one','NEXO_CI_FIXTURE':'false','GITHUB_OUTPUT':str(base/'out')}
                prepare=code_at('- name: Prepare frozen test').replace('/tmp/job',str(job))
                p=subprocess.run([sys.executable,'-c',prepare],cwd=base,env=env,capture_output=True,text=True)
                self.assertEqual(p.returncode,1 if invalid else 0,p.stderr)
                if invalid:
                    self.assertFalse((job/'test.py').exists())
                    receipt=code_at('- name: Build shard receipt').replace('/tmp/job',str(job))
                    p=subprocess.run([sys.executable,'-c',receipt],cwd=base,env={**env,'PREP_OUTCOME':'failure','DEPS_OUTCOME':'skipped','EXEC_OUTCOME':'skipped'},capture_output=True,text=True)
                    self.assertEqual(p.returncode,0,p.stderr)
                    r=json.loads((job/'out.json').read_text())
                    self.assertFalse(r['ok']);self.assertIsNone(r['result']);self.assertIsNone(r['executed_at'])
                    self.assertEqual(r['operational_reason'], 'DATA_RELEASE_PARAM_MISMATCH' if invalid is True else
                                     'PREFLIGHT_RECEIPT_REQUIRED' if invalid == 'missing' else 'PREFLIGHT_IDENTITY_MISMATCH')
                    self.assertEqual(r['failure_stage'],'PARAM_PREFLIGHT')

if __name__=='__main__':unittest.main()
