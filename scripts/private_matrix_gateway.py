"""Private matrix gateway. No scientific adapter or data is embedded here."""
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import secrets
import subprocess
import sys


class GateError(Exception):
    pass


def require(value):
    if not value:
        raise GateError('gate failed')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_ref(ref):
    require(isinstance(ref, dict))
    require(re.fullmatch(r'[A-Za-z0-9_-]{10,200}', ref.get('id', '')))
    require(re.fullmatch(r'[0-9a-f]{64}', ref.get('sha256', '')))


def fetch(session, ref):
    valid_ref(ref)
    r = session.get('https://www.googleapis.com/drive/v3/files/' + ref['id'],
                    params={'alt': 'media'}, timeout=120)
    r.raise_for_status()
    require(len(r.content) <= 16 * 1024 * 1024)
    require(digest(r.content) == ref['sha256'])
    return r.content


def select(matrix, campaign, model, replica):
    require(campaign in ('B5', 'B6'))
    require(matrix.get('schema') == 'nexo.peer.nested.request_matrix.v2')
    rows = [x for x in matrix['campaigns'] if x['id'] == campaign]
    require(len(rows) == 1)
    row = rows[0]
    require(not row.get('alias_of'))
    require(row['status'] == 'READY_FOR_RUNTIME_SMOKE')
    require(model in ('peer', 'lcdm'))
    require(replica in (1, 2))
    if model == 'peer':
        seeds = row['seeds_peer']
    else:
        baseline = matrix['lcdm_baselines'][row['baseline_id']]
        require(baseline['status'] == 'READY_FOR_RUNTIME_SMOKE')
        seeds = baseline['seeds']
    require(len(seeds) == 2 and len(set(seeds)) == 2)
    require(all(type(x) is int and 0 <= x < 2**32 for x in seeds))
    return row, seeds[replica - 1]


def validate_binding(binding, matrix_sha, campaign, model):
    require(binding.get('schema') == 'nexo.private.matrix.binding.v1')
    require(binding.get('matrix_sha256') == matrix_sha)
    require(binding.get('campaign') == campaign and binding.get('model') == model)
    require(binding.get('reviewed') is True)
    require(binding.get('registry_execution_authorized') is True)
    # A complete lock is required; this gateway never resolves or installs packages.
    lock = binding.get('runtime_lock', {})
    for name, ver in {'python': '3.12.14', 'cobaya': '3.6.2',
                      'camb': '1.6.6', 'dynesty': '2.1.5',
                      'candl-like': '2.0.3'}.items():
        require(lock.get(name) == ver)
    require(binding.get('transitive_lock_complete') is True)
    require(binding.get('data_manifest_sha256') and binding.get('nuisance_contract_sha256'))
    for key in ('data_manifest_sha256', 'nuisance_contract_sha256', 'lock_sha256'):
        require(re.fullmatch(r'[0-9a-f]{64}', binding.get(key, '')))
    installed = {re.sub(r'[-_.]+', '-', d.metadata['Name']).lower(): d.version
                 for d in importlib.metadata.distributions()}
    expected = {re.sub(r'[-_.]+', '-', n).lower(): v for n, v in lock.items() if n != 'python'}
    require(installed == expected)
    for name, ver in lock.items():
        require(isinstance(ver, str) and len(ver) < 80)
        actual = platform.python_version() if name == 'python' else importlib.metadata.version(name)
        require(actual == ver)


def validate_receipt(receipt, binding, nonce, seed, matrix_sha, runner_sha):
    require(receipt.get('schema') == 'nexo.private.joint_point.receipt.v1')
    for key, expected in {'nonce': nonce, 'seed': seed, 'matrix_sha256': matrix_sha,
                          'runner_sha256': runner_sha, 'campaign': binding['campaign'],
                          'model': binding['model'], 'lock_sha256': binding['lock_sha256'],
                          'data_manifest_sha256': binding['data_manifest_sha256'],
                          'nuisance_contract_sha256': binding['nuisance_contract_sha256']}.items():
        require(receipt.get(key) == expected)
    for key in ('real_data', 'joint_point_evaluated', 'normalized_likelihood',
                'separate_nuisance_namespaces', 'priors_included_once',
                'overlap_contract_verified', 'checkpoint_destination_write_verified',
                'payload_hashes_verified'):
        require(receipt.get(key) is True)
    value = receipt.get('loglike')
    require(type(value) in (float, int) and math.isfinite(value))
    require(type(receipt.get('likelihood_calls')) is int and receipt['likelihood_calls'] >= 1)
    require(receipt.get('sampling_started') is False)


def main():
    os.umask(0o077)
    # Session uses only the existing credential and existing scope, no new grants.
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']),
        scopes=['https://www.googleapis.com/auth/drive'])
    session = AuthorizedSession(creds)
    manifest_ref = {'id': os.environ['MANIFEST_ID'], 'sha256': os.environ['MANIFEST_SHA256']}
    manifest = json.loads(fetch(session, manifest_ref))
    require(manifest.get('schema') == 'nexo.private.matrix.execution.v1')
    # Inputs disclose no cosmological values or resource contents in public logs.
    campaign, model = os.environ['CAMPAIGN'], os.environ['MODEL']
    replica, mode = int(os.environ['REPLICA']), os.environ['MODE']
    require(mode in ('preflight', 'segment'))
    matrix_bytes = fetch(session, manifest['matrix'])
    matrix_sha = digest(matrix_bytes)
    matrix = json.loads(matrix_bytes)
    _, seed = select(matrix, campaign, model, replica)
    key = f'{campaign}:{model}'
    binding_ref = manifest['bindings'][key]
    binding = json.loads(fetch(session, binding_ref))
    lock_bytes = fetch(session, binding['lock_resource'])
    require(digest(lock_bytes) == binding['lock_sha256'])
    require(json.loads(lock_bytes) == binding['runtime_lock'])
    validate_binding(binding, matrix_sha, campaign, model)
    runner_ref = binding['runner']
    runner_bytes = fetch(session, runner_ref)
    work = Path(os.environ['RUNNER_TEMP']) / 'private-matrix'
    work.mkdir(mode=0o700, exist_ok=False)
    runner = work / 'adapter.py'
    runner.write_bytes(runner_bytes)
    nonce = secrets.token_hex(32)
    request = {'matrix': matrix, 'binding': binding, 'seed': seed,
               'replica': replica, 'nonce': nonce, 'matrix_sha256': matrix_sha,
               'runner_sha256': runner_ref['sha256'], 'mode': 'preflight'}
    reqfile, receiptfile = work / 'request.json', work / 'receipt.json'
    reqfile.write_text(json.dumps(request))
    # Private adapter must be independently reviewed and pinned before binding.
    # No stdout, stderr, artifacts, or private paths are printed by this gateway.
    with (work / 'private.log').open('wb') as log:
        subprocess.run([sys.executable, str(runner), '--preflight', str(reqfile),
                        '--receipt', str(receiptfile)], stdout=log, stderr=log,
                       check=True, timeout=900)
        receipt = json.loads(receiptfile.read_text())
        validate_receipt(receipt, binding, nonce, seed, matrix_sha, runner_ref['sha256'])
        if mode == 'segment':
            require(binding.get('segment_enabled') is True)
            # Activation requires a reviewed adapter with destination locking and
            # private checkpoint readback. These are not implemented in this PR.
            raise GateError('segment adapter qualification pending')
    print('STATUS PREFLIGHT_OK' if mode == 'preflight' else 'STATUS SEGMENT_RETURNED')


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('STATUS GATE_BLOCKED')
        sys.exit(1)
