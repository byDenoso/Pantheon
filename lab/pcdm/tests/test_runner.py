import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from lab.pcdm.runner import BlockedInput, freeze, run_segment, sha256


class FakeSampler:
    def __init__(self, ticks, done=False):
        self.ticks = ticks
        self.done = done
        self.saved = 0
        self.results = Mock(logz=[-4.2], logzerr=[0.2], ncall=[5], niter=2)

    def sample(self, **kwargs):
        for x in self.ticks:
            yield x

    def save(self, path):
        self.saved += 1
        Path(path).write_bytes(b'valid fake checkpoint')

    def add_live_points(self):
        return iter([1])


class RunnerTests(unittest.TestCase):
    def test_missing_physics_fail_closed(self):
        with self.assertRaisesRegex(BlockedInput, 'FROZEN_CONTRACT_NOT_READY'):
            freeze('lab/pcdm/frozen.json')

    def test_deadline_checkpoint_without_finishing_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            sampler = FakeSampler([0, 1, 2])
            times = iter([0, 3, 7, 7])
            verdict = run_segment(sampler, d, {'dlogz': 0.1}, 5, now=lambda: next(times))
            self.assertEqual(verdict, 'RUNNING')
            self.assertEqual(sampler.saved, 1)
            state = json.loads((Path(d) / 'status.json').read_text())
            self.assertEqual(state['checkpoint_sha256'], sha256(Path(d) / 'checkpoint.dynesty'))
            self.assertFalse((Path(d) / 'results.json').exists())

    def test_complete_marks_evidence_only_after_live_points(self):
        with tempfile.TemporaryDirectory() as d:
            sampler = FakeSampler([0, 1])
            times = iter([0, 1, 1, 2, 2])
            verdict = run_segment(sampler, d, {'dlogz': 0.1}, 100, now=lambda: next(times))
            self.assertEqual(verdict, 'CONVERGED')
            self.assertEqual(json.loads((Path(d) / 'results.json').read_text())['logz'], -4.2)


if __name__ == '__main__':
    unittest.main()
