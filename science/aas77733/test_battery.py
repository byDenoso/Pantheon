from __future__ import annotations

import base64
import json
import unittest

import numpy as np

from science.aas77733.config import load_manifest
from science.aas77733.data import PantheonBundle, pantheon_primary_mask, pantheon_sensitivity_mask
from science.aas77733.gates import close_claim
from science.aas77733.run_shard import decode_contract
from science.aas77733.stats import hard_step_scan, scan_null_pvalue


class ManifestContractTests(unittest.TestCase):
    def test_gate_registry_is_exactly_g0_through_g19(self):
        manifest = load_manifest()
        ids = [gate["id"] for gate in manifest["gates"]]
        self.assertEqual(ids, [f"G{i}" for i in range(20)])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(manifest["gates"][-1]["name"], "claim_closure")

    def test_public_sources_are_immutable_and_semantics_are_explicit(self):
        manifest = load_manifest()
        pantheon = manifest["sources"]["pantheon_plus"]
        des = manifest["sources"]["des_sn5yr"]
        self.assertRegex(pantheon["commit"], r"^[0-9a-f]{40}$")
        self.assertRegex(des["commit"], r"^[0-9a-f]{40}$")
        self.assertIn(pantheon["commit"], pantheon["data"]["url"])
        self.assertIn(pantheon["commit"], pantheon["covariance"]["url"])
        self.assertIn(des["commit"], des["data"]["url"])
        self.assertIn(des["commit"], des["precision"]["url"])
        self.assertEqual(pantheon["covariance"]["dimension"], 1701)
        self.assertEqual(pantheon["covariance"]["semantics"], "covariance")
        self.assertEqual(des["precision"]["semantics"], "inverse_covariance")

    def test_historical_exploratory_value_cannot_be_primary_evidence(self):
        manifest = load_manifest()
        historical = manifest["reference_manuscript"]["historical_exploratory"]
        self.assertFalse(historical["primary_evidence"])

    def test_manifest_keeps_sensitivity_mask_independent_of_primary_low_z_cut(self):
        manifest = load_manifest()
        self.assertEqual(
            manifest["pantheon"]["sensitivity_mask"],
            "IS_CALIBRATOR == 0 and IDSURVEY != 1",
        )


class DataSelectionContractTests(unittest.TestCase):
    def test_sensitivity_mask_does_not_inherit_primary_z_cut(self):
        bundle = PantheonBundle(
            columns={
                "zHD": np.array([0.005, 0.020, 0.030, 0.040]),
                "IS_CALIBRATOR": np.array([0, 0, 1, 0]),
                "IDSURVEY": np.array([2, 1, 2, 2]),
            },
            covariance=np.eye(4),
            receipts={},
        )
        self.assertEqual(pantheon_primary_mask(bundle).tolist(), [False, True, False, True])
        self.assertEqual(pantheon_sensitivity_mask(bundle).tolist(), [True, False, False, True])


class StatisticsContractTests(unittest.TestCase):
    def test_hard_step_scan_recovers_synthetic_injection(self):
        z = np.linspace(0.1, 0.9, 80)
        residual = np.where(z > 0.5, 0.1, 0.0)
        covariance = np.eye(z.size) * 0.01**2
        result = hard_step_scan(
            z=z,
            residual=residual,
            covariance=covariance,
            pivots=np.array([0.40, 0.50, 0.60]),
        )
        self.assertAlmostEqual(result["best_z"], 0.50, places=12)
        self.assertAlmostEqual(result["amplitude"], 0.1, places=6)
        self.assertGreater(result["delta_chi2"], 100.0)

    def test_nuisance_absorbs_a_survey_step_instead_of_double_counting_it(self):
        z = np.linspace(0.1, 0.9, 40)
        survey = (z > 0.5).astype(float)
        residual = 0.2 * survey
        covariance = np.eye(z.size) * 0.02**2
        raw = hard_step_scan(z=z, residual=residual, covariance=covariance, pivots=np.array([0.5]))
        absorbed = hard_step_scan(
            z=z,
            residual=residual,
            covariance=covariance,
            pivots=np.array([0.5]),
            nuisance=np.column_stack([np.ones(z.size), survey]),
        )
        self.assertGreater(raw["delta_chi2"], 100.0)
        self.assertLess(absorbed["delta_chi2"], 1e-8)

    def test_scan_null_pvalue_uses_plus_one_correction(self):
        p = scan_null_pvalue(observed=4.0, maxima=np.array([1.0, 2.0, 3.0, 5.0]))
        self.assertAlmostEqual(p, 2.0 / 5.0)
        self.assertGreater(p, 0.0)
        self.assertLessEqual(p, 1.0)


class ClosureContractTests(unittest.TestCase):
    def _pass_results(self):
        return {f"G{i}": {"status": "PASS", "metrics": {}} for i in range(19)}

    def test_integrity_failure_blocks_claim_closure(self):
        results = self._pass_results()
        results["G2"] = {"status": "FAIL", "metrics": {}}
        verdict = close_claim(results, load_manifest())
        self.assertEqual(verdict["classification"], "BLOCKED_INTEGRITY")
        self.assertIn("G2", verdict["defeating_gates"])

    def test_robustness_failure_restricts_claim_to_residual_diagnostic(self):
        results = self._pass_results()
        results["G6"]["metrics"] = {"delta_chi2": 2.0}
        results["G8"] = {"status": "FAIL", "metrics": {"p_global": 0.7}}
        results["G12"] = {"status": "FAIL", "metrics": {"max_structured_p": 0.9}}
        verdict = close_claim(results, load_manifest())
        self.assertEqual(verdict["classification"], "RESIDUAL_DIAGNOSTIC_ONLY")
        self.assertTrue({"G8", "G12"}.issubset(set(verdict["defeating_gates"])))

    def test_physical_support_requires_real_external_context(self):
        results = self._pass_results()
        results["G6"]["metrics"] = {"delta_chi2": 12.0}
        results["G8"]["metrics"] = {"p_global": 0.001}
        results["G11"]["metrics"] = {"survives_nuisance": True}
        results["G12"]["metrics"] = {"max_structured_p": 0.001}
        results["G14"]["metrics"] = {"p16_p84_width": 0.02, "localization_fraction": 0.9}
        results["G15"]["metrics"] = {"recovery_fraction": 0.9}
        results["G17"]["metrics"] = {"consistent_replication": True}
        results["G18"] = {"status": "OPEN", "metrics": {"independent_context": False}}
        verdict = close_claim(results, load_manifest())
        self.assertEqual(verdict["classification"], "INCONCLUSIVE_OPEN_GATES")
        self.assertIn("G18", verdict["open_gates"])


class RuntimeContractTests(unittest.TestCase):
    def test_base64_contract_decoder_is_strict_and_preserves_seed(self):
        payload = {
            "battery_id": "AAS77733-R1",
            "gates": ["G8", "G12"],
            "mocks": 500,
            "seed": 77733,
            "output": "result.json",
        }
        encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
        decoded = decode_contract(encoded)
        self.assertEqual(decoded, payload)

    def test_base64_contract_rejects_unknown_gate(self):
        payload = {"battery_id": "AAS77733-R1", "gates": ["G20"], "seed": 1}
        encoded = base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
        with self.assertRaises(ValueError):
            decode_contract(encoded)


if __name__ == "__main__":
    unittest.main()
