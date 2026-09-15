from __future__ import annotations

import unittest

from science.aas77733r1 import settings
from science.aas77733r1.protocol import close_claim
from science.aas77733r1.stats import adaptive_mock_target


class SettingsTests(unittest.TestCase):
    def test_frozen_protocol(self):
        self.assertEqual(settings.DEFAULT_MOCKS, 10000)
        self.assertEqual(settings.MOCK_POLICY, {"base": 10000, "tail_trigger_p": 0.01, "tail": 100000})
        self.assertEqual(settings.ZMIN_SWEEP, [0.01, 0.0233, 0.024, 0.03, 0.05, 0.10])
        self.assertEqual(settings.TEMPLATE_FAMILIES, ["hard_step", "tanh_step", "gaussian_bump", "piecewise_linear"])
        self.assertEqual(len(settings.GATE_NAMES), 20)

    def test_official_likelihood_is_pinned(self):
        self.assertEqual(settings.PANTHEON_LIKELIHOOD["commit"], "c447f0fea703fcd0fff57de5000947b5ca81286b")
        self.assertEqual(settings.PANTHEON_LIKELIHOOD["git_blob_sha1"], "07d4ae5f24ae97b3416e12b17c666904b117156f")


class StatsTests(unittest.TestCase):
    def test_adaptive_mock_target(self):
        self.assertEqual(adaptive_mock_target(0.5), 10000)
        self.assertEqual(adaptive_mock_target(0.01), 10000)
        self.assertEqual(adaptive_mock_target(0.009), 100000)


class ClosureTests(unittest.TestCase):
    def _pass(self):
        return {f"G{i}": {"status": "PASS", "metrics": {}} for i in range(19)}

    def test_global_null_failure_is_c1(self):
        r = self._pass(); r["G6"]["metrics"] = {"delta_chi2": 2.0}; r["G8"] = {"status": "FAIL", "metrics": {"p_global": 0.7}}
        self.assertEqual(close_claim(r)["claim_code"], "C1")

    def test_nuisance_failure_is_c2(self):
        r = self._pass(); r["G6"]["metrics"] = {"delta_chi2": 12.0}; r["G8"]["metrics"] = {"p_global": 0.001}; r["G13"] = {"status": "FAIL", "metrics": {}}
        self.assertEqual(close_claim(r)["claim_code"], "C2")

    def test_open_physical_context_does_not_block_c3(self):
        r = self._pass(); r["G6"]["metrics"] = {"delta_chi2": 12.0}; r["G8"]["metrics"] = {"p_global": 0.001}; r["G18"] = {"status": "OPEN", "metrics": {}}
        v = close_claim(r)
        self.assertEqual(v["claim_code"], "C3")
        self.assertFalse(v["physical_cause_supported"])


if __name__ == "__main__":
    unittest.main()
