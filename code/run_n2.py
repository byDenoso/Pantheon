#!/usr/bin/env python3
"""CLI: python code/run_n2.py --stack S1 --model P3 --seedidx 0 [--njobs 4] [--max-hours 5.66]
Exit code 0 = final result written, 3 = stopped by the time budget (checkpoint saved, re-run to continue)."""
import argparse, os, sys
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS', '1')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import n2core

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--stack', default='S1')
    ap.add_argument('--model', required=True)
    ap.add_argument('--seedidx', type=int, default=0)
    ap.add_argument('--nlive', type=int, default=0)
    ap.add_argument('--dlogz', type=float, default=0.05)
    ap.add_argument('--njobs', type=int, default=4)
    ap.add_argument('--max-hours', type=float, default=5.66)
    ap.add_argument('--chunk-iter', type=int, default=8)
    ap.add_argument('--outroot', default=str(n2core.ROOT))
    a = ap.parse_args()
    st = n2core.run(a.stack, a.model, n2core.SEEDS[(a.stack, a.model)][a.seedidx], a.nlive or n2core.NLIVE[a.model], a.dlogz,
                    a.njobs, a.max_hours, a.outroot, chunk_iter=a.chunk_iter)
    sys.exit(0 if st == 'done' else 3)
