"""N2 nested-sampling core (dynesty + Cobaya + CAMB). Portable (Linux/Windows), resumable, wall-clock aware."""
import json
import math
import os
import sys
import time
from pathlib import Path

os.environ.setdefault('OMP_NUM_THREADS', '1')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import numpy as np
from scipy.stats import norm

BAD = -1.0e10
FMIN = 1e-4  # CAMB EarlyQuintessence fails for fde_zc < ~1e-5..1e-7; below FMIN the LCDM likelihood is used (|dlnL| < ~2e-3)
SEEDS = {  # NEXO_PEER_NESTED_MATRIX_V2_20261031 seeds
    ('S1', 'LCDM'): [660365113, 1651703512],   # LCDM_A_TRGB
    ('S1', 'P3'): [2612844943, 225218404],     # A1
    ('S1', 'P1'): [1289219989, 1774698833],    # A2
    ('S2', 'LCDM'): [2464121957, 7422811],     # LCDM_B_ACT_SPT
    ('S2', 'P3'): [3691280383, 2679082245],    # B6 seeds re-used for the 3P at S2
    ('S2', 'P1'): [3691280383, 2679082245],    # B6
    ('TOY', 'LCDM'): [1, 2],
}
NLIVE = {'LCDM': 500, 'P3': 500, 'P1': 250}

_M = {}


def _models(stack, model):
    key = (stack, model)
    if key not in _M:
        from build import make_info
        from cobaya.model import get_model
        ede = get_model(make_info(stack, model)) if model != 'LCDM' else None
        lcdm = get_model(make_info(stack, 'LCDM'))
        _M[key] = (ede, lcdm)
    return _M[key]


class Problem:
    """Picklable description of the sampled space. Order = sampled parameters of the full (EDE) Cobaya model."""

    def __init__(self, stack, model):
        self.stack, self.model = stack, model
        if stack == 'TOY':
            self.names = ['x0', 'x1', 'x2']
            self.pri = [{'min': -5.0, 'max': 5.0}] * 3
        else:
            ede, lcdm = _models(stack, model)
            m = ede if ede is not None else lcdm
            self.names, self.pri = [], []
            full = m.info()['params']
            for k in m.parameterization.sampled_params():
                self.names.append(k)
                self.pri.append(dict(full[k]['prior']))
        self.ndim = len(self.names)

    def prior_transform(self, u):
        x = np.empty(self.ndim)
        for i, p in enumerate(self.pri):
            if p.get('dist') == 'norm':
                x[i] = norm.ppf(u[i], loc=p['loc'], scale=p['scale'])
            else:
                x[i] = p['min'] + u[i] * (p['max'] - p['min'])
        return x

    def loglike(self, theta):
        if self.stack == 'TOY':
            return float(-0.5 * np.sum((np.asarray(theta) / 0.5) ** 2) - 3 * math.log(0.5 * math.sqrt(2 * math.pi)))
        try:
            ede, lcdm = _models(self.stack, self.model)
            p = dict(zip(self.names, [float(t) for t in theta]))
            if ede is None or p.get('fde_zc', 1.0) < FMIN:
                m = lcdm
                q = {k: v for k, v in p.items() if k in lcdm.parameterization.sampled_params()}
            else:
                m, q = ede, p
            ll = float(np.sum(m.loglikes(q)[0]))
            # external (non-box) priors, e.g. SPT/ACT nuisance Gaussians in S2: multiplicative factor on the box prior
            if getattr(m.prior, 'external', None):
                ll += float(np.sum(m.prior.logps_external(q)))
            return ll if np.isfinite(ll) else BAD
        except Exception:
            return BAD


class LL:
    def __init__(self, prob):
        self.prob = prob

    def __call__(self, theta):
        return self.prob.loglike(theta)


class PT:
    def __init__(self, prob):
        self.prob = prob

    def __call__(self, u):
        return self.prob.prior_transform(u)


def _init_worker(stack, model):
    import logging
    if stack != 'TOY':
        _models(stack, model)
    for n in list(logging.root.manager.loggerDict):
        logging.getLogger(n).setLevel(logging.ERROR)


