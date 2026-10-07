import importlib.util
import json
import math
import os
from pathlib import Path
import tempfile
import unittest

import numpy as np

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("recipe", HERE / "cf4_monopole_dipole_shell_gls_v1.py")
recipe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recipe)
PARAMS = json.loads((HERE / "smoke" / "cf4_monopole_dipole_shell_gls_v1.json").read_text())


class CF4ShellRecipeTests(unittest.TestCase):
    def synthetic(self, monopole_by_shell=None, dipole_by_shell=None, per_shell=240):
        monopole_by_shell = monopole_by_shell or {
            (20, 40): 74, (40, 60): 74, (60, 80): 74, (80, 120): 74, (120, 160): 74
        }
        dipole_by_shell = dipole_by_shell or {}
        rng = np.random.default_rng(20261007)
        distance, hi, sigma, ra, dec, fp, tf = [], [], [], [], [], [], []
        for bounds in recipe.SHELLS:
            lo, high = bounds
            u = rng.uniform(-1, 1, per_shell)
            phi = rng.uniform(0, 2 * np.pi, per_shell)
            directions = np.column_stack(
                (np.sqrt(1 - u * u) * np.cos(phi), np.sqrt(1 - u * u) * np.sin(phi), u)
            )
            rr = rng.uniform(lo + 0.01, high - 0.01, per_shell)
            dip = np.asarray(dipole_by_shell.get(bounds, [0.0, 0.0, 0.0]))
            yy = float(monopole_by_shell[bounds]) + directions @ dip + rng.normal(0, 1.5, per_shell)
            distance.extend(rr)
            hi.extend(yy)
            sigma.extend(np.full(per_shell, 1.5))
            ra.extend(np.rad2deg(np.mod(np.arctan2(directions[:, 1], directions[:, 0]), 2 * np.pi)))
            dec.extend(np.rad2deg(np.arcsin(directions[:, 2])))
            fp.extend(rng.random(per_shell) < 0.35)
            tf.extend(rng.random(per_shell) < 0.45)
        return {
            "distance": np.asarray(distance),
            "hi": np.asarray(hi),
            "sigma_hi": np.asarray(sigma),
            "ra": np.asarray(ra),
            "dec": np.asarray(dec),
            "has_fp": np.asarray(fp),
            "has_tf": np.asarray(tf),
            "pgc": np.arange(len(distance), dtype=np.int64),
        }

    def test_healpix_nside1_exact_centers_cover_twelve_ring_pixels(self):
        ras, decs = [], []
        for z, offset in ((2 / 3, 45.0), (0.0, 0.0), (-2 / 3, 45.0)):
            d = math.degrees(math.asin(z))
            for k in range(4):
                ras.append(offset + 90 * k)
                decs.append(d)
        pix = recipe.healpix_nside1_ring(np.asarray(ras), np.asarray(decs))
        self.assertEqual(sorted(pix.tolist()), list(range(12)))

    def test_gls_recovers_injected_monopole_and_dipole(self):
        groups = self.synthetic(
            monopole_by_shell={(20, 40): 74, (40, 60): 76, (60, 80): 76, (80, 120): 76, (120, 160): 74},
            dipole_by_shell={(60, 80): [3, -2, 1]},
            per_shell=1200,
        )
        mask = (groups["distance"] >= 60) & (groups["distance"] < 80)
        fit = recipe.fit_monopole_dipole(groups, mask)
        self.assertAlmostEqual(fit["monopole_km_s_mpc"], 76, delta=0.12)
        np.testing.assert_allclose(fit["dipole_components_km_s_mpc"], [3, -2, 1], atol=0.2)

    def test_promotes_only_when_joint_and_healpix_frozen_criteria_hold(self):
        groups = self.synthetic(
            monopole_by_shell={(20, 40): 74, (40, 60): 76, (60, 80): 76, (80, 120): 76, (120, 160): 74},
            per_shell=800,
        )
        out = recipe.analyze(groups, PARAMS)
        self.assertEqual(out["decision"], "PROMOTED_LOCAL_MONOPOLE")
        self.assertEqual(out["verdict"], "PROMOTED")
        self.assertGreaterEqual(out["statistics"]["healpix"]["positive_contrast_count"], 10)

    def test_classifies_anisotropic_h2_without_monopole(self):
        dips = {(40, 60): [8, 0, 0], (60, 80): [0, 8, 0], (80, 120): [0, 0, 8]}
        groups = self.synthetic(dipole_by_shell=dips, per_shell=1000)
        out = recipe.analyze(groups, PARAMS)
        self.assertEqual(out["decision"], "CLASSIFY_ANISOTROPIC_H2")
        self.assertEqual(out["verdict"], "REJECTED")
        self.assertGreaterEqual(out["statistics"]["decision_components"]["dipole_shells_sn_ge_3"], 2)

    def test_rejects_small_isotropic_shift_without_dipole(self):
        groups = self.synthetic(per_shell=1500)
        out = recipe.analyze(groups, PARAMS)
        self.assertEqual(out["decision"], "REJECTED_LOCAL_ENVIRONMENT_H0_SHIFT")
        self.assertEqual(out["verdict"], "REJECTED")

    def test_param_drift_fails_closed(self):
        groups = self.synthetic(per_shell=200)
        changed = {**PARAMS, "promotion_delta_min": 1.4}
        with self.assertRaises(recipe.InputUnavailable) as caught:
            recipe.analyze(groups, changed)
        self.assertEqual(caught.exception.decision, "FROZEN_PARAMS_MISMATCH")

    def test_strict_runner_input_binding_requires_all_three_exact_sources(self):
        rows = [{"url": item["url"], "sha256": item["sha256"]} for item in recipe.SOURCES.values()]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "inputs.json"
            path.write_text(json.dumps(rows), encoding="utf-8")
            old_req = os.environ.get("NEXO_REQUIRE_FROZEN_INPUTS")
            old_path = os.environ.get("INPUTS_PATH")
            os.environ["NEXO_REQUIRE_FROZEN_INPUTS"] = "1"
            os.environ["INPUTS_PATH"] = str(path)
            try:
                recipe._validate_frozen_inputs()
                rows.pop()
                path.write_text(json.dumps(rows), encoding="utf-8")
                with self.assertRaises(recipe.InputUnavailable) as caught:
                    recipe._validate_frozen_inputs()
                self.assertEqual(caught.exception.decision, "INPUT_BINDING_MISMATCH")
            finally:
                if old_req is None:
                    os.environ.pop("NEXO_REQUIRE_FROZEN_INPUTS", None)
                else:
                    os.environ["NEXO_REQUIRE_FROZEN_INPUTS"] = old_req
                if old_path is None:
                    os.environ.pop("INPUTS_PATH", None)
                else:
                    os.environ["INPUTS_PATH"] = old_path


if __name__ == "__main__":
    unittest.main()
