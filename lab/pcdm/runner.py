"""Fail-closed, segmentable dynesty runner. Never supplies cosmology or priors."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time

CHECKPOINT_INTERVAL_S = 600
SEGMENT_SECONDS = 280 * 60
REQUIRED_HASH_FIELDS = ("data_sha256", "likelihood_sha256", "priors_sha256")

class BlockedInput(Exception):
    pass


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def _attest_public_inputs(config, base):
    """Bind displayed provenance hashes to the bytes read by this run."""
    groups = config.get('public_input_files')
    if not isinstance(groups, dict) or set(groups) != {'data', 'likelihood', 'priors'}:
        raise BlockedInput('PUBLIC_INPUT_FILE_GROUPS_MISSING')
    for role in ('data', 'likelihood', 'priors'):
        entries = groups.get(role)
        if not isinstance(entries, list) or not entries:
            raise BlockedInput('PUBLIC_INPUT_FILES_MISSING_' + role.upper())
        canonical = []
        seen = set()
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {'path', 'sha256'}:
                raise BlockedInput('PUBLIC_INPUT_ENTRY_INVALID_' + role.upper())
            rel, expected = entry['path'], entry['sha256']
            if (not isinstance(rel, str) or not rel or
                not re.fullmatch(r'[A-Za-z0-9_./-]+', rel) or
                '..' in Path(rel).parts or Path(rel).is_absolute() or rel in seen or
                not re.fullmatch(r'[0-9a-f]{64}', str(expected))):
                raise BlockedInput('PUBLIC_INPUT_ENTRY_UNSAFE_' + role.upper())
            seen.add(rel)
            target = (base / rel).resolve()
            if not target.is_relative_to(base) or not target.is_file():
                raise BlockedInput('PUBLIC_INPUT_FILE_MISSING_' + role.upper())
            if sha256(target) != expected:
                raise BlockedInput('PUBLIC_INPUT_SHA256_MISMATCH_' + role.upper())
            canonical.append({'path': rel, 'sha256': expected})
        digest = hashlib.sha256(json.dumps(sorted(canonical, key=lambda o: o['path']),
                                           sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        if digest != config[role + '_sha256']:
            raise BlockedInput('PUBLIC_INPUT_GROUP_SHA256_MISMATCH_' + role.upper())


def freeze(config_path):
    path = Path(config_path).resolve()
    c = json.loads(path.read_text(encoding='utf-8'))
    if c.get('schema') != 1 or c.get('status') != 'READY_PUBLIC_INPUTS':
        raise BlockedInput('FROZEN_CONTRACT_NOT_READY')
    for field in REQUIRED_HASH_FIELDS:
        if not re.fullmatch(r'[0-9a-f]{64}', str(c.get(field, ''))):
            raise BlockedInput(f'MISSING_OR_INVALID_{field.upper()}')
    rel = c.get('adapter')
    if not isinstance(rel, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+\.py', rel):
        raise BlockedInput('ADAPTER_NOT_DECLARED')
    if '..' in Path(rel).parts or Path(rel).is_absolute():
        raise BlockedInput('ADAPTER_PATH_UNSAFE')
    adapter_path = (path.parent / rel).resolve()
    if not adapter_path.is_relative_to(path.parent) or not adapter_path.is_file():
        raise BlockedInput('ADAPTER_PUBLIC_FILE_MISSING')
    if sha256(adapter_path) != c.get('adapter_sha256'):
        raise BlockedInput('ADAPTER_SHA256_MISMATCH')
    _attest_public_inputs(c, path.parent)
    if not isinstance(c.get('ndim'), int) or not 1 <= c['ndim'] <= 40:
        raise BlockedInput('NDIM_INVALID')
    if not isinstance(c.get('nlive'), int) or c['nlive'] < 2 * c['ndim']:
        raise BlockedInput('NLIVE_INVALID')
    if type(c.get('seed')) is not int or type(c.get('dlogz')) not in (int, float) or c['dlogz'] <= 0:
        raise BlockedInput('SAMPLER_CONFIG_INVALID')
    if not 1 <= c.get('max_segments', 0) <= 100:
        raise BlockedInput('SEGMENT_CAP_INVALID')
    return c, path, adapter_path, sha256(path)


def load_adapter(path):
    spec = importlib.util.spec_from_file_location('pcdm_frozen_public_adapter', path)
    if spec is None or spec.loader is None:
        raise BlockedInput('ADAPTER_IMPORT_INVALID')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if not callable(getattr(module, 'loglikelihood', None)) or not callable(getattr(module, 'prior_transform', None)):
        raise BlockedInput('ADAPTER_CALLBACKS_MISSING')
    return module


def run_segment(sampler, state_dir, identity, wall_seconds, resumed=False, now=time.monotonic):
    """Only serialize sampler between completed nested iterations."""
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = state_dir / 'checkpoint.dynesty'
    started = now()
    last_saved = started
    for _ in sampler.sample(dlogz=identity['dlogz'], resume=resumed):
        elapsed = now() - started
        if elapsed >= wall_seconds or elapsed >= CHECKPOINT_INTERVAL_S and now() - last_saved >= CHECKPOINT_INTERVAL_S:
            sampler.save(str(checkpoint))
            last_saved = now()
        if elapsed >= wall_seconds:
            atomic_json(state_dir / 'status.json', {'status': 'RUNNING', 'identity': identity,
                                                     'checkpoint_sha256': sha256(checkpoint)})
            return 'RUNNING'
    for _ in sampler.add_live_points():
        pass
    sampler.save(str(checkpoint))
    results = sampler.results
    atomic_json(state_dir / 'results.json', {
        'logz': float(results.logz[-1]), 'logzerr': float(results.logzerr[-1]),
        'ncall': int(sum(results.ncall)), 'niter': int(results.niter),
        'identity': identity, 'status': 'CONVERGED',
    })
    atomic_json(state_dir / 'status.json', {'status': 'CONVERGED', 'identity': identity,
                                           'checkpoint_sha256': sha256(checkpoint)})
    return 'CONVERGED'


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('phase', choices=['validate', 'segment'])
    ap.add_argument('--config', default='lab/pcdm/frozen.json')
    ap.add_argument('--state-dir', default='.pcdm-state')
    ap.add_argument('--wall-seconds', type=int, default=SEGMENT_SECONDS)
    args = ap.parse_args(argv)
    try:
        c, cfgpath, adapterpath, cfgsha = freeze(args.config)
        if args.phase == 'validate':
            print('READY_PUBLIC_INPUTS ' + cfgsha)
            return 0
        if not 1 <= args.wall_seconds <= SEGMENT_SECONDS:
            raise BlockedInput('WALL_SECONDS_INVALID')
        from dynesty import NestedSampler
        import dynesty
        import numpy as np
        identity = {'contract_sha256': cfgsha, 'adapter_sha256': sha256(adapterpath),
                    'data_sha256': c['data_sha256'], 'likelihood_sha256': c['likelihood_sha256'],
                    'priors_sha256': c['priors_sha256'], 'dlogz': c['dlogz'],
                    'dynesty': dynesty.__version__, 'numpy': np.__version__,
                    'repository_sha': os.getenv('GITHUB_SHA', 'local')}
        sdir = Path(args.state_dir)
        status_path = sdir / 'status.json'
        resumed = status_path.exists()
        if resumed:
            old = json.loads(status_path.read_text())
            if old.get('status') != 'RUNNING' or old.get('identity') != identity:
                raise BlockedInput('CHECKPOINT_IDENTITY_MISMATCH')
            if sha256(sdir / 'checkpoint.dynesty') != old.get('checkpoint_sha256'):
                raise BlockedInput('CHECKPOINT_SHA256_MISMATCH')
        adapter = load_adapter(adapterpath)
        if resumed:
            sampler = NestedSampler.restore(str(sdir / 'checkpoint.dynesty'))
        else:
            sampler = NestedSampler(adapter.loglikelihood, adapter.prior_transform,
                                    c['ndim'], nlive=c['nlive'], bound='multi',
                                    sample='rwalk', rstate=np.random.default_rng(c['seed']))
        print('STATUS ' + run_segment(sampler, sdir, identity, args.wall_seconds, resumed=resumed))
        return 0
    except BlockedInput as exc:
        print('BLOCKED_INPUT ' + str(exc), file=sys.stderr)
        return 78


if __name__ == '__main__':
    sys.exit(main())
