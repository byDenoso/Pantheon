from __future__ import annotations

import unittest

import numpy as np

from science.aas77733r1_hardening.hardening import (
    HARDENING_ID,
    MEDIUM_MOCKS,
    collapse_by_cid,
    sky_sector_ids,
    student_t_profile,
    survey_redshift_balanced_subset,
)


class ContractTests(unittest.TestCase):
    def test_contract_is_separate_from_frozen_gates(self):
        self.assertEqual(HARDENING_ID, "AAS77733_R1_HARDENING_LM_V1")
        self.assertEqual(MEDIUM_MOCKS, 5000)


class CollapseTests(unittest.TestCase):
    def test_duplicate_cids_collapse_with_inverse_variance_weights(self):
        cid = np.array(["A", "A", "B"])
        values = np.array([1.0, 3.0, 10.0])
        cov = np.diag([1.0, 1.0, 4.0])
        collapsed = collapse_by_cid(cid, values, cov)
        self.assertEqual(collapsed["cid"].tolist(), ["A", "B"])
        np.testing.assert_allclose(collapsed["values"], [2.0, 10.0])
        np.testing.assert_allclose(np.diag(collapsed["covariance"]), [0.5, 4.0])
        self.assertEqual(collapsed["aggregation"].shape, (2, 3))


class RobustLikelihoodTests(unittest.TestCase):
    def test_student_t_profile_downweights_single_extreme_outlier(self):
        y = np.array([0.0, 0.0, 0.0, 10.0])
        design = np.ones((4, 1))
        beta, diagnostics = student_t_profile(y, design, np.eye(4), nu=4.0)
        gaussian_intercept = float(np.mean(y))
        self.assertLess(abs(float(beta[0])), abs(gaussian_intercept))
        self.assertLess(diagnostics["min_weight"], 0.5)
        self.assertTrue(diagnostics["converged"])


class BalanceTests(unittest.TestCase):
    def test_balanced_subset_equalizes_survey_counts_within_each_populated_bin(self):
        survey = np.array([1, 1, 1, 2, 2, 2, 1, 1, 2, 2])
        z = np.array([0.10, 0.11, 0.12, 0.10, 0.11, 0.12, 0.80, 0.81, 0.80, 0.81])
        idx, diagnostics = survey_redshift_balanced_subset(survey, z, bins=2, seed=7)
        self.assertGreater(len(idx), 0)
        selected_s = survey[idx]
        selected_z = z[idx]
        edges = np.asarray(diagnostics["edges"])
        for lo, hi in zip(edges[:-1], edges[1:], strict=True):
            mask = (selected_z >= lo) & (selected_z <= hi if hi == edges[-1] else selected_z < hi)
            counts = [np.count_nonzero(selected_s[mask] == s) for s in np.unique(selected_s[mask])]
            if len(counts) > 1:
                self.assertEqual(min(counts), max(counts))


class SkyTests(unittest.TestCase):
    def test_sky_sectors_cover_ra_quadrants_and_hemispheres(self):
        ra = np.array([10.0, 100.0, 190.0, 280.0, 10.0, 100.0, 190.0, 280.0])
        dec = np.array([-10.0, -10.0, -10.0, -10.0, 10.0, 10.0, 10.0, 10.0])
        sectors = sky_sector_ids(ra, dec)
        self.assertEqual(set(sectors.tolist()), set(range(8)))


if __name__ == "__main__":
    unittest.main()
