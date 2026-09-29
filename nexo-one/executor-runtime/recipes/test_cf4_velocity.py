"""Invariantes científicos; --real-result verifica um smoke já executado."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np

import cf4_velocity as recipe


class ReconstructionTests(unittest.TestCase):
    def test_recovers_constant_vector_and_shared_covariance(self):
        rng = np.random.default_rng(914)
        directions = rng.normal(size=(400, 3))
        directions /= np.linalg.norm(directions, axis=1)[:, None]
        positions = directions * rng.uniform(20, 100, (400, 1))
        bulk = np.array([170.0, -90.0, 240.0])
        sightlines = recipe.unit_vectors(np.array([20., 100., 210.]), np.array([10., -20., 60.]))
        predictions, covariance, neff = recipe.reconstruct(
            positions, directions, directions @ bulk, np.full(400, 300. ** 2),
            sightlines * 60, sightlines, 40, 30)
        np.testing.assert_allclose(predictions, sightlines @ bulk, atol=1e-10)
        self.assertTrue(np.all(neff >= 30))
        self.assertTrue(np.all(np.linalg.eigvalsh(covariance) > 0))
        self.assertGreater(abs(covariance[0, 1]), 1)

    def test_rank_deficient_sky_cannot_reconstruct_three_dimensions(self):
        directions = np.tile([1., 0., 0.], (50, 1))
        with self.assertRaises(recipe.InputUnavailable) as error:
            recipe.reconstruct(directions * 50, directions, np.ones(50), np.ones(50),
                               np.array([[50., 0., 0.]]), np.array([[1., 0., 0.]]), 40, 30)
        self.assertEqual(error.exception.decision, "RECONSTRUCTION_UNDERSAMPLED")

    def test_modified_public_artifact_is_never_accepted(self):
        with patch.object(recipe.urllib.request, "urlopen", return_value=io.BytesIO(b"changed release")):
            with self.assertRaises(recipe.InputUnavailable) as error:
                recipe.fetch("cf4_groups")
        self.assertEqual(error.exception.decision, "DATA_HASH_MISMATCH")


def check_real_result(path):
    result = json.loads(Path(path).read_text())
    assert result["verdict"] == "INCONCLUSIVE"
    assert result["decision"] == "SINGLE_DISTANCE_RECONSTRUCTION", result
    stats = result["statistics"]
    assert stats["cf4"]["total_groups"] == 38053
    assert stats["cf4"]["excluded_snia_in_depth"] > 0
    assert stats["cf4"]["used_non_snia_groups"] > 10000
    assert stats["direct_snia_distance_overlap_excluded"]
    assert not stats["calibration_independence"]
    assert stats["min_effective_groups_observed"] >= 30
    assert len(stats["windows"]) == 2
    for window in stats["windows"]:
        assert window["unique_sn"] >= 30
        assert len(window["leave_one_region_out"]) == 8
        for model in ("standard", "cf4"):
            assert 0 < window[model]["residual_rms_mag"] < 1
            assert np.isfinite(window[model]["chi2_after_monopole"])
        assert np.isfinite(window["delta_h0_at_reference_km_s_mpc"])
    assert result["semantic"]["result_meaning"]
    print("Smoke real validado: reconstrução numérica, exclusão SNIa, dois cortes, oito retiradas e limite do contrato.")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--real-result":
        check_real_result(sys.argv[2])
    else:
        unittest.main()
