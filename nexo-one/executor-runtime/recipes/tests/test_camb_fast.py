import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import camb_fast as cf

BACKGROUND = dict(H0=67.5, ombh2=.022, omch2=.122, tau=.06)

class Contracts(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(cf.digest({'a': 1, 'b': 2}), cf.digest({'b': 2, 'a': 1}))
        self.assertNotEqual(cf.digest({'H0': 67}), cf.digest({'H0': 68}))
        with self.assertRaises(ValueError):
            cf.digest({'a': float('nan')})
    def test_budget(self):
        with self.assertRaises(ValueError): cf.cpu_budget(0, 1)
        with self.assertRaises(ValueError): cf.cpu_budget(100000, 1)
    def test_primordial_guard(self):
        with self.assertRaises(ValueError): cf._power({'H0': 70})
        with self.assertRaises(ValueError): cf._power({'k': [1, 2]})
    def test_feature_and_invalid_spectra(self):
        import numpy as np
        k = np.geomspace(1e-7, 100, 200)
        pk = 2.1e-9 * (k/.05)**(-.035) * (1 + .01*np.exp(-np.log(k/.01)**2))
        power = cf._power({'k': k.tolist(), 'pk': pk.tolist()})
        self.assertIsNotNone(power)
        with self.assertRaises(ValueError): cf._power({'k': k[::-1].tolist(), 'pk': pk.tolist()})
        with self.assertRaises(ValueError): cf._power({'As': -1})
        for key in ('As', 'nrun', 'r', 'nt', 'initial_power_model', 'AccuracyBoost', 'lAccuracyBoost', 'lSampleBoost', 'DoLateRadTruncation', 'max_eta_k', 'NonLinear', 'Accuracy.AccuracyBoost', 'InitPower.ns'):
            with self.assertRaises(ValueError): cf._params({key: 0}, cf.PROFILES['fast'], {})

    def test_nonlinear_index_contract(self):
        pars = cf._params(BACKGROUND, cf.PROFILES['high'], {'ns': .97})
        self.assertAlmostEqual(pars.InitPower.effective_ns_for_nonlinear, .97)
        with self.assertRaises(ValueError):
            cf._params(BACKGROUND, cf.PROFILES['high'], {'k': [1e-7, .01, 1, 100], 'pk': [2e-9]*4})

    def test_smoke_and_cache(self):
        import numpy as np
        variations = [{'primordial': {'As': 2.1e-9, 'ns': .965}},
                      {'primordial': {'As': 2.2e-9, 'ns': .97}}]
        with tempfile.TemporaryDirectory() as cache:
            quick = cf.evaluate(BACKGROUND, variations, profile='fast', cache_dir=cache)
            full = cf.evaluate(BACKGROUND, variations, profile='fast', reuse=False)
            for actual, reference in zip(quick, full):
                np.testing.assert_allclose(actual, reference, rtol=1e-4, atol=1e-12)
            again = cf.evaluate(BACKGROUND, variations, profile='fast', cache_dir=cache)
            np.testing.assert_array_equal(quick, again)
            self.assertEqual(len(list(Path(cache).glob('*/*.npz'))), 2)
            damaged = next(Path(cache).glob('*/*.npz'))
            damaged.write_bytes(b'broken')
            repaired = cf.evaluate(BACKGROUND, variations, profile='fast', cache_dir=cache)
            np.testing.assert_array_equal(quick, repaired)
            altered = cf.evaluate(BACKGROUND, [{'background': {'H0': 68}, 'primordial': {'As': 2.1e-9}}], profile='fast', cache_dir=cache)
            self.assertEqual(len(list(Path(cache).glob('*'))), 2)
            self.assertFalse(np.array_equal(quick[0], altered[0]))

if __name__ == '__main__':
    unittest.main()
