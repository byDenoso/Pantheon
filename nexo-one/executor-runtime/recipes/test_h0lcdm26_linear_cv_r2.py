"""Software-only regressions; no synthetic observation is a scientific result."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import numpy as np

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lin_cv', ROOT / 'h0lcdm26_linear_cv_r2.py')
cv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cv)

class LinearCVSoftwareTests(unittest.TestCase):
    def test_growth_rate_LCDM_is_physical_without_free_parameters(self):
        f = cv.flat_lcdm_growth(0.315)
        self.assertGreater(f, 0.48)
        self.assertLess(f, 0.6)

    def test_covariance_diagonal_matches_isotropic_velocity_integral(self):
        k = np.geomspace(1e-4, 1, 128)
        power = 1000 * np.exp(-k)
        vec = cv.sky_vectors(np.array([0., 90., 220.]), np.array([0., 0., 27.]))
        pos = vec * np.array([10., 90., 220.])[:, None]
        sigma = cv.velocity_covariance(pos, vec, k, power, .5, block=2)
        from scipy.integrate import simpson
        expected = (100 * .5)**2 / (6 * np.pi**2) * simpson(power, x=k)
        np.testing.assert_allclose(np.diag(sigma), expected, rtol=5e-12)
        np.testing.assert_allclose(sigma, sigma.T, atol=1e-8)
        self.assertGreater(np.linalg.eigvalsh(sigma)[0], 0)

    def test_full_covariance_weighted_CID_collapse_preserves_cross_terms(self):
        records = np.array([
            ('a', 1, .034, 0., 10.),
            ('a', 1, .034, 0., 10.),
            ('b', 1, .07, 90., -5.),
            ('c', 0, .08, 10., 9.),
        ], dtype=[('CID','U8'),('USED_IN_SH0ES_HF','i4'),('zHD','f8'),('RA','f8'),('DEC','f8')])
        cov = np.array([[1.,.2,.1,0.],[.2,1.,.4,0.],[.1,.4,1.,0.],[0.,0.,0.,1.]])
        out = cv.collapse_cids(records,cov,.023)
        self.assertEqual(out['selected_rows'],3)
        self.assertEqual(out['cids'],['a','b'])
        np.testing.assert_allclose(out['operator'] @ cov[:3,:3] @ out['operator'].T,
                                  out['measurement_cov'])
        self.assertNotEqual(float(out['measurement_cov'][0,1]),0.)

    def test_two_frozen_cuts_are_same_when_hubble_flow_min_z_exceeds_point023(self):
        records = np.array([('a',1,.02343,0.,0.),('b',1,.08,20.,0.)],
           dtype=[('CID','U8'),('USED_IN_SH0ES_HF','i4'),('zHD','f8'),('RA','f8'),('DEC','f8')])
        a = cv.collapse_cids(records,np.eye(2),.023)['selected_source_indices']
        b = cv.collapse_cids(records,np.eye(2),.01)['selected_source_indices']
        np.testing.assert_array_equal(a,b)

    def test_tail_propagation_agrees_with_20000_draw_sanity(self):
        z = np.array([.03,.055,.08])
        u = cv.sky_vectors(np.array([0.,90.,160.]),np.array([0.,0.,30.]))
        pos = u*np.array([90.,155.,220.])[:,None]
        k = np.geomspace(1e-4,1.,128)
        vel = cv.velocity_covariance(pos,u,k,1000*np.exp(-k),.52)
        r = cv.infer_sigma_and_tail(np.diag([.01,.012,.02]),vel,z,.315)
        self.assertLess(r['mc_relative_discrepancy'],.10)
        self.assertEqual(r['n_mc'],20000)
        self.assertLess(r['P_deltaH0_ge_6p09'],.5)

    def test_rejects_unpinned_and_missing_inputs(self):
        with self.assertRaisesRegex(cv.ScientificInputError,'four frozen inputs'):
            cv.verified_inputs({'plin':'/tmp/nope'})
        for name in cv.EXPECTED_SHA:
            with self.subTest(name=name),self.assertRaisesRegex(cv.ScientificInputError,'missing'):
                cv.verified_inputs({key:'/tmp/absent' for key in cv.EXPECTED_SHA})

    def test_runtime_will_not_run_without_exact_identity_and_inputs(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pp=root/'params.json';rr=root/'result.json'
            pp.write_text(json.dumps({'test_id':cv.TEST_ID,'prereg_hash':'sha256:'+'0'*64,'inputs':{}}))
            with mock.patch.dict(os.environ,{'PARAMS_PATH':str(pp),'RESULT_PATH':str(rr)}):
                with self.assertRaisesRegex(cv.ScientificInputError,'preregistration identity changed'):
                    cv.main()

if __name__ == '__main__':unittest.main()
