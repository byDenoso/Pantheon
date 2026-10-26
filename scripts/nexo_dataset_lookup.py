#!/usr/bin/env python3
"""Resolve existing NEXO dataset IDs without cloning or scanning the whole Drive.

The v2 JSON is a *derived location view*, not a scientific validation source.
No cache, metadata or scientific state is written by this tool.
"""
import argparse
import json
from pathlib import Path

EXPECTED_SCHEMA = 'nexo.dataset-projection.v1.1'


class LocatorError(ValueError):
    pass


def load_json(path):
    with Path(path).open('r', encoding='utf-8') as stream:
        return json.load(stream)


class DatasetLocator:
    def __init__(self, projection, canonical=None):
        if not isinstance(projection, dict) or projection.get('schema') != EXPECTED_SCHEMA:
            raise LocatorError('UNSUPPORTED_LOCATOR_SCHEMA')
        if projection.get('kind') != 'DERIVED_LOCATION_VIEW_NON_CANONICAL':
            raise LocatorError('LOCATOR_AUTHORITY_MISMATCH')
        records = projection.get('entries')
        if not isinstance(records, list) or any(not isinstance(r, dict) for r in records):
            raise LocatorError('LOCATOR_ENTRIES_INVALID')
        self.source_version = projection.get('index_source_version', '')
        self.by_id, self.by_name = {}, {}
        for record in records:
            file_id = record.get('drive_file_id', '')
            if not isinstance(file_id, str) or not file_id:
                continue
            if file_id in self.by_id:
                raise LocatorError('LOCATOR_DUPLICATE_FILE_ID')
            self.by_id[file_id] = record
            name = record.get('name', '')
            if isinstance(name, str) and name:
                self.by_name.setdefault(name.casefold(), []).append(record)
        if canonical is not None:
            if not isinstance(canonical, dict) or not isinstance(canonical.get('resources'), list):
                raise LocatorError('CANONICAL_INDEX_INVALID')
            self.canonical = canonical
            self.stale = canonical.get('index_version') != self.source_version
        else:
            self.canonical, self.stale = None, False

    @staticmethod
    def _matches(record, query):
        for key in ('release', 'family'):
            requested = query.get(key)
            if requested and str(record.get(key, '')).casefold() != str(requested).casefold():
                return False
        member = query.get('member')
        if member:
            members = record.get('member_paths') or ''
            if isinstance(members, list):
                members = ' '.join(str(x) for x in members)
            if str(member).casefold() not in str(members).casefold():
                return False
        return True

    def _canonical_candidates(self, query):
        if self.canonical is None:
            return []
        candidate_id = query.get('drive_file_id') or query.get('id')
        name = query.get('name')
        output = []
        for record in self.canonical['resources']:
            if not isinstance(record, dict):
                continue
            if candidate_id:
                if record.get('drive_file_id') != candidate_id:
                    continue
            elif str(record.get('name', '')).casefold() != str(name).casefold():
                continue
            if self._matches(record, query):
                output.append(record)
        return output

    def resolve(self, query):
        if not isinstance(query, dict):
            raise LocatorError('QUERY_INVALID')
        candidate_id = query.get('drive_file_id') or query.get('id')
        name = query.get('name')
        if bool(candidate_id) == bool(name):
            raise LocatorError('REQUIRE_EXACT_ID_OR_NAME')
        if self.stale:
            candidates = self._canonical_candidates(query)
            origin = 'CANONICAL_INDEX_FALLBACK'
        else:
            candidates = ([self.by_id[candidate_id]] if candidate_id in self.by_id else []) if candidate_id else self.by_name.get(str(name).casefold(), [])
            candidates = [r for r in candidates if self._matches(r, query)]
            origin = 'DERIVED_LOCATOR'
            if not candidates and self.canonical is not None:
                candidates = self._canonical_candidates(query)
                origin = 'CANONICAL_INDEX_FALLBACK'
        if not candidates:
            return {'status': 'NOT_FOUND_IN_AVAILABLE_INDEX',
                    'scope': 'CANONICAL_INDEX' if self.canonical is not None else 'PROJECTION_ONLY'}
        ids = {r.get('drive_file_id') for r in candidates}
        if len(ids) != 1:
            return {'status': 'AMBIGUOUS', 'matches': len(ids),
                    'hint': 'SPECIFY_DRIVE_FILE_ID_OR_RELEASE'}
        record = candidates[0]
        return {'status': 'LOCATED_NOT_VALIDATED', 'source': origin,
                'drive_file_id': record.get('drive_file_id'),
                'name': record.get('name', ''), 'release': record.get('release', ''),
                'kind': record.get('kind', 'UNASSESSED'),
                'sha256': record.get('sha256', ''),
                'validation': record.get('validation', ''),
                'scientific_readiness': 'UNVERIFIED',
                'index_source_version': self.canonical.get('index_version', '') if origin == 'CANONICAL_INDEX_FALLBACK' else self.source_version}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--projection', required=True, help='Private dataset locator v2 JSON')
    parser.add_argument('--canonical-index', help='Optional private canonical INDEX.json used on missing/stale entries')
    selector = parser.add_mutually_exclusive_group(required=True)
    selector.add_argument('--id', dest='drive_file_id')
    selector.add_argument('--name')
    selector.add_argument('--queries', help='JSON list of exact-match query objects; resolves in a single load')
    parser.add_argument('--release')
    parser.add_argument('--family')
    parser.add_argument('--member')
    args = parser.parse_args(argv)
    try:
        locator = DatasetLocator(load_json(args.projection),
                                load_json(args.canonical_index) if args.canonical_index else None)
        queries = load_json(args.queries) if args.queries else [{k: v for k, v in vars(args).items()
                       if k in ('drive_file_id', 'name', 'release', 'family', 'member') and v}]
        if not isinstance(queries, list):
            raise LocatorError('QUERIES_MUST_BE_LIST')
        out = [locator.resolve(q) for q in queries]
        print(json.dumps(out if args.queries else out[0], ensure_ascii=False, separators=(',', ':')))
        return 0 if all(x['status'] == 'LOCATED_NOT_VALIDATED' for x in out) else 2
    except (LocatorError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({'status': 'LOOKUP_FAILED', 'error_code': str(exc) if isinstance(exc, LocatorError) else type(exc).__name__}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
