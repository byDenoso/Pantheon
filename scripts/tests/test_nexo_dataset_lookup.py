"""Dataset locator lookup must never manufacture scientific readiness."""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from scripts.nexo_dataset_lookup import DatasetLocator, LocatorError, main


def sample():
    return {'schema': 'nexo.dataset-projection.v1.1', 'kind': 'DERIVED_LOCATION_VIEW_NON_CANONICAL',
            'index_source_version': '2026.1',
            'entries': [
                {'drive_file_id': 'id-one', 'name': 'catalog.fits', 'release': 'DR1', 'family': 'LSS',
                 'kind': 'DATA_FILE_CANDIDATE', 'sha256': 'a' * 64, 'member_paths': ''},
                {'drive_file_id': 'id-two', 'name': 'catalog.fits', 'release': 'DR2', 'family': 'LSS',
                 'kind': 'DATA_FILE_CANDIDATE', 'sha256': '', 'member_paths': 'bin/cov.fits'},
            ]}


class TestLocator(unittest.TestCase):
    def test_exact_id_and_non_authoritative_status(self):
        result = DatasetLocator(sample()).resolve({'id': 'id-one'})
        self.assertEqual(result['status'], 'LOCATED_NOT_VALIDATED')
        self.assertEqual(result['scientific_readiness'], 'UNVERIFIED')
        self.assertEqual(result['drive_file_id'], 'id-one')

    def test_ambiguous_name_fails_closed(self):
        self.assertEqual(DatasetLocator(sample()).resolve({'name': 'CATALOG.FITS'})['status'], 'AMBIGUOUS')

    def test_release_and_member_filter(self):
        result = DatasetLocator(sample()).resolve({'name': 'catalog.fits', 'release': 'DR2', 'member': 'cov.fits'})
        self.assertEqual(result['drive_file_id'], 'id-two')
        self.assertEqual(DatasetLocator(sample()).resolve({'id': 'id-one', 'release': 'DR2'})['status'], 'NOT_FOUND_IN_AVAILABLE_INDEX')

    def test_missing_projection_is_not_missing_science(self):
        result = DatasetLocator(sample()).resolve({'id': 'new-id'})
        self.assertEqual(result['scope'], 'PROJECTION_ONLY')

    def test_canonical_index_fallback(self):
        canonical = {'index_version': '2026.1', 'resources': [{'drive_file_id': 'new-id', 'name': 'new.fits'}]}
        result = DatasetLocator(sample(), canonical).resolve({'id': 'new-id'})
        self.assertEqual(result['source'], 'CANONICAL_INDEX_FALLBACK')

    def test_stale_projection_defers_to_canonical(self):
        canonical = {'index_version': '2026.2', 'resources': [{'drive_file_id': 'id-one', 'name': 'new-version.fits'}]}
        result = DatasetLocator(sample(), canonical).resolve({'id': 'id-one'})
        self.assertEqual(result['name'], 'new-version.fits')
        self.assertEqual(result['source'], 'CANONICAL_INDEX_FALLBACK')

    def test_duplicate_or_forged_projection_rejected(self):
        x = sample(); x['entries'].append(x['entries'][0]);
        with self.assertRaisesRegex(LocatorError, 'DUPLICATE'):
            DatasetLocator(x)
        y = sample(); y['kind'] = 'AUTHORITATIVE';
        with self.assertRaisesRegex(LocatorError, 'AUTHORITY'):
            DatasetLocator(y)

    def test_cli_batches_in_one_load(self):
        with tempfile.TemporaryDirectory() as root:
            p, q = Path(root) / 'projection.json', Path(root) / 'queries.json'
            p.write_text(json.dumps(sample())); q.write_text(json.dumps([{'id': 'id-one'}, {'id': 'id-two'}]))
            stream = io.StringIO()
            with redirect_stdout(stream):
                code = main(['--projection', str(p), '--queries', str(q)])
            self.assertEqual(code, 0)
            self.assertEqual(len(json.loads(stream.getvalue())), 2)


if __name__ == '__main__':
    unittest.main()
