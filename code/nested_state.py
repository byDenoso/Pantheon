"""Checkpoint lifecycle for dynesty 3.1.0; no likelihood or prior changes."""
import json
import time
from pathlib import Path
import numpy as np


def remaining(sampler):
    r = sampler.results
    if len(r.logz) == 0:
        return float('inf')
    return float(np.logaddexp(0., np.max(sampler.live_logl) + r.logvol[-1] - r.logz[-1]))


def advance(sampler, checkpoint, target, chunk_iter, deadline, clock=time.monotonic):
    checkpoint = Path(checkpoint)
    progress = checkpoint.with_suffix('.progress.json')
    if sampler.added_live:
        # A crash after final checkpoint but before JSON output must not add the
        # live set a second time or restart the run.
        state = json.loads(progress.read_text())
        if state['status'] != 'CONVERGED' or state['dlogz_final'] > target:
            raise RuntimeError('FINAL_CHECKPOINT_WITHOUT_STOP_EVIDENCE')
        return 'converged', state['dlogz_final']
    while True:
        sampler.run_nested(dlogz=target, maxiter=chunk_iter, add_live=False,
                           resume=True, print_progress=False,
                           checkpoint_file=str(checkpoint), checkpoint_every=60)
        delta = remaining(sampler)
        if delta <= target:
            # Store stop evidence before finalization; a pre-finalization crash
            # still restores the non-final sampler and repeats this safe step.
            progress.write_text(json.dumps({'status': 'CONVERGED', 'dlogz_final': delta}))
            sampler.add_final_live(print_progress=False)
            sampler.save(str(checkpoint))
            return 'converged', delta
        sampler.save(str(checkpoint))
        progress.write_text(json.dumps({'status': 'CHECKPOINTED', 'dlogz_remaining': delta}))
        if clock() >= deadline:
            return 'timeout', delta
