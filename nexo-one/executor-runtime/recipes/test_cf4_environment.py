"""CF4 integration checks: synthetic inputs only, no network or real-data fits."""
from pathlib import Path
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import numpy as np

ROOT=Path(__file__).resolve().parent
NAME='cf4_monopole_dipole_shell_gls_v1'
spec=importlib.util.spec_from_file_location('cf4_environment',ROOT/(NAME+'.py'))
cf4=importlib.util.module_from_spec(spec);spec.loader.exec_module(cf4)
spec=importlib.util.spec_from_file_location('catalog_validator',ROOT/'recipe_param_preflight.py')
validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)

class CF4Integration(unittest.TestCase):
    def params(self,score):
        m=cf4._manifest()
        return dict(mode='cf4_environment',test_id='SYNTHETIC-CF4-TEST',prereg_hash='sha256:'+'1'*64,dipole_score=score,
                    fit_scope='joint_gls_marginal',decision_ref='SYNTHETIC-SOURCE-REFERENCE',decision_sha256='0'*64)

    def test_missing_and_unsupported_choices_stop_before_loading(self):
        for params in ({},self.params('radial_amplitude'),{**self.params('vector_quadratic'),'decision_ref':''}):
            with self.subTest(params=params),mock.patch.object(cf4,'_load_bound_rows') as loader:
                with self.assertRaises(cf4.OperationalBlock):cf4.scientific_run(params)
                loader.assert_not_called()

    def test_public_manifest_fixes_definition_without_private_identity_or_approval(self):
        m=cf4._manifest()
        self.assertEqual(m['dipole_score'],'vector_quadratic')
        self.assertEqual(m['fit_scope'],'joint_gls_marginal')
        for key in ('approved_decisions','test_id','prereg_hash','canonical_receipt','approved_by'):
            self.assertNotIn(key,m)

    def test_exact_fixed_definition_is_admitted(self):
        m=cf4._manifest();p=self.params('vector_quadratic')
        r=validator.validate_params(NAME,p,m['inputs'],ROOT)
        self.assertTrue(r['eligible'],r)
        actual,receipt=cf4._decision_preflight(p)
        self.assertEqual(actual,m);self.assertTrue(receipt['eligible'])
        self.assertEqual(receipt['manifest_sha256'],r['manifest_sha256'])
        self.assertEqual(receipt['validator_sha256'],r['validator_sha256'])

    def test_source_and_identity_fields_are_required(self):
        m=cf4._manifest();p=self.params('vector_quadratic')
        for key in p:
            q=dict(p);q.pop(key)
            self.assertFalse(validator.validate_params(NAME,q,m['inputs'],ROOT)['eligible'],key)
        for key in ('prereg_hash','decision_sha256','test_id','decision_ref'):
            self.assertFalse(validator.validate_params(NAME,{**p,key:''},m['inputs'],ROOT)['eligible'],key)
        self.assertFalse(validator.validate_params(NAME,{**p,'approved_by':'SYNTHETIC'},m['inputs'],ROOT)['eligible'])

    def test_input_version_hash_and_identity_changes_are_rejected(self):
        import copy
        m=cf4._manifest();p=self.params('vector_quadratic')
        for key in ('name','url','version','sha256'):
            inputs=copy.deepcopy(m['inputs']);inputs[0][key]='changed'
            self.assertFalse(validator.validate_params(NAME,p,inputs,ROOT)['eligible'],key)

    def test_manifest_only_edit_is_rejected(self):
        import shutil
        m=cf4._manifest();p=self.params('vector_quadratic')
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'preflight').mkdir()
            shutil.copy(ROOT/(NAME+'.py'),root/(NAME+'.py'))
            m['definition']='changed'
            (root/'preflight'/(NAME+'.json')).write_text(json.dumps(m))
            self.assertIn('CF4_RUNTIME_PREFLIGHT_DRIFT',validator.validate_params(NAME,p,m['inputs'],root)['reasons'])

    def test_catalog_never_admits_technical_smoke(self):
        m=cf4._manifest();r=validator.validate_params(NAME,{'mode':'synthetic_smoke'},m['inputs'],ROOT)
        self.assertFalse(r['eligible'])

    def test_formulas_cross_three_differently(self):
        d={'vector':np.array([3.,3.,0.]),'marginal_covariance':np.diag([1.,9.,1.])}
        self.assertAlmostEqual(cf4.explicit_dipole_score(d,'radial_amplitude'),1.8973665961010275)
        self.assertAlmostEqual(cf4.explicit_dipole_score(d,'vector_quadratic'),np.sqrt(10.))
        with self.assertRaises(cf4.ContractInputError):cf4.explicit_dipole_score(d,None)
        d['vector']=np.zeros(3)
        for score in ('radial_amplitude','vector_quadratic'):self.assertEqual(cf4.explicit_dipole_score(d,score),0.)

    def test_explicit_choice_governs_frozen_branch(self):
        d={'vector':np.array([3.,3.,0.]),'marginal_covariance':np.diag([1.,9.,1.])}
        pooled={'baseline':{'delta_h_pool':0.,'lower95':-.2,'upper95':.2,'dipoles':{k:d for k in ('40-60','60-80','80-120','120-160')}},
                'region_loo':{str(i):{'delta_h_pool':0.} for i in range(12)}}
        self.assertEqual(cf4._classify_explicit(pooled,'radial_amplitude')['decision'],'REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT')
        self.assertEqual(cf4._classify_explicit(pooled,'vector_quadratic')['decision'],'CLASSIFY_ANISOTROPIC_H2')

    def test_standalone_cli_smoke_and_missing_config(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'test.py').write_bytes((ROOT/(NAME+'.py')).read_bytes())
            env=dict(os.environ,PARAMS_PATH=str(p/'params.json'),RESULT_PATH=str(p/'result.json'),OPENBLAS_NUM_THREADS='1')
            for params,exitcode in [({},1),({'mode':'synthetic_smoke'},0)]:
                (p/'params.json').write_text(json.dumps(params))
                run=subprocess.run([sys.executable,str(p/'test.py')],cwd=p,env=env,capture_output=True,timeout=20)
                out=json.loads((p/'result.json').read_text());self.assertEqual(run.returncode,exitcode)
                self.assertIsNone(out.get('result'));self.assertFalse(out['scientific_result_eligible'])
                if exitcode:self.assertNotIn('verdict',out)
                else:
                    self.assertTrue({'verdict','decision','summary','statistics','semantic'}.issubset(out))
                    self.assertIsNone(out['verdict']);self.assertEqual(out['statistics']['dataset_kind'],'synthetic')

    def test_operational_failures_retain_reason_in_shared_receipt_classifier(self):
        spec=importlib.util.spec_from_file_location('shared_receipt_validation',ROOT.parent/'receipt_validation.py')
        receipt=importlib.util.module_from_spec(spec);spec.loader.exec_module(receipt)
        errors=(cf4.OperationalBlock('missing definition'),OSError('download unavailable'),
                cf4.ContractInputError('input hash or schema mismatch'),np.linalg.LinAlgError('GLS unavailable'))
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'params.json').write_text(json.dumps(self.params('vector_quadratic')))
            env={'PARAMS_PATH':str(p/'params.json'),'RESULT_PATH':str(p/'result.json')}
            for error in errors:
                with self.subTest(error=type(error).__name__),mock.patch.dict(os.environ,env),mock.patch.object(cf4,'run',side_effect=error):
                    with self.assertRaises(SystemExit) as stopped:cf4.main()
                    self.assertEqual(stopped.exception.code,1)
                    out=json.loads((p/'result.json').read_text())
                    self.assertNotIn('result',out);self.assertNotIn('verdict',out)
                    self.assertFalse(out['scientific_result_eligible'])
                    ok,stage,reason=receipt.classify_payload(1,out)
                    self.assertFalse(ok);self.assertEqual(stage,'INPUT_OR_FIT_UNAVAILABLE')
                    self.assertEqual(reason['code'],'INPUT_OR_FIT_UNAVAILABLE')
                    self.assertEqual(reason['detail'],str(error))

    def test_catalog_rejects_embedded_source_drift_without_raising(self):
        m=cf4._manifest()
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'preflight').mkdir();(p/'preflight'/(NAME+'.json')).write_text(json.dumps(m))
            for code in ['not valid Python @', 'x=1']:
                (p/(NAME+'.py')).write_text(code)
                got=validator.validate_params(NAME,self.params('vector_quadratic'),m['inputs'],p)
                self.assertFalse(got['eligible']);self.assertIn('CF4_RUNTIME_PREFLIGHT_DRIFT',got['reasons'])

if __name__=='__main__':unittest.main()