def run(stack, model, seed, nlive, dlogz, njobs, max_hours, outroot, chunk_iter=8, tag_extra=''):
    """Returns 'done' if the final result was written, 'timeout' if stopped by the wall-clock budget (checkpoint saved)."""
    import dynesty
    from multiprocessing import Pool
    from scipy.special import logsumexp
    outroot = Path(outroot)
    tag = f'{stack}_{model}_s{seed}{tag_extra}'
    ckpt = outroot / 'ckpt' / f'{tag}.save'
    resfile = outroot / 'results' / f'{tag}.json'
    ckpt.parent.mkdir(parents=True, exist_ok=True)
    resfile.parent.mkdir(parents=True, exist_ok=True)
    if resfile.exists():
        print('STATUS EXISTING_RESULT', flush=True)
        return 'done'
    t0 = time.monotonic()
    deadline = t0 + max_hours * 3600
    # never resume on a changed likelihood/contract: hash of the code and data that define the problem
    import hashlib
    h = hashlib.sha256()
    for f in sorted([HERE / 'build.py', HERE / 'n2like.py', HERE / 'n2core.py', HERE / 'nested_state.py'] + sorted((ROOT / 'data').glob('*.txt'))
                    + sorted((ROOT / 'data' / 'cc15').glob('CC15_*'))):
        h.update(f.name.encode() + f.read_bytes())
    chash = ckpt.with_suffix('.contract')
    if ckpt.exists() and (not chash.exists() or chash.read_text().strip() != h.hexdigest()):
        print('ABORT: checkpoint was written under a different contract hash; refusing to resume', flush=True)
        sys.exit(4)
    runtime = ckpt.with_suffix('.runtime.json')
    binding = dict(stack=stack, model=model, seed=seed, nlive=nlive, dlogz=dlogz,
                   njobs=njobs, dynesty=dynesty.__version__)
    if ckpt.exists() and (not runtime.exists() or json.loads(runtime.read_text()) != binding):
        raise RuntimeError('CHECKPOINT_RUNTIME_MISMATCH')
    runtime.write_text(json.dumps(binding, sort_keys=True))
    chash.write_text(h.hexdigest() + chr(10))
    prob = Problem(stack, model)
    ll, pt = LL(prob), PT(prob)
    print('STATUS STARTED', flush=True)
    status = 'timeout'
    with Pool(njobs, initializer=_init_worker, initargs=(stack, model)) as pool:
        if ckpt.exists():
            sampler = dynesty.NestedSampler.restore(str(ckpt), pool=pool)
            print('STATUS RESUMED', flush=True)
        else:
            sampler = dynesty.NestedSampler(ll, pt, prob.ndim, nlive=nlive, sample='rslice', rstate=np.random.default_rng(seed),
                                            pool=pool, queue_size=njobs)
        # A chunk boundary is not convergence. Keep the full sampler (including
        # live points, random generator, proposal queue and bounding state).
        from nested_state import advance
        status, final_dlogz = advance(sampler, ckpt, dlogz, chunk_iter, deadline)
        if status != 'converged':
            return 'timeout'
    res = sampler.results
    logz, logzerr = float(res.logz[-1]), float(res.logzerr[-1])
    w = np.exp(res.logwt - logsumexp(res.logwt))
    ess = float(1.0 / np.sum(w ** 2))
    summ = {}
    for i, n in enumerate(prob.names):
        mean = float(np.sum(w * res.samples[:, i]))
        sd = float(math.sqrt(np.sum(w * (res.samples[:, i] - mean) ** 2)))
        o = np.argsort(res.samples[:, i])
        cum = np.cumsum(w[o])
        summ[n] = dict(mean=mean, sd=sd, q={str(x): float(np.interp(x, cum, res.samples[o, i])) for x in (0.16, 0.5, 0.84, 0.95)})
    maxll = float(np.max(res.logl))
    out = dict(schema='NEXO_N2_NESTED_V1', stack=stack, model=model, seed=seed, nlive=nlive, dlogz_target=dlogz, params=prob.names,
               dlogz_final=final_dlogz, stop_reason='CONVERGED', logZ=logz, logZ_err=logzerr, niter=int(res.niter), ncall=int(np.sum(res.ncall)), ESS=ess, max_loglike=maxll,
               n_bad=int(np.sum(res.logl <= BAD / 2)), posterior=summ, fmin=FMIN, dynesty=dynesty.__version__,
               elapsed_s_last_chunk=time.monotonic() - t0)
    np.savez_compressed(outroot / 'results' / f'{tag}_samples.npz', samples=res.samples, logl=res.logl, logwt=res.logwt, logz=res.logz)
    resfile.write_text(json.dumps(out, indent=2) + '\n')
    print('STATUS CONVERGED', flush=True)
    return 'done'

