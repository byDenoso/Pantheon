"""Fetch only reviewed historical artifacts into the existing Writer observation spool.

No verdict is changed here. The private Writer validates the canonical observation,
its version and ownership, then records an append-only assessment if it matches.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

REPO = 'byDenoso/Pantheon'
CONTRACT = 'EXECUTION_ASSESSMENT_APPROVALS_V1'
APPROVAL_FIELDS = {'test_id', 'battery_id', 'run_ref', 'artifact_id', 'archive_sha256', 'member_sha256',
                   'attempt_id', 'recipe_sha256', 'expected_observation_hash', 'expected_version'}
MAX_ARCHIVE_BYTES = 2_000_000
MAX_MEMBER_BYTES = 1_000_000


class EvidenceError(ValueError):
    pass


def github_bytes(endpoint):
    return subprocess.check_output(['gh', 'api', endpoint], timeout=120)


def validate_approval(approved):
    if not isinstance(approved, dict) or set(approved) != APPROVAL_FIELDS:
        raise EvidenceError('APPROVAL_SCHEMA_INVALID')
    if (type(approved['artifact_id']) is not int or approved['artifact_id'] <= 0
            or type(approved['expected_version']) is not int or approved['expected_version'] <= 0
            or not re.fullmatch(r'actions/runs/[1-9][0-9]*', str(approved['run_ref']))
            or not re.fullmatch(r'attempt-[0-9a-f]{32}', str(approved['attempt_id']))
            or not re.fullmatch(r'[a-z0-9-]{3,48}', str(approved['battery_id']))
            or not isinstance(approved['test_id'], str) or not approved['test_id']):
        raise EvidenceError('APPROVAL_IDENTITY_INVALID')
    for key in ('archive_sha256', 'member_sha256', 'recipe_sha256', 'expected_observation_hash'):
        if not re.fullmatch(r'[0-9a-f]{64}', str(approved[key])):
            raise EvidenceError('APPROVAL_HASH_INVALID')


def collect_case(approved, fetch=github_bytes):
    validate_approval(approved)
    artifact_id = approved['artifact_id']
    run_id = int(approved['run_ref'].split('/')[-1])
    endpoint = f'repos/{REPO}/actions/artifacts/{artifact_id}'
    metadata = json.loads(fetch(endpoint))
    if (metadata.get('id') != artifact_id or metadata.get('name') != 'battery-results'
            or metadata.get('expired') is not False
            or metadata.get('workflow_run', {}).get('id') != run_id):
        raise EvidenceError('ARTIFACT_IDENTITY_MISMATCH')
    archive = fetch(endpoint + '/zip')
    if not isinstance(archive, bytes) or len(archive) > MAX_ARCHIVE_BYTES:
        raise EvidenceError('ARCHIVE_SIZE_INVALID')
    archive_sha = hashlib.sha256(archive).hexdigest()
    if archive_sha != approved['archive_sha256']:
        raise EvidenceError('ARCHIVE_HASH_MISMATCH')
    with zipfile.ZipFile(io.BytesIO(archive)) as contents:
        members = contents.infolist()
        if len(members) != 1 or members[0].filename != 'battery-results.json':
            raise EvidenceError('ARTIFACT_MEMBERSHIP_MISMATCH')
        if members[0].file_size > MAX_MEMBER_BYTES:
            raise EvidenceError('MEMBER_SIZE_INVALID')
        raw = contents.read(members[0])
    member_sha = hashlib.sha256(raw).hexdigest()
    if member_sha != approved['member_sha256']:
        raise EvidenceError('MEMBER_HASH_MISMATCH')
    member_utf8 = raw.decode('utf-8')
    document = json.loads(member_utf8)
    rows = document.get('results') if isinstance(document, dict) else None
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise EvidenceError('RECEIPT_MEMBERSHIP_MISMATCH')
    row = rows[0]
    if (row.get('test_id') != approved['test_id'] or row.get('attempt_id') != approved['attempt_id']
            or row.get('recipe_sha256') != approved['recipe_sha256']):
        raise EvidenceError('RECEIPT_IDENTITY_MISMATCH')
    result = row.get('result')
    if (row.get('ok') is not True or not isinstance(result, dict)
            or result.get('verdict') != 'INCONCLUSIVE'
            or result.get('decision') != 'INPUT_OR_FIT_UNAVAILABLE'
            or not isinstance(result.get('statistics'), dict)
            or set(result['statistics']) - {'data_sources'}):
        raise EvidenceError('NOT_APPROVED_TECHNICAL_FAILURE')
    return {'nexo_operation': 'EXECUTION_OBSERVATION_ASSESSMENT',
            'assessment': {'approved': approved, 'source': {
                'artifact_id': artifact_id, 'run_ref': approved['run_ref'],
                'archive_sha256': archive_sha, 'member_sha256': member_sha,
                'member_name': 'battery-results.json', 'member_utf8': member_utf8}}}


def collect_approved(document, fetch=github_bytes):
    if (not isinstance(document, dict) or document.get('contract') != CONTRACT
            or type(document.get('enabled')) is not bool):
        raise EvidenceError('APPROVAL_LIST_INVALID')
    cases = document.get('cases')
    if not isinstance(cases, list) or len(cases) > 2:
        raise EvidenceError('APPROVAL_LIST_LIMIT')
    seen = set()
    for case in cases:
        validate_approval(case)
        if case['test_id'] in seen:
            raise EvidenceError('APPROVAL_LIST_DUPLICATE')
        seen.add(case['test_id'])
    if not document['enabled']:
        return [], []
    updates, errors = [], []
    for case in cases:
        try:
            updates.append(collect_case(case, fetch))
        except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
            # A broken historical artifact must not stop ordinary result collection.
            # Never turn a missing proof into an assessment or print payload bytes.
            errors.append({'test_id': case['test_id'], 'code': str(error) if isinstance(error, EvidenceError) else type(error).__name__})
    return updates, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--approvals', required=True)
    parser.add_argument('--updates', required=True)
    args = parser.parse_args()
    path = Path(args.updates)
    existing = json.loads(path.read_text())
    if not isinstance(existing, list):
        raise EvidenceError('OBSERVATION_SPOOL_INVALID')
    updates, errors = collect_approved(json.loads(Path(args.approvals).read_text()))
    if updates:
        path.write_text(json.dumps(existing + updates, ensure_ascii=False), encoding='utf-8')
    for error in errors:
        print('::warning::Execution assessment unavailable: ' + error['test_id'] + ' ' + error['code'])
    print('execution assessments collected', len(updates), 'unavailable', len(errors))


if __name__ == '__main__':
    main()
