import importlib.util
import math
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

    def test_non_finite_scalars_fail_closed(self):
        keys = (
            "expected_auc", "success_median_ge", "success_min_ge",
            "kill_auc_le", "kill_fraction_ge", "kill_median_le",
        )
        for key in keys:
            for value in (math.nan, math.inf, -math.inf):
                with self.subTest(key=key, value=value):
                    params = self.params()
                    params[key] = value
                    with self.assertRaises(ValueError):
                        recipe.run(params, self.projection())

    def test_invalid_scalar_and_count_shapes_fail_closed(self):
        invalid = (
            ("expected_auc", "0.7777777777777778"),
            ("success_min_ge", True),
            ("kill_fraction_ge", 1.1),
            ("expected_n", 12.0),
            ("expected_promoted", True),
            ("expected_non_promoted", 0),
        )
        for key, value in invalid:
            with self.subTest(key=key, value=value):
                params = self.params()
                params[key] = value
                with self.assertRaises(ValueError):
                    recipe.run(params, self.projection())

    def test_invalid_cohort_shapes_scores_and_verdicts_fail_closed(self):
        params = self.params()
        for cohort_ids in ("HYP-A", ["HYP-A", ""], ["HYP-A", "HYP-A"], [["HYP-A"]]):
            with self.subTest(cohort_ids=cohort_ids):
                bad = dict(params, cohort_ids=cohort_ids)
                with self.assertRaises((TypeError, ValueError)):
                    recipe.run(bad, self.projection())
        projection = self.projection()
        projection["tests"][0]["rank_score"] = "0.91"
        with self.assertRaises(ValueError):
            recipe.run(params, projection)
        projection = self.projection()
        projection["tests"][0]["rank_score"] = math.nan
        with self.assertRaises(ValueError):
            recipe.run(params, projection)
        projection = self.projection()
        projection["tests"][0]["verdict"] = {"value": "INCONCLUSIVE"}
        with self.assertRaises(ValueError):
            recipe.run(params, projection)

    def test_invalid_hash_shape_fails_closed_before_network(self):
        version = "4f7fe6980476a4c1cd00c205a85336269153b35a"
        url = f"https://raw.githubusercontent.com/byDenoso/Pantheon/{version}/{recipe.SNAPSHOT_PATH}"
        for value in (None, "z" * 64, "sha256:" + "g" * 64):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    recipe.load_projection(url, version, value)


if __name__ == "__main__":
    unittest.main()
