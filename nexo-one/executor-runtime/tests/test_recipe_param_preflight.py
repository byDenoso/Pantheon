import ast
import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
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


class DesiSelectionMaterializationPreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import runpy
        cls.script_path = RUNTIME.parents[1] / 'scripts/verify_desi_dr1_lss_materialization.py'
        cls.module = runpy.run_path(str(cls.script_path))
        cls.manifest_path = (
            ROOT / 'manifests/desi_dr1_lss_iron_lsscats_v1.5_t01_selection.json'
        )
        cls.manifest, cls.manifest_sha256 = cls.module['validate_manifest_bytes'](
            cls.manifest_path.read_bytes()
        )

    def test_real_manifest_and_conservative_storage_plan_are_offline(self):
        from decimal import Decimal
        source = self.script_path.read_text(encoding='utf-8')
        tree = ast.parse(source)
        imported = {
            alias.name.split('.')[0]
            for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
            for alias in (node.names if isinstance(node, ast.Import) else
                          [ast.alias(name=node.module or '')])
        }
        self.assertTrue(
            {'urllib', 'requests', 'socket', 'subprocess'}.isdisjoint(imported)
        )
        plan = self.module['build_plan'](
            self.manifest,
            self.manifest_sha256,
            Path('/staging/desi-dr1-v1.5'),
            Decimal('1.10'),
            200_000_000_000,
        )
        self.assertEqual(self.manifest_sha256, self.module['MANIFEST_SHA256'])
        self.assertEqual(plan['file_count'], 160)
        self.assertEqual(plan['source_bytes'], 139_526_840_064)
        self.assertEqual(plan['required_free_bytes'], 153_479_524_071)
        self.assertTrue(plan['storage_ok'])
        self.assertFalse(plan['local_bytes_verified'])
        self.assertFalse(plan['work_ready'])
        self.assertFalse(plan['test_ready'])
        self.assertFalse(plan['scientific_result_eligible'])

    def test_storage_plan_boundary_and_missing_target_are_fail_closed(self):
        from decimal import Decimal
        required = 153_479_524_071
        exact = self.module['build_plan'](
            self.manifest, self.manifest_sha256, Path('/staging/desi'),
            Decimal('1.10'), required,
        )
        one_short = self.module['build_plan'](
            self.manifest, self.manifest_sha256, Path('/staging/desi'),
            Decimal('1.10'), required - 1,
        )
        self.assertTrue(exact['storage_ok'])
        self.assertFalse(one_short['storage_ok'])
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            target = base / 'not-created' / 'staging'
            self.assertEqual(self.module['_storage_anchor'](target), base)
            self.assertFalse(target.exists())
            if os.name != 'nt':
                real = base / 'real'
                real.mkdir()
                link = base / 'link'
                link.symlink_to(real, target_is_directory=True)
                with self.assertRaisesRegex(
                    self.module['StagingError'], 'symlink|reparse'
                ):
                    self.module['_storage_anchor'](link)

    def test_manifest_bytes_are_pinned_not_only_semantically_validated(self):
        raw = self.manifest_path.read_bytes()
        with self.assertRaisesRegex(
            self.module['StagingError'], 'selection-manifest SHA256 mismatch'
        ):
            self.module['validate_manifest_bytes'](raw + b' ')

    def test_verify_small_fixture_is_deterministic_and_non_scientific(self):
        records = []
        contents = {'a.bin': b'abc', 'b.bin': b'defgh'}
        for name, raw in contents.items():
            records.append({
                'name': name,
                'size_bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest(),
            })
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, raw in contents.items():
                (root / name).write_bytes(raw)
            verified = self.module['verify_files'](root, records)
            synthetic_manifest = {
                'summary': {'file_count': 2, 'total_bytes': 8},
                'selection': self.manifest['selection'],
            }
            first = self.module['build_verified_receipt'](
                synthetic_manifest, 'a' * 64, root, verified
            )
            second = self.module['build_verified_receipt'](
                synthetic_manifest, 'a' * 64, root, verified
            )
            self.assertEqual(
                self.module['_canonical_json_bytes'](first),
                self.module['_canonical_json_bytes'](second),
            )
            self.assertEqual(first['execution_status'], 'MATERIALIZATION_VERIFIED')
            self.assertEqual(first['scope'], 'SOURCE_MATERIALIZATION_ONLY')
            self.assertEqual(first['roadmap_id'], self.module['CAMPAIGN_ID'])
            self.assertEqual(first['work_id'], self.module['WORK_ID'])
            self.assertEqual(first['recovery_work_id'], self.module['RECOVERY_WORK_ID'])
            self.assertEqual([item['name'] for item in first['files']], ['a.bin', 'b.bin'])
            self.assertNotIn('staging_root', first)
            self.assertTrue(first['local_bytes_verified'])
            self.assertFalse(first['work_ready'])
            self.assertFalse(first['test_ready'])
            self.assertFalse(first['scientific_result_eligible'])
            serialized = self.module['_canonical_json_bytes'](first).decode('utf-8')
            self.assertNotIn('verdict', serialized)
            self.assertNotIn('INCONCLUSIVE', serialized)

    def test_verify_rejects_missing_extra_size_hash_and_symlink(self):
        good = b'abc'
        record = [{
            'name': 'a.bin',
            'size_bytes': len(good),
            'sha256': hashlib.sha256(good).hexdigest(),
        }]
        error = self.module['StagingError']
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            root = base / 'staging'
            root.mkdir()
            with self.assertRaisesRegex(error, 'EXACT_FILE_SET_MISMATCH'):
                self.module['verify_files'](root, record)
            (root / 'a.bin').write_bytes(good)
            (root / 'extra.bin').write_bytes(b'x')
            with self.assertRaisesRegex(error, 'EXACT_FILE_SET_MISMATCH'):
                self.module['verify_files'](root, record)
            (root / 'extra.bin').unlink()
            (root / 'a.bin').write_bytes(b'abcd')
            with self.assertRaisesRegex(error, 'size mismatch'):
                self.module['verify_files'](root, record)
            (root / 'a.bin').write_bytes(b'xyz')
            with self.assertRaisesRegex(error, 'SHA256 mismatch'):
                self.module['verify_files'](root, record)
            if os.name != 'nt':
                target = base / 'target.bin'
                target.write_bytes(good)
                (root / 'a.bin').unlink()
                (root / 'a.bin').symlink_to(target)
                with self.assertRaisesRegex(error, 'non-symlink'):
                    self.module['verify_files'](root, record)

    def test_plan_writes_only_public_official_urls_outside_staging(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            staging = base / 'staging'
            output = base / 'plans' / 'desi-dr1-v1.5.urls'
            digest = self.module['_write_url_list'](
                output, self.manifest['files'], staging
            )
            lines = output.read_text(encoding='utf-8').splitlines()
            self.assertEqual(len(lines), 160)
            self.assertTrue(all(url.startswith(self.module['BASE_URL']) for url in lines))
            self.assertEqual(hashlib.sha256(output.read_bytes()).hexdigest(), digest)
            with self.assertRaisesRegex(
                self.module['StagingError'], 'outside the exact staging directory'
            ):
                self.module['_write_url_list'](
                    staging / 'download.urls', self.manifest['files'], staging
                )
            self.assertEqual(
                self.module['_write_url_list'](
                    output, self.manifest['files'], staging
                ),
                digest,
            )

    def test_receipt_publish_is_atomic_idempotent_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            staging = base / 'staging'
            receipt = base / 'receipt.json'
            payload = {'schema': 'synthetic', 'value': 1}
            with ThreadPoolExecutor(max_workers=8) as pool:
                futures = [
                    pool.submit(self.module['_write_json'], receipt, payload, staging)
                    for _ in range(16)
                ]
                for future in futures:
                    self.assertIsNone(future.result())
            first = receipt.read_bytes()
            self.module['_write_json'](receipt, payload, staging)
            self.assertEqual(receipt.read_bytes(), first)
            self.assertFalse(any('.publish-' in item.name for item in base.iterdir()))
            with self.assertRaisesRegex(
                self.module['StagingError'], 'refusing to overwrite'
            ):
                self.module['_write_json'](
                    receipt, {'schema': 'synthetic', 'value': 2}, staging
                )

    def test_concurrent_different_url_lists_never_overwrite_winner(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            staging = base / 'staging'
            output = base / 'urls.txt'
            barrier = threading.Barrier(2)
            records = [
                [{'url': 'https://example.org/a'}],
                [{'url': 'https://example.org/b'}],
            ]

            def publish(value):
                barrier.wait()
                try:
                    self.module['_write_url_list'](output, value, staging)
                    return 'published'
                except self.module['StagingError']:
                    return 'refused'

            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(publish, records))
            self.assertEqual(sorted(outcomes), ['published', 'refused'])
            self.assertIn(
                output.read_bytes(),
                (b'https://example.org/a\n', b'https://example.org/b\n'),
            )
            self.assertFalse(any('.publish-' in item.name for item in base.iterdir()))

    def test_failure_payload_is_operational_and_never_scientific(self):
        payload = self.module['_failure_payload'](
            self.module['StagingError']('synthetic failure')
        )
        serialized = self.module['_canonical_json_bytes'](payload).decode('utf-8')
        self.assertEqual(
            payload['schema'],
            'NEXO_DESI_LSS_SELECTION_MATERIALIZATION_FAILURE_V1',
        )
        self.assertFalse(payload['scientific_result_eligible'])
        self.assertNotIn('verdict', serialized)
        self.assertNotIn('INCONCLUSIVE', serialized)

if __name__=='__main__':unittest.main()
