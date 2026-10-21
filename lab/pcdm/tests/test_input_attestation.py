"""Safety tests for actual public bytes referenced by a frozen contract."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from lab.pcdm.runner import BlockedInput, freeze


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def group_hash(entries):
    raw = json.dumps(sorted(entries, key=lambda o: o['path']),
                     sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


class AttestationTests(unittest.TestCase):
    def new_frozen(self, root):
        root = Path(root)
        payload = {'adapter.py': 'def loglikelihood(x): return -1.0\ndef prior_transform(x): return x\n',
                   'data.dat': 'mock observation, not PCDM',
                   'priors.json': '{"parameters":[{"name":"x","prior":"uniform"}]}'}
        for name, raw in payload.items():
            (root / name).write_text(raw)
        c = {'schema': 1, 'status': 'READY_PUBLIC_INPUTS', 'adapter': 'adapter.py',
             'adapter_sha256': digest(root / 'adapter.py'), 'ndim': 1,
             'nlive': 20, 'seed': 17, 'dlogz': 0.5, 'max_segments': 2}
        names = {'data': 'data.dat', 'likelihood': 'adapter.py', 'priors': 'priors.json'}
        c['public_input_files'] = {}
        for role, name in names.items():
            items = [{'path': name, 'sha256': digest(root / name)}]
            c['public_input_files'][role] = items
            c[role + '_sha256'] = group_hash(items)
        source = root / 'frozen.json'
        source.write_text(json.dumps(c))
        return source, c

    def test_existing_bytes_allow_only_structural_attestation(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, c = self.new_frozen(tmp)
            result, _, adapter, sha = freeze(source)
            self.assertEqual(result, c)
            self.assertEqual(adapter.name, 'adapter.py')
            self.assertEqual(sha, digest(source))

    def test_changed_input_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, _ = self.new_frozen(tmp)
            (Path(tmp) / 'data.dat').write_text('corrupted data')
            with self.assertRaisesRegex(BlockedInput, 'PUBLIC_INPUT_SHA256_MISMATCH_DATA'):
                freeze(source)

    def test_wrong_fingerprint_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, c = self.new_frozen(tmp)
            c['priors_sha256'] = '1' * 64
            source.write_text(json.dumps(c))
            with self.assertRaisesRegex(BlockedInput, 'PUBLIC_INPUT_GROUP_SHA256_MISMATCH_PRIORS'):
                freeze(source)

    def test_traversal_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, c = self.new_frozen(tmp)
            c['public_input_files']['data'][0]['path'] = '../other.dat'
            source.write_text(json.dumps(c))
            with self.assertRaisesRegex(BlockedInput, 'PUBLIC_INPUT_ENTRY_UNSAFE_DATA'):
                freeze(source)


if __name__ == '__main__':
    unittest.main()
