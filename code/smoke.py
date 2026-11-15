#!/usr/bin/env python3
"""One-point likelihood smoke on the runner: per-likelihood lnL at a fixed point for LCDM/P1/P3, compared with
data/smoke_expected.json (computed on the local Windows machine with the same CAMB 1.6.6 / Cobaya 3.6.2).
Exit 0 only if |dlnL_total| < tol for every model."""
import argparse, json, math, os, sys, time
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS', '4')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build import make_info, MODELS

BASE = dict(H0=67.5, omch2=0.1202, ombh2=0.02236, tau=0.0544, logA=3.045, ns=0.9649, A_planck=1.0)
POINTS = {'LCDM': dict(BASE), 'P1': dict(BASE, fde_zc=0.02), 'P3': dict(BASE, fde_zc=0.02, theta_i=2.5, log10zc=3.7)}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--tol', type=float, default=1e-3)
    a = ap.parse_args()
    from cobaya.model import get_model
    exp = json.loads((HERE.parent / 'data' / 'smoke_expected.json').read_text())
    ok, out = True, {}
    for model in MODELS:
        m = get_model(make_info(model))
        pt = {k: v for k, v in POINTS[model].items() if k in m.parameterization.sampled_params()}
        t = time.time()
        ll = m.loglikes(pt)[0]
        res = {k: float(v) for k, v in zip(m.likelihood.keys(), ll)}
        res['TOTAL'] = float(sum(ll))
        res['seconds'] = round(time.time() - t, 2)
        out[model] = res
        d = abs(res['TOTAL'] - exp[model]['TOTAL'])
        print(model, json.dumps(res), f'|dTOTAL|={d:.2e}', flush=True)
        ok &= d < a.tol and all(math.isfinite(v) for v in res.values())
    (HERE.parent / 'results').mkdir(exist_ok=True)
    (HERE.parent / 'results' / 'smoke.json').write_text(json.dumps(out, indent=1))
    print('SMOKE', 'PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)
