"""Scalar CAMB batches: transfer reuse in RAM, safe spectrum cache on disk.

No scientific values are printed. See docs/camb_fast/README.md for scope and acceptance.
"""
from __future__ import annotations
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
from concurrent.futures import ProcessPoolExecutor

PROFILES = {
    'fast': dict(lmax=512, lens_potential_accuracy=0, AccuracyBoost=1.0),
    'standard': dict(lmax=3000, lens_potential_accuracy=0, AccuracyBoost=1.0),
    'high': dict(lmax=3000, lens_potential_accuracy=1, AccuracyBoost=2.0),
}
PRIMORDIAL = {'As', 'ns', 'pivot_scalar', 'k', 'pk'}
SCHEMA = 1


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    allow_nan=False).encode()).hexdigest()


def cpu_budget(workers, threads):
    available = len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else (os.cpu_count() or 1)
    if workers < 1 or threads < 1 or workers * threads > available:
        raise ValueError('workers * threads exceeds CPU affinity or is nonpositive')


def _initialize(threads):
    # Spawned worker imports CAMB/numpy only AFTER these are set.
    for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
        os.environ[key] = str(threads)


def _power(spec):
    import numpy as np
    from camb.initialpower import SplinedInitialPower
    if set(spec) - PRIMORDIAL:
        raise ValueError('Unknown primordial parameter')
    if ('k' in spec) != ('pk' in spec):
        raise ValueError('k and pk must be supplied together')
    if 'k' in spec:
        if set(spec) != {'k', 'pk'}:
            raise ValueError('Tabulated spectrum cannot also specify power-law parameters')
        k, pk = np.asarray(spec['k'], dtype=float), np.asarray(spec['pk'], dtype=float)
    else:
        k = np.geomspace(1e-7, 100, 8192)
        amplitude, tilt, pivot = spec.get('As', 2.1e-9), spec.get('ns', .965), spec.get('pivot_scalar', .05)
        if amplitude <= 0 or pivot <= 0:
            raise ValueError('As and pivot must be positive')
        pk = amplitude * (k / pivot) ** (tilt - 1)
    if k.ndim != 1 or pk.shape != k.shape or len(k) < 4 or not np.all(np.isfinite(k)) or not np.all(np.isfinite(pk)) or np.any(np.diff(k) <= 0) or np.any(k <= 0) or np.any(pk < 0):
        raise ValueError('Invalid primordial spectrum')
    if k[0] > 1e-7 or k[-1] < 100:
        raise ValueError('Spectrum must cover 1e-7 through 100 Mpc^-1; no implicit extrapolation')
    power = SplinedInitialPower()
    power.set_scalar_table(k, pk)
    return power


def _params(background, profile, spec):
    import camb
    if set(background) & PRIMORDIAL:
        raise ValueError('Put primordial parameters in primordial, not background')
    pars = camb.set_params(**background)
    pars.set_for_lmax(profile['lmax'], lens_potential_accuracy=profile['lens_potential_accuracy'])
    pars.set_accuracy(AccuracyBoost=profile['AccuracyBoost'])
    if pars.WantTensors:
        raise ValueError('Tensor spectra are not supported by this scalar recipe')
    pars.InitPower = _power(spec)
    return pars


def _group(job):
    background, profile, variants, cache_dir, reuse = job
    import camb
    import numpy as np
    # Version plus binary identity avoids stale entries from locally patched builds.
    from camb import baseconfig
    library = Path(baseconfig.camblib._name)
    binary_hash = hashlib.sha256(library.read_bytes()).hexdigest()
    key = digest(dict(schema=SCHEMA, background=background, profile=profile,
                      camb=camb.__version__, binary=binary_hash))
    folder = Path(cache_dir) / key if cache_dir else None
    if folder:
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    transfer = None
    output = []
    for index, spec in variants:
        variant_key = digest(spec)
        path = folder / (variant_key + '.npz') if folder else None
        if path and path.exists():
            try:
                with np.load(path, allow_pickle=False) as saved:
                    cl = saved['cl']
                    if str(saved['key']) != key or str(saved['variant']) != variant_key or cl.shape != (profile['lmax'] + 1, 4) or not np.all(np.isfinite(cl)):
                        raise ValueError('Invalid cache record')
                output.append((index, cl, 'disk'))
                continue
            except (OSError, ValueError, KeyError):
                # Corrupt cache is recomputed, never used as scientific evidence.
                pass
        pars = _params(background, profile, spec)
        if reuse:
            if transfer is None:
                nonlinear = pars.NonLinear in (camb.model.NonLinear_lens, camb.model.NonLinear_both)
                transfer = camb.get_transfer_functions(pars, only_time_sources=nonlinear)
            transfer.power_spectra_from_transfer(pars.InitPower)
            result = transfer
        else:
            result = camb.get_results(pars)
        cl = result.get_total_cls(lmax=profile['lmax'], CMB_unit='muK', raw_cl=True)
        if not np.all(np.isfinite(cl)):
            raise ValueError('Nonfinite CAMB output')
        if path:
            fd, temporary = tempfile.mkstemp(dir=folder, suffix='.npz')
            os.close(fd)
            try:
                np.savez(temporary, cl=cl, key=key, variant=variant_key)
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        output.append((index, cl, 'transfer' if reuse else 'full'))
    return output


def evaluate(background, variations, *, profile='standard', workers=1, threads=1,
             cache_dir=None, reuse=True):
    """Return ordered C_ell arrays (TT, EE, BB, TE), raw muK^2.

    Each variation is {'primordial': {...}, 'background': optional overrides}.
    All non-primordial parameters are in the grouping key. A changed background
    always creates a new transfer calculation; unknown parameters fail in CAMB.
    Workers own CAMB objects; no Fortran objects/pickle files cross processes.
    """
    cpu_budget(workers, threads)
    settings = dict(PROFILES[profile])
    groups = {}
    for index, variant in enumerate(variations):
        if set(variant) - {'primordial', 'background'}:
            raise ValueError('Unknown variation field')
        cosmology = dict(background, **variant.get('background', {}))
        signature = digest(cosmology)
        groups.setdefault(signature, [cosmology, []])[1].append((index, variant.get('primordial', {})))
    jobs = [(bg, settings, specs, str(cache_dir) if cache_dir else None, reuse)
            for bg, specs in groups.values()]
    # Each background group is atomic to preserve one transfer calculation/group.
    # A single primordial-only group intentionally uses one worker.
    if not jobs:
        return []
    with ProcessPoolExecutor(max_workers=min(workers, len(jobs)),
                             mp_context=multiprocessing.get_context('spawn'),
                             initializer=_initialize, initargs=(threads,)) as pool:
        records = [record for group in pool.map(_group, jobs) for record in group]
    return [cl for _, cl, _ in sorted(records, key=lambda record: record[0])]
