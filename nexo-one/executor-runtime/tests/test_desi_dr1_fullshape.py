"""Numerical invariants of the DESI adapter (no network needed)."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import io

import numpy as np
from scipy.integrate import simpson

SPEC = importlib.util.spec_from_file_location("desi_recipe", Path(__file__).parents[1] / "recipes" / "desi_dr1_fullshape.py")
recipe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recipe)


class DesiScientificContract(unittest.TestCase):
    def test_tampered_official_file_is_rejected(self):
        with patch.object(recipe.urllib.request, "urlopen", return_value=io.BytesIO(b"altered")):
            with self.assertRaises(recipe.MissingInput):
                recipe.verified_bytes("https://data.desi.lbl.gov/frozen.h5", "0" * 64)

    def test_physical_power_units_preserve_sigma8_and_split(self):
        z = 0.5
        geometry, growth, *_ = recipe.cosmologies(
            {"geometry": {"w0_fld": -0.8, "wa_fld": -0.3}, "growth": {"w0_fld": -1.0, "wa_fld": 0.0}},
            "geometry_growth", [z])
        provider = recipe.SpectrumProvider(geometry, growth, SimpleNamespace(z=np.array([z])))
        k, redshifts, power = provider.get_Pk_grid(("delta_nonu", "delta_nonu"))
        radius = 8.0 / growth["h"]  # Mpc, rather than Mpc/h
        x = k * radius
        window = 3.0 * (np.sin(x) - x * np.cos(x)) / x**3
        measured = np.sqrt(simpson(k**3 * power[0] * window**2 / (2.0 * np.pi**2), x=np.log(k)))
        expected = growth.get_fourier().pk_interpolator(of="delta_cb").sigma8_z(z)
        self.assertAlmostEqual(float(measured / expected), 1.0, places=3)
        self.assertEqual(power.shape, (1, len(k)))
        self.assertEqual(redshifts.tolist(), [z])
        # Distances must use the geometry model; the spectrum keeps the growth model.
        self.assertAlmostEqual(float(provider.get_Hubble(z)), float(100.0 * geometry["h"] * geometry.get_background().efunc(z)))
        self.assertGreater(abs(float(provider.get_Hubble(z) - 100.0 * growth["h"] * growth.get_background().efunc(z))), 0.1)
        self.assertEqual(provider.growth["w0_fld"], -1.0)

    def test_no_criterion_does_not_promote_a_finite_likelihood(self):
        self.assertEqual(recipe.decision({"null": {"profile_chi2": 0.0}}, None)[:2], ("INCONCLUSIVE", "NO_FROZEN_COMPARISON"))

    def test_too_few_blocks_is_inconclusive_even_with_large_gain(self):
        cases = {"null": {"profile_chi2": 100.0, "blocks": {"LRG_z0": {"profile_chi2": 100.0}}},
                 "rival": {"profile_chi2": 1.0, "blocks": {"LRG_z0": {"profile_chi2": 1.0}}}}
        criterion = {"promote_delta_chi2": 9.0, "reject_delta_chi2": 4.0, "min_blocks": 2}
        self.assertEqual(recipe.decision(cases, criterion)[0], "INCONCLUSIVE")


if __name__ == "__main__":
    unittest.main()
