import io
import unittest
from unittest.mock import patch

import numpy as np
import w0wa_bao_sn_multi as recipe


class ScientificChecks(unittest.TestCase):
    def test_marginalization_is_invariant_to_absolute_magnitude(self):
        z = np.linspace(.03, 1., 20)
        sn = {"z": z, "zhel": z, "mu": 40 + 5*np.log10(z), "prec": np.eye(20)}
        bao = (np.array([.3, .6, 1., 2.]), np.ones(4)*10,
               ["DV_over_rs"]*4, np.eye(4))
        theta = [.3, -1., 0., 30.]
        first = recipe.chi2(theta, bao, sn, {})
        shifted = recipe.chi2(theta, bao, {**sn, "mu": sn["mu"] + 25}, {})
        self.assertAlmostEqual(first, shifted, places=9)

    def test_sn_holdout_marginalizes_removed_data(self):
        z = np.linspace(.03, 1., 20)
        cov = np.eye(20) + .2*np.ones((20, 20))
        sn = {"z": z, "zhel": z, "mu": z, "cov": None, "prec": np.linalg.inv(cov)}
        cut = recipe.sub_sn(sn, [.03, .4])
        keep = np.where(z >= .4)[0]
        np.testing.assert_allclose(cut["prec"], np.linalg.inv(cov[np.ix_(keep, keep)]))
        self.assertGreater(np.max(np.abs(cut["prec"] - sn["prec"][np.ix_(keep, keep)])), .001)

    def test_release_mismatch_and_small_holdout_fail(self):
        z = np.array([.295, .51, .706, .93, 1.317, 1.491, 2.33])
        bao = (z, np.ones(7), ["DV_over_rs"]*7, np.eye(7))
        with self.assertRaisesRegex(ValueError, "não existe"):
            recipe.sub_bao(bao, [1.484])
        with self.assertRaisesRegex(ValueError, "quatro"):
            recipe.sub_bao(bao, [.295, .51, .706, .93])
        self.assertEqual(len(recipe.sub_bao(bao, [1.491])[0]), 6)

    def test_single_union3_charter_boundaries_preserved(self):
        for removed, expected in ((.49, "PROMOTED"), (.5, "INCONCLUSIVE"), (.7, "REJECTED")):
            rows=[{"holds":[{"label":"lya", "fraction_removed":removed, "cosine":.9}]}]
            self.assertEqual(recipe.decision_from_holds("bao_tracer_jackknife", ["union3"], rows)[0], expected)

    def test_success_requires_two_complete_compilations(self):
        def row(a,b):
            return {"holds":[{"label":label,"fraction_removed":value,"cosine":.9}
                             for label,value in (("LRG",a),("ELG",b))]}
        # Different failed holdouts do not provide two successful compilations.
        self.assertEqual(recipe.decision_from_holds("bao_tracer_jackknife", ["des_sn5yr","union3"],
                                                   [row(.6,.1),row(.1,.6)])[0], "INCONCLUSIVE")
        self.assertEqual(recipe.decision_from_holds("bao_tracer_jackknife", ["des_sn5yr","union3"],
                                                   [row(.5,.1),row(.1,.5)])[0], "PROMOTED")
        self.assertEqual(recipe.decision_from_holds("bao_tracer_jackknife", ["des_sn5yr","union3"],
                                                   [row(.71,.1),row(.71,.1)])[0], "REJECTED")

    def test_duplicate_compilations_and_changed_hash_fail(self):
        with self.assertRaisesRegex(ValueError, "repetidas"):
            recipe.run({"mode": "bao_tracer_jackknife", "compilations": ["union3", "union3"]})
        url = recipe.BAO_BASES["dr1"] + "mean.txt"
        recipe.fetch_bytes.cache_clear()
        with patch("urllib.request.urlopen", return_value=io.BytesIO(b"modified")):
            with self.assertRaisesRegex(ValueError, "sha256"):
                recipe.fetch_bytes(url)


if __name__ == "__main__":
    unittest.main()
