#!/usr/bin/env python3
"""Progress line and posterior summary for one model.
python code/summary.py MODEL           -> one-line progress (last R-1, R-1_cl, accepted samples)
python code/summary.py MODEL --final   -> results/MODEL.json: medians and 16/84 percentiles (burn-in 30 %), min chi2 in
                                          the chains, the minimizer chi2 if present, per-likelihood chi2 at the minimum."""
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
model = sys.argv[1]
base = ROOT / 'chains' / model / model


def progress():
    p = Path(str(base) + '.progress')
    if not p.exists():
        return 'no progress file yet'
    rows = [l.split() for l in p.read_text().splitlines() if l.strip() and not l.startswith('#')]
    if not rows:
        return 'progress file empty'
    N, _, acc, R, Rcl = rows[-1][:5]
    nchains = len(list(base.parent.glob(model + '.[0-9]*.txt')))
    return f'{model}: N={N} acc={float(acc):.3f} R-1={float(R):.4f} R-1_cl={float(Rcl):.3f} chains={nchains} checks={len(rows)}'


def final():
    from getdist import loadMCSamples
    s = loadMCSamples(str(base), settings={'ignore_rows': 0.3})
    out = {'model': model, 'progress': progress(), 'n_samples_weighted': float(s.norm), 'params': {}}
    names = ['H0', 'ns', 'omegam', 'sigma8', 'S8', 'ombh2', 'omch2', 'tau', 'logA', 'A_planck', 'fde_zc', 'theta_i',
             'log10zc']
    for n in names:
        if s.paramNames.parWithName(n) is None:
            continue
        med = s.confidence(n, 0.5)
        lo = s.confidence(n, 0.16)
        hi = s.confidence(n, 0.16, upper=True)
        out['params'][n] = {'median': float(med), 'p16': float(lo), 'p84': float(hi), 'mean': float(s.mean(n)),
                            'std': float(s.std(n))}
        if n == 'fde_zc':
            out['params'][n]['p95_upper'] = float(s.confidence(n, 0.05, upper=True))
    chi2 = [p.name for p in s.paramNames.names if p.name.startswith('chi2')]
    imin = int(np.argmin(s.loglikes))
    out['chain_min'] = {c: float(s.samples[imin, s.index[c]]) for c in chi2}
    m = Path(str(base) + '.minimum')
    if m.exists():
        txt = m.read_text().splitlines()
        hdr = txt[0].lstrip('#').split()
        val = txt[1].split()
        out['minimum'] = {h: float(v) for h, v in zip(hdr, val) if h.startswith(('chi2', 'minuslog', 'fde', 'theta',
                                                                                  'log10zc', 'H0'))}
    (ROOT / 'results').mkdir(exist_ok=True)
    (ROOT / 'results' / f'{model}.json').write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    final() if '--final' in sys.argv else print(progress())
