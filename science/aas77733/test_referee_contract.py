from __future__ import annotations

import unittest

from science.aas77733.config import load_manifest
from science.aas77733.canonical_gates import close_claim
from science.aas77733.stats import adaptive_mock_target


class RefereeManifestContractTests(unittest.TestCase):
    def test_gate_names_match_frozen_r1_protocol(self):
        names = {g["id"]: g["name"] for g in load_manifest()["gates"]}
        self.assertEqual(names["G2"], "covariance_adjudication")
        self.assertEqual(names["G9"], "template_invariance")
        self.assertEqual(names["G11"], "structured_null_hierarchy")
        self.assertEqual(names["G12"], "survey_attribution")
        self.assertEqual(names["G13"], "nuisance_absorption")
        self.assertEqual(names["G18"], "physical_context_nulls")

    def test_publication_grade_mock_policy_is_frozen(self):
        m = load_manifest()
        self.assertEqual(m["default_mocks"], 10000)
        self.assertEqual(m["mock_policy"], {"base": 10000, "tail_trigger_p": 0.01, "tail": 100000})

    def test_zmin_and_template_families_are_frozen(self):
        p = load_manifest()["pantheon"]
        self.assertEqual(p["zmin_sweep"], [0.01, 0.0233, 0.024, 0.03, 0.05, 0.10])
        self.assertEqual(p["template_families"], ["hard_step", "tanh_step", "gaussian_bump", "piecewise_linear"])
        self.assertEqual(p["calibration_branches"], ["official_all", "calibrator_only", "non_calibrator"])

    def test_official_likelihood_is_pinned_for_covariance_adjudication(self):
        source = load_manifest()["sources"]["pantheon_plus"]
        self.assertRegex(source["likelihood"]["git_blob_sha1"], r"^[0-9a-f]{40}$")
        self.assertIn(source["commit"], source["likelihood"]["url"])

    def test_priority_rows_have_reviewable_matrix_fields(self):
        for row in load_manifest()["priority_context"]:
            for field in ("dataset", "statistic", "redshift", "interpretation"):
                self.assertIn(field, row)


class RefereeStatisticsContractTests(unittest.TestCase):
    def test_adaptive_mock_target_escalates_only_below_one_percent(self):
        self.assertEqual(adaptive_mock_target(0.5, base=10000, tail_trigger=0.01, tail=100000), 10000)
        self.assertEqual(adaptive_mock_target(0.009, base=10000, tail_trigger=0.01, tail=100000), 100000)
        self.assertEqual(adaptive_mock_target(0.01, base=10000, tail_trigger=0.01, tail=100000), 10000)


class RefereeClosureContractTests(unittest.TestCase):
    def _pass(self):
        return {f"G{i}": {"status": "PASS", "metrics": {}} for i in range(19)}

    def test_global_null_failure_closes_to_c1(self):
        r = self._pass()
        r["G6"]["metrics"] = {"delta_chi2": 2.0}
        r["G8"] = {"status": "FAIL", "metrics": {"p_global": 0.7}}
        v = close_claim(r, load_manifest())
        self.assertEqual(v["claim_code"], "C1")

    def test_observational_control_failure_closes_to_c2(self):
        r = self._pass()
        r["G6"]["metrics"] = {"delta_chi2": 12.0}
        r["G8"] = {"status": "PASS", "metrics": {"p_global": 0.001}}
        r["G11"] = {"status": "PASS", "metrics": {"max_structured_p": 0.001}}
        r["G13"] = {"status": "FAIL", "metrics": {"final_delta_fraction": 0.1}}
        v = close_claim(r, load_manifest())
        self.assertEqual(v["claim_code"], "C2")

    def test_c3_does_not_claim_physical_cause_when_g18_is_open(self):
        r = self._pass()
        r["G6"]["metrics"] = {"delta_chi2": 12.0}
        r["G8"]["metrics"] = {"p_global": 0.001}
        r["G11"]["metrics"] = {"max_structured_p": 0.001}
        r["G17"]["metrics"] = {"consistent_replication": True}
        r["G18"] = {"status": "OPEN", "metrics": {"physical_context_complete": False}}
        v = close_claim(r, load_manifest())
        self.assertEqual(v["claim_code"], "C3")
        self.assertFalse(v["physical_cause_supported"])


if __name__ == "__main__":
    unittest.main()
