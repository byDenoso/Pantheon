"""Select only CI-proven current TCC main; an older green run is not a fallback."""
import json
import re
import subprocess
import sys

REPO = 'byDenoso/TCC'
WORKFLOW = 'nexo-runtime-reconciler-ci.yml'


def github(endpoint):
    return json.loads(subprocess.check_output(['gh', 'api', endpoint], text=True))


def current_main(api):
    value = api(f'repos/{REPO}/git/ref/heads/main')
    sha = value.get('object', {}).get('sha', '')
    if value.get('ref') != 'refs/heads/main' or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('invalid current main ref')
    return sha


def select_tested_main(api=github):
    head = current_main(api)
    # Filter by SHA on the server AND validate each result locally. API ordering,
    # stale listings and reruns must never turn an older green commit into main.
    response = api(f'repos/{REPO}/actions/workflows/{WORKFLOW}/runs'
                   f'?branch=main&event=push&head_sha={head}&status=success&per_page=100')
    valid = any(run.get('head_sha') == head and run.get('head_branch') == 'main'
                and run.get('event') == 'push' and run.get('status') == 'completed'
                and run.get('conclusion') == 'success'
                and run.get('path') == f'.github/workflows/{WORKFLOW}'
                for run in response.get('workflow_runs', []))
    if not valid or current_main(api) != head:
        return None
    return head


def main():
    try:
        selected = select_tested_main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.CalledProcessError) as error:
        print(f'Current TCC main could not be verified: {error}', file=sys.stderr)
        return
    if selected:
        print(selected)
    else:
        print('Current TCC main has no matching successful push CI, or moved during verification; retain active bundle.', file=sys.stderr)


if __name__ == '__main__':
    main()
