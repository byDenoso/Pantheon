#!/usr/bin/env python3
"""One-point likelihood smoke. Prints per-likelihood lnL at a fixed point and compares with data/smoke_expected.json
(values computed on the local Windows machine with the same CAMB 1.6.6 / Cobaya 3.6.2). Exit 0 only if |dlnL_total| < tol.
Usage: python code/smoke_point.py S1 [--tol 1e-3] | python code/smoke_point.py S2 (no local reference: finite-check only)"""
import argparse, json, os, sys, time
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS', '4')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import make_info

BASE = dict(H0=67.5, omch2=0.1202, ombh2=0.02236, tau=0.0544, logA=3.045, ns=0.9649, A_planck=1.0)
POINTS = {
    'LCDM': dict(BASE),
    'P1': dict(BASE, fde_zc=0.02),
    'P3': dict(BASE, fde_zc=0.02, theta_i=2.5, log10zc=3.7),
}
if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('stack')
    ap.add_argument('--tol', type=float, default=1e-3)
    ap.add_argument('--models', default='LCDM,P1,P3')
    a = ap.parse_args()
    from cobaya.model import get_model
    exp = json.loads((HERE.parent / 'data' / 'smoke_expected.json').read_text()) if a.stack == 'S1' else {}
    ok = True
    out = {}
    for model in a.models.split(','):
        m = get_model(make_info(a.stack, model))
        sampled = list(m.parameterization.sampled_params())
        pt = {k: v for k, v in POINTS[model].items() if k in sampled}
        t = time.time()
        ll = m.loglikes(pt)[0]
        res = {k: float(v) for k, v in zip(m.likelihood.keys(), ll)}
        res['TOTAL'] = float(sum(ll))
        out[model] = res
        print(model, f'({time.time() - t:.1f}s)', json.dumps(res), flush=True)
        if a.stack == 'S1':
            d = abs(res['TOTAL'] - exp[model]['TOTAL'])
            dmax = max(abs(res[k] - exp[model][k]) for k in exp[model])
            print(f'  {model}: |dTOTAL|={d:.2e} max|dcomponent|={dmax:.2e} tol={a.tol}', flush=True)
            ok &= bool(d < a.tol) and all(map(lambda v: v == v, res.values()))
        else:
            import math
            ok &= all(math.isfinite(v) for v in res.values())
    (HERE.parent / 'results').mkdir(exist_ok=True)
    (HERE.parent / 'results' / f'smoke_{a.stack}.json').write_text(json.dumps(out, indent=2))
    print('SMOKE', 'PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)
