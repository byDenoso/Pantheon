import importlib.util
import pathlib
import unittest

P = pathlib.Path(__file__).with_name("rank_score_leave_one_out.py")
S = importlib.util.spec_from_file_location("recipe", P)
recipe = importlib.util.module_from_spec(S)
S.loader.exec_module(recipe)

COHORT = [
    ("HYP-A", .91, "INCONCLUSIVE"), ("H662", .88, "PROMOTED"),
    ("META-BAT", .90, "PROMOTED"), ("META-CAMP", .91, "PROMOTED"),
    ("META-EVENT", .88, "PROMOTED"), ("META-RELAY", .86, "INCONCLUSIVE"),
    ("META-REVIEW", .82, "PROMOTED"), ("META-ROAD", .86, "PROMOTED"),
    ("META-UNAP", .54, "INCONCLUSIVE"), ("DMN006", .74, "DRAFT"),
    ("META-TRANS", .84, "DRAFT"), ("H0LSS", .79, "DRAFT"),
]


class TestRankScoreLeaveOneOut(unittest.TestCase):
    def params(self):
        return {
            "cohort_ids": [x[0] for x in COHORT],
            "expected_n": 12, "expected_promoted": 6, "expected_non_promoted": 6,
            "expected_auc": 0.7777777777777778,
            "success_median_ge": .70, "success_min_ge": .60,
            "kill_auc_le": .55, "kill_fraction_ge": .25, "kill_median_le": .60,
        }

    def projection(self):
        return {"tests": [{"id": i, "status": "DONE", "rank_score": s, "verdict": v} for i, s, v in COHORT]}

    def test_reproduces_original_auc_and_is_stable(self):
        result = recipe.run(self.params(), self.projection())
        self.assertEqual(result["verdict"], "PROMOTED")
        self.assertAlmostEqual(result["statistics"]["baseline_auc"], 7 / 9, places=12)
        self.assertGreater(result["statistics"]["leave_one_out_auc_min"], .60)

    def test_missing_cohort_fails_closed(self):
        projection = self.projection()
        projection["tests"].pop()
        with self.assertRaises(ValueError):
            recipe.run(self.params(), projection)

    def test_non_done_member_fails_closed(self):
        projection = self.projection()
        projection["tests"][0]["status"] = "BLOCKED_INPUT"
        with self.assertRaises(ValueError):
            recipe.run(self.params(), projection)

    def test_snapshot_source_is_commit_pinned(self):
        version = "4f7fe6980476a4c1cd00c205a85336269153b35a"
        url = f"https://raw.githubusercontent.com/byDenoso/Pantheon/{version}/{recipe.SNAPSHOT_PATH}"
        with self.assertRaises(ValueError):
            recipe.load_projection(url.replace(version, "main"), version, "0" * 64)


if __name__ == "__main__":
    unittest.main()
