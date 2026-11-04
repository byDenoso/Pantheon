"""Acceptance benchmark. Writes numbers to a private local file, stdout STATUS only."""
import argparse
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import camb_fast as cf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, help='Private local JSON destination; never a public CI artifact')
    args = parser.parse_args()
    import numpy as np
    background = dict(H0=67.5, ombh2=.022, omch2=.122, tau=.06)
    variants = [{'primordial': {'As': 2.1e-9 * (1 + .01 * (i - 10)), 'ns': .965 + .002 * (i - 10)}} for i in range(20)]
    # No persistent cache: both timings include process startup and CAMB setup.
    start = time.perf_counter()
    full = cf.evaluate(background, variants, reuse=False)
    full_seconds = time.perf_counter() - start
    start = time.perf_counter()
    fast = cf.evaluate(background, variants)
    fast_seconds = time.perf_counter() - start
    exact_zero_mismatch = False
    max_relative = 0.
    for actual, expected in zip(fast, full):
        a, b = actual[2:3001, [0, 3, 1]], expected[2:3001, [0, 3, 1]]
        nonzero = b != 0
        max_relative = max(max_relative, float(np.max(np.abs((a[nonzero] - b[nonzero]) / b[nonzero]))))
        exact_zero_mismatch |= bool(np.any(a[~nonzero] != 0))
    speedup = full_seconds / fast_seconds
    passed = speedup >= 5 and max_relative <= 1e-4 and not exact_zero_mismatch
    record = dict(variants=20, ell_min=2, ell_max=3000, spectra=['TT', 'TE', 'EE'],
                  raw_cl=True, profile='standard', threads=1, workers=1,
                  full_seconds=full_seconds, reuse_seconds=fast_seconds, speedup=speedup,
                  max_relative_error=max_relative, exact_zero_mismatch=exact_zero_mismatch, passed=passed)
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    import os
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream: json.dump(record, stream, indent=2)
    print('STATUS PASS' if passed else 'STATUS ACCEPTANCE_NOT_MET')
    return 0 if passed else 1

if __name__ == '__main__':
    raise SystemExit(main())
