import copy
import hashlib
import itertools
import math
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import w0wa_bao_sn_multi as old
import w0wa_bao_sn_multi_hold_v2 as new

COMPS = ['pantheon_plus', 'union3']

def output(fractions=(0.2, 0.2), cosines=(0.4, 0.4)):
    return [{'compilation': name, 'holds': [{'label': 'bin-A', 'fraction_removed': f, 'cosine': c}]}
            for name, f, c in zip(('Pantheon+', 'Union3'), fractions, cosines)]

def valid(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)

class ContractTests(unittest.TestCase):
    def test_red_historical_recipe_green_versioned_candidate(self):
        fixture = output()
        self.assertEqual(old.decision_from_holds('bao_tracer_jackknife', COMPS, fixture)[0], 'INCONCLUSIVE')
        self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, fixture)[0], 'REJECTED')

    def test_historical_bytes_unchanged(self):
        self.assertEqual(hashlib.sha256(Path(old.__file__).read_bytes()).hexdigest(),
                         '61406850e614c3bb7fbd69b7f67adf94c5ea22ffd5323e3882e1baa038c5377b')

    def test_all_numerical_functions_except_decision_unchanged(self):
        import ast
        def functions(module):
            return {n.name: ast.dump(n, include_attributes=False) for n in ast.parse(Path(module.__file__).read_text()).body
                    if isinstance(n, ast.FunctionDef) and n.name not in ('decision_from_holds', 'run', 'synthetic_smoke')}
        self.assertEqual(functions(old), functions(new))

    def test_literal_boundary_matrix(self):
        fractions = [-0.1, 0.2, 0.5, math.nextafter(0.5, math.inf), 0.7,
                     math.nextafter(0.7, math.inf), None, float('nan')]
        cosines = [0.4, math.nextafter(0.5, -math.inf), 0.5, 0.8,
                   math.nextafter(0.8, math.inf), None, float('nan')]
        checked = 0
        for f1, f2, c1, c2 in itertools.product(fractions, fractions, cosines, cosines):
            reject_fraction = valid(f1) and valid(f2) and f1 > 0.7 and f2 > 0.7
            reject_cosine = valid(c1) and valid(c2) and c1 < 0.5 and c2 < 0.5
            success = (all(valid(x) for x in (f1, f2, c1, c2))
                       and f1 <= 0.5 and f2 <= 0.5 and c1 >= 0.8 and c2 >= 0.8)
            expected = 'REJECTED' if reject_fraction or reject_cosine else 'PROMOTED' if success else 'INCONCLUSIVE'
            with self.subTest(f1=f1, f2=f2, c1=c1, c2=c2):
                self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, output((f1,f2),(c1,c2)))[0], expected)
            checked += 1
        self.assertEqual(checked, 3136)

    def test_equalities(self):
        for f, c, expected in [(0.7, 0.8, 'INCONCLUSIVE'), (0.2, 0.5, 'INCONCLUSIVE'),
                               (0.5, 0.8, 'PROMOTED'), (0.01, 0.49, 'REJECTED')]:
            self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, output((f,f),(c,c)))[0], expected)

    def test_different_bins_do_not_pool_rejection(self):
        rows = output((0.2, 0.2), (0.4, 0.9))
        rows[0]['holds'].append({'label':'bin-B','fraction_removed':0.2,'cosine':0.9})
        rows[1]['holds'].append({'label':'bin-B','fraction_removed':0.2,'cosine':0.4})
        self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, rows)[0], 'INCONCLUSIVE')
        rows[0]['holds'][1]['cosine'] = 0.4
        self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, rows)[0], 'REJECTED')

    def test_all_bins_required_for_success(self):
        rows=output((0.5,0.5),(0.8,0.8))
        for row in rows: row['holds'].append({'label':'bin-B','fraction_removed':0.2,'cosine':0.7})
        self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, rows)[0], 'INCONCLUSIVE')

    def test_independent_rejection_clauses(self):
        for rows in (output((0.8,0.8),(None,None)), output((None,None),(0.4,0.4))):
            self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, rows)[0], 'REJECTED')

    def test_malformed_or_missing_compilation_cannot_promote(self):
        rows=output((0.2,0.2),(0.9,0.9))
        cases=[rows[:1], [], [rows[0],copy.deepcopy(rows[0])]]
        duplicated=copy.deepcopy(rows);duplicated[0]['holds']*=2;cases.append(duplicated)
        missing=copy.deepcopy(rows);missing[1]['holds'][0]['label']='other';cases.append(missing)
        for case in cases:
            self.assertEqual(new.decision_from_holds('bao_tracer_jackknife', COMPS, case)[0], 'INCONCLUSIVE')
        self.assertEqual(new.decision_from_holds('redshift_jackknife', COMPS, rows)[0], 'INCONCLUSIVE')

    def test_existing_runner_calls_new_decision_without_real_data(self):
        params={'mode':'bao_tracer_jackknife','compilations':COMPS,'priors':{},'tracer_groups':[{'label':'bin-A','z':[0.295]}]}
        sn={'z':np.zeros(10)}
        points=({'w0':0.0,'wa':0.0}, {'w0':-0.6,'wa':math.sqrt(0.84)})
        calls=[(points[0],10.0),(points[1],8.0)]*2
        with patch.object(new,'load_bao',return_value=object()), patch.object(new,'load_pantheon',return_value={**sn,'name':'Pantheon+'}), \
             patch.object(new,'load_union3',return_value={**sn,'name':'Union3'}), patch.object(new,'sub_bao',return_value=object()), \
             patch.object(new,'dchi',side_effect=calls):
            result=new.run(params)
        self.assertEqual(result['verdict'],'REJECTED')
        self.assertEqual(result['decision'],'SAME_BIN_DIRECTION_UNSTABLE')
        self.assertEqual(len(result['statistics']['compilations']),2)

if __name__=='__main__': unittest.main(verbosity=2)
