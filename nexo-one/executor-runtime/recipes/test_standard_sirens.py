import copy
import io
import unittest
from unittest.mock import patch

import numpy as np
import standard_sirens as r


class ScientificChecks(unittest.TestCase):
    def test_gaussian_combination_recovers_precision_sum(self):
        x = np.linspace(20, 140, 4001)
        densities = [np.exp(-.5*((x-70)/s)**2) for s in (8., 12.)]
        p = r.combine(x, densities)
        mean = np.trapezoid(x*p, x)
        sd = np.sqrt(np.trapezoid((x-mean)**2*p, x))
        self.assertAlmostEqual(mean, 70., places=8)
        self.assertAlmostEqual(sd, (8**-2 + 12**-2)**-.5, places=8)
        self.assertAlmostEqual(r.interval_mass(x, p, [20, 140]), 1., places=12)

    def fixture(self):
        x = np.linspace(20, 140, 4001)
        d = {"H0_grid": x}
        for band, name in r.RUNS.items():
            d[name] = {str(i): np.exp(-.5*((x-74)/1.5)**2) for i in range(5)}
        p = {"host_choices": ["K", "bJ"], "combinations": [[str(i)] for i in range(5)],
             "intervals": {"inverse": [66, 69], "local": [71, 77]},
             "shift_reference_h0": {"local": 67.4, "inverse": 73.}}
        return p, d

    def test_frozen_gates_and_host_reversal(self):
        p, d = self.fixture()
        self.assertEqual(r.run(p, d)["verdict"], "PROMOTED")
        small = {**p, "combinations": p["combinations"][:4]}
        self.assertEqual(r.run(small, d)["decision"], "INSUFFICIENT_COMBINATIONS_OR_HOSTS")
        self.assertEqual(r.run({**p, "shift_reference_h0": {}}, d)["decision"], "SHIFT_REFERENCE_MISSING")
        x = d["H0_grid"]
        d[r.RUNS["bJ"]] = {str(i): np.exp(-.5*((x-67)/1.5)**2) for i in range(5)}
        self.assertEqual(r.run(p, d)["decision"], "SIDE_REVERSAL")
        for name in r.RUNS.values():
            d[name] = {str(i): np.ones(len(x)) for i in range(5)}
        p["intervals"] = {"inverse": [66, 69], "local": [71, 74]}
        self.assertEqual(r.run(p, d)["verdict"], "REJECTED")

    def test_missing_event_duplicate_and_hash_are_rejected(self):
        p, d = self.fixture()
        with self.assertRaises(ValueError):
            r.run({**p, "combinations": p["combinations"] + [p["combinations"][0]]}, d)
        with self.assertRaises(KeyError):
            r.run({**p, "combinations": [["absent"]]}, d)
        with patch("urllib.request.urlopen", return_value=io.BytesIO(b"changed")):
            with self.assertRaisesRegex(ValueError, "SHA256"):
                r.load_data()


if __name__ == "__main__":
    unittest.main()
