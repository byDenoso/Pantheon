"""Synthetic 1D model; tests plumbing, NOT PCDM science."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from lab.pcdm.runner import run_segment


@unittest.skipUnless(importlib.util.find_spec('dynesty'), 'dynesty unavailable offline')
class DynestyResumeSmoke(unittest.TestCase):
    def test_real_dynesty_checkpoint_restore(self):
        import dynesty
        import numpy as np

        def ptform(u):
            return 4 * u - 2

        def logl(x):
            return -0.5 * (x[0] / 0.4) ** 2

        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            sampler = dynesty.NestedSampler(logl, ptform, ndim=1, nlive=50,
                                             rstate=np.random.default_rng(13))
            clock = iter([0, 2, 2])
            state = run_segment(sampler, path, {'dlogz': 0.5}, 1,
                                now=lambda: next(clock))
            self.assertEqual(state, 'RUNNING')
            restored = dynesty.NestedSampler.restore(str(path / 'checkpoint.dynesty'))
            state = run_segment(restored, path, {'dlogz': 0.5}, 16800, resumed=True)
            self.assertEqual(state, 'CONVERGED')
            self.assertTrue(np.isfinite(json.loads((path / 'results.json').read_text())['logz']))


if __name__ == '__main__':
    unittest.main()
