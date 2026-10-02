import unittest
import rank_score_robustness as r


class RankScoreChecks(unittest.TestCase):
    def projection(self):
        rows = []
        for i, (score, verdict) in enumerate(((.86,"PROMOTED"),(.54,"INCONCLUSIVE"),(.82,"PROMOTED"),(.88,"PROMOTED"),(.79,"DRAFT"),(.74,"DRAFT"),(.84,"DRAFT"),(.90,"PROMOTED"),(.91,"INCONCLUSIVE"),(.91,"PROMOTED"),(.88,"PROMOTED"),(.86,"INCONCLUSIVE"))):
            rows.append({"id": f"t{i}", "rank_score": score, "verdict": verdict, "status_group": "DONE"})
        return {"tests": rows}

    def params(self):
        return {"mode":"leave_one_out","cohort_ids":[f"t{i}" for i in range(12)],
                "expected_n":12,"expected_auc":7/9,"auc_tolerance":1e-12}

    def test_reconstructs_recorded_auc_and_leave_one_out(self):
        out = r.run(self.params(), self.projection())
        self.assertAlmostEqual(out["statistics"]["baseline_auc"], 7/9)
        self.assertEqual(len(out["statistics"]["holdouts"]), 12)
        self.assertIn(out["verdict"], {"PROMOTED","INCONCLUSIVE","REJECTED"})

    def test_identity_mismatch_fails_closed(self):
        p = self.params(); p["expected_n"] = 11
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            r.run(p, self.projection())

    def test_permutation_without_seed_is_inconclusive(self):
        p = self.params(); p["mode"] = "label_permutation"; p["permutations"] = 10000
        out = r.run(p, self.projection())
        self.assertEqual(out["decision"], "FROZEN_SEED_MISSING")
        self.assertEqual(out["verdict"], "INCONCLUSIVE")


if __name__ == "__main__":
    unittest.main()
