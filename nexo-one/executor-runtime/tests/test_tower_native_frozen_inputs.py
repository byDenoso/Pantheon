import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / 'recipes/tower_native.py'


def projection():
    tests = []
    for i in range(4):
        high = i % 2 == 0
        prereg = {'prediction': {'p_promoted': .8 if high else .1,
                                 'recorded_at': '2026-09-01T00:00:00Z'}}
        if high:
            prereg.update(null='null', rival='rival', criterion={'success': 'yes', 'kill': 'no'})
        tests.append({'id': str(i), 'verdict': 'PROMOTED', 'method': 'fixed',
                      'executed_at': f'2026-09-02T00:00:0{i}Z', 'prereg': prereg})
    return {'tests': tests, 'activity': []}


class FrozenInputsTests(unittest.TestCase):
    def run_recipe(self, body=None, *, binding=None, raw=None, missing=False):
        raw = raw if raw is not None else json.dumps(body or projection()).encode()
        default = {'name': 'public_projection', 'url': 'https://example.org/frozen.json',
                   'version': '2026-09-02', 'sha256': hashlib.sha256(raw).hexdigest()}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'params.json').write_text(json.dumps({'mode': 'prediction_calibration', 'min_per_stratum': 1}))
            (root / 'inputs.json').write_text(json.dumps([default if binding is None else binding]))
            env = {'PARAMS_PATH': str(root / 'params.json'), 'RESULT_PATH': str(root / 'result.json'),
                   'NEXO_REQUIRE_FROZEN_INPUTS': '1'}
            if not missing:
                env['INPUTS_PATH'] = str(root / 'inputs.json')
            with patch.dict(os.environ, env, clear=True), patch('urllib.request.urlopen', return_value=io.BytesIO(raw)) as fetch:
                try:
                    runpy.run_path(str(RECIPE), run_name='__main__')
                except SystemExit as exc:
                    self.assertEqual(exc.code, 0)
            return json.loads((root / 'result.json').read_text()), fetch.call_args_list

    def test_verified_bytes_and_frozen_criteria(self):
        result, calls = self.run_recipe()
        self.assertEqual(result['decision'], 'LOW_OBS_WORSE')
        self.assertEqual(result['statistics']['cases'], 4)
        self.assertEqual(result['statistics']['input_provenance']['scope'], 'FROZEN_INPUT_BYTES_VERIFIED')
        self.assertEqual(calls[0].args[0], 'https://example.org/frozen.json')

    def test_gzip_snapshot_hashes_transport_bytes(self):
        raw = gzip.compress(json.dumps(projection()).encode(), mtime=0)
        result, _ = self.run_recipe(raw=raw, binding={
            'name': 'projection', 'url': 'https://example.org/frozen.json.gz', 'version': 'v1',
            'sha256': hashlib.sha256(raw).hexdigest(), 'format': 'json.gz'})
        self.assertEqual(result['statistics']['input_provenance']['sha256'], hashlib.sha256(raw).hexdigest())

    def test_hash_mismatch_stops_before_computation(self):
        with self.assertRaisesRegex(ValueError, 'SHA256 mismatch'):
            self.run_recipe(binding={'url': 'https://example.org/frozen.json', 'version': 'v1', 'sha256': '0' * 64})

    def test_unversioned_input_fails(self):
        with self.assertRaisesRegex(ValueError, 'HTTPS, version and SHA256'):
            self.run_recipe(binding={'url': 'https://example.org/live.json', 'sha256': '0' * 64})

    def test_production_has_no_live_fallback(self):
        with self.assertRaisesRegex(ValueError, 'live fallback forbidden'):
            self.run_recipe(missing=True)

    def test_design_time_does_not_attest_prediction_time(self):
        body = projection()
        for t in body['tests']:
            del t['prereg']['prediction']['recorded_at']
            t['prereg'].update(at='2026-09-01T00:00:00Z', hash='sha256:' + 'a' * 64)
        result, _ = self.run_recipe(body)
        self.assertEqual(result['decision'], 'SAMPLE_TOO_SMALL')
        self.assertEqual(result['statistics']['cases'], 0)
        self.assertEqual(result['statistics']['excluded_unverified_predictions'], 4)

    def test_late_or_invalid_probabilities_excluded(self):
        body = projection()
        for t, value in zip(body['tests'], [True, -1, 2, float('nan')]):
            t['prereg']['prediction']['p_promoted'] = value
        result, _ = self.run_recipe(body)
        self.assertEqual(result['statistics']['cases'], 0)
        body = projection()
        for t in body['tests']:
            t['prereg']['prediction']['recorded_at'] = t['executed_at']
        result, _ = self.run_recipe(body)
        self.assertEqual(result['statistics']['cases'], 0)

    def test_identical_observability_is_inconclusive(self):
        body = projection()
        for t in body['tests']:
            t['prereg'].update(null='null', rival='rival', criterion={'success': 'yes', 'kill': 'no'})
        result, _ = self.run_recipe(body)
        self.assertEqual(result['decision'], 'SAMPLE_TOO_SMALL')
        self.assertTrue(all(w['high_n'] == 0 for w in result['statistics']['windows']))

    def test_workflow_transmits_inputs_separately(self):
        workflow = (ROOT.parents[1] / '.github/workflows/nexo-test-battery.yml').read_text()
        self.assertIn('json.dump(test.get("inputs") or []', workflow)
        self.assertIn('INPUTS_PATH: /tmp/job/inputs.json', workflow)
        self.assertIn('NEXO_REQUIRE_FROZEN_INPUTS: "1"', workflow)


if __name__ == '__main__':
    unittest.main()
