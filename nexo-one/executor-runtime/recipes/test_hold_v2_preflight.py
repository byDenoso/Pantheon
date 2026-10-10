import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from recipe_param_preflight import validate_params
import w0wa_bao_sn_multi_hold_v2 as recipe

ROOT = Path(__file__).parent
MANIFEST = json.loads((ROOT/'preflight/w0wa_bao_sn_multi_hold_v2.json').read_text())
PARAMS = {'mode':'bao_tracer_jackknife','bao_release':'dr2','compilations':['pantheon_plus','union3'],
          'priors':{'a_rd':[30,8],'omega_m':[0.315,0.007]},
          'tracer_groups':[{'label':f'bin-{z}', 'z':[z]} for z in sorted(set(MANIFEST['releases']['dr2']['redshift_rows']))]}
INPUTS = (MANIFEST['releases']['dr2']['inputs'] + MANIFEST['compilations']['pantheon_plus']['inputs']
          + MANIFEST['compilations']['union3']['inputs'])

def check(params=PARAMS, inputs=INPUTS):
    return validate_params('w0wa_bao_sn_multi_hold_v2', params, inputs, ROOT)

class HoldPreflight(unittest.TestCase):
    def test_frozen_profiles_pass_without_network(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
            for om in (0.315,0.33):
                params=copy.deepcopy(PARAMS);params['priors']['omega_m'][0]=om
                self.assertTrue(check(params)['eligible'])

    def test_profile_and_bound_input_changes_are_not_silent_aliases(self):
        for name,value in [('bao_release','dr1'),('compilations',['union3']),('mode','redshift_jackknife')]:
            params=copy.deepcopy(PARAMS);params[name]=value
            self.assertFalse(check(params)['eligible'])
        for key in ('url','version','sha256'):
            inputs=copy.deepcopy(INPUTS);inputs[0][key]='wrong'
            self.assertIn('INPUT_RECIPE_MANIFEST_MISMATCH',check(inputs=inputs)['reasons'])

    def test_complete_single_bin_grid_required(self):
        for change in ('missing','aggregated','duplicate','off-grid','none'):
            params=copy.deepcopy(PARAMS)
            if change=='missing': params['tracer_groups'].pop()
            elif change=='aggregated': params['tracer_groups'][0]['z'].append(.51)
            elif change=='duplicate': params['tracer_groups'][0]['z']=[.51]
            elif change=='off-grid': params['tracer_groups'][0]['z']=[.296]
            else: params['tracer_groups']=None
            self.assertIn('RECIPE_HOLDOUTS_INVALID',check(params)['reasons'])

    def test_smoke_cannot_be_admitted_as_science(self):
        self.assertFalse(check({'mode':'synthetic_smoke'})['eligible'])
        with patch('urllib.request.urlopen',side_effect=AssertionError('network forbidden')):
            result=recipe.run({'mode':'synthetic_smoke'})
        self.assertEqual(result['execution_status'],'TECHNICAL_SMOKE_ONLY')
        self.assertFalse(result['scientific_result_eligible'])
        self.assertIsNone(result['result']);self.assertIsNone(result['verdict'])

if __name__=='__main__': unittest.main(verbosity=2)
