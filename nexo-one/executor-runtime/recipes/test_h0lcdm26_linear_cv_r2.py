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

    def test_linear_growth_evolves_with_redshift_and_matches_z0_limit(self):
        rates = cv.linear_velocity_growth_response(0.315,np.array([0.,.03,.10,.15]))
        self.assertAlmostEqual(rates[0],cv.flat_lcdm_growth(0.315),places=12)
        self.assertTrue(np.all(np.isfinite(rates)))
        self.assertTrue(np.all(rates>0))
        self.assertGreater(rates[-1],rates[0])

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

    def test_off_diagonal_tensor_matches_direct_fourier_angular_quadrature(self):
        """Independent direction integral checks j0/j2 off-diagonal geometry."""
        from scipy.integrate import simpson
        ra = np.array([85., 31., 18.])
        rb = np.array([-36., 47., 91.])
        na, nb = ra / np.linalg.norm(ra), rb / np.linalg.norm(rb)
        k = np.geomspace(1e-4, .12, 64)
        power = 2500 * (k / .02)**.7 * np.exp(-k / .07)
        computed = cv.velocity_covariance(np.array([ra, rb]), np.array([na, nb]),
                                          k, power, np.array([.51, .56]), block=1)[0, 1]

        # Independent Fourier-space sphere integral: no Bessel kernel here.
        mu, weights = np.polynomial.legendre.leggauss(48)
        azimuth = np.arange(96) * 2 * np.pi / 96
        sin_theta = np.sqrt(1 - mu[:, None]**2)
        directions = np.stack((
            np.broadcast_to(sin_theta * np.cos(azimuth), (48, 96)),
            np.broadcast_to(sin_theta * np.sin(azimuth), (48, 96)),
            np.broadcast_to(mu[:, None], (48, 96)),
        ), axis=-1).reshape(-1, 3)
        weight = np.repeat(weights / (2 * 96), 96)
        directional = (directions @ na) * (directions @ nb)
        phase = directions @ (ra - rb)
        angular_kernel = np.cos(np.outer(k, phase)) @ (weight * directional)
        expected = (100**2 * .51 * .56 / (2 * np.pi**2)
                    * simpson(power * angular_kernel, x=k))
        np.testing.assert_allclose(computed, expected, rtol=1e-8, atol=1e-7)

    def test_velocity_covariance_scales_with_each_redshift_growth_factor(self):
        k = np.geomspace(1e-4, 1, 64)
        power = 2000*np.exp(-k)
        u = cv.sky_vectors(np.array([0.,60.,220.]),np.array([5.,-15.,30.]))
        r = u*np.array([80.,130.,260.])[:,None]
        scalar=cv.velocity_covariance(r,u,k,power,.5,block=2)
        growth=np.array([.5,.7,.9])
        evolved=cv.velocity_covariance(r,u,k,power,growth,block=2)
        ratio=growth/.5
        np.testing.assert_allclose(evolved,scalar*ratio[:,None]*ratio[None,:],rtol=1e-12,atol=1e-10)
        self.assertGreater(np.linalg.eigvalsh(evolved)[0],0.)

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
