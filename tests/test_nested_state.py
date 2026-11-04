import contextlib
import io
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
import numpy as np
import dynesty
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'code'))
from nested_state import advance


def likelihood(x):
    return -0.5 * float(np.dot(x, x))


def prior(u):
    return 10 * u - 5


def sampler():
    return dynesty.NestedSampler(likelihood, prior, 2, nlive=30,
                                 rstate=np.random.default_rng(17), sample='rslice')


class Continuity(unittest.TestCase):
    def test_restore_preserves_live_rng_and_complete_result(self):
        with tempfile.TemporaryDirectory() as d, warnings.catch_warnings():
            warnings.simplefilter('ignore')
            uninterrupted = sampler()
            status, delta = advance(uninterrupted, Path(d)/'full.save', .1, 8, float('inf'))
            self.assertEqual(status, 'converged')
            resumed = sampler()
            path = Path(d)/'split.save'
            for _ in range(3):
                status, _ = advance(resumed, path, .1, 8, -1)
                self.assertEqual(status, 'timeout')
                self.assertFalse(resumed.added_live)
                loaded = dynesty.NestedSampler.restore(str(path))
                np.testing.assert_array_equal(loaded.live_u, resumed.live_u)
                np.testing.assert_array_equal(loaded.live_v, resumed.live_v)
                np.testing.assert_array_equal(loaded.live_logl, resumed.live_logl)
                self.assertEqual(loaded.rstate.bit_generator.state, resumed.rstate.bit_generator.state)
                resumed = loaded
            status, resumed_delta = advance(resumed, path, .1, 8, float('inf'))
            self.assertEqual(status, 'converged')
            self.assertEqual(delta, resumed_delta)
            for field in ('samples', 'logl', 'logwt', 'logz', 'logzerr'):
                np.testing.assert_array_equal(getattr(resumed.results, field), getattr(uninterrupted.results, field))
            before = len(resumed.results.samples)
            final = dynesty.NestedSampler.restore(str(path))
            advance(final, path, .1, 8, float('inf'))
            self.assertEqual(len(final.results.samples), before)
            self.assertLessEqual(resumed_delta, .1)

    def test_pool_queue_resume_matches_uninterrupted(self):
        from multiprocessing import Pool
        with tempfile.TemporaryDirectory() as d, warnings.catch_warnings():
            warnings.simplefilter('ignore')
            with Pool(4) as pool:
                full=dynesty.NestedSampler(likelihood,prior,2,nlive=30,sample='rslice',
                    rstate=np.random.default_rng(29),pool=pool,queue_size=4)
                advance(full,Path(d)/'full.save',.1,8,float('inf'))
            path=Path(d)/'split.save'
            with Pool(4) as pool:
                split=dynesty.NestedSampler(likelihood,prior,2,nlive=30,sample='rslice',
                    rstate=np.random.default_rng(29),pool=pool,queue_size=4)
                advance(split,path,.1,8,-1)
                live=split.live_u.copy()
            with Pool(4) as pool:
                split=dynesty.NestedSampler.restore(str(path),pool=pool)
                np.testing.assert_array_equal(split.live_u,live)
                advance(split,path,.1,8,float('inf'))
            for field in ('samples','logl','logwt','logz','logzerr'):
                np.testing.assert_array_equal(getattr(full.results,field),getattr(split.results,field))

    def test_missing_final_stop_evidence_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            s = sampler()
            s.added_live = True
            with self.assertRaises(FileNotFoundError):
                advance(s, Path(d)/'missing.save', .1, 8, -1)

if __name__ == '__main__':
    unittest.main()
