"""Synthetic privacy regressions: never download public science data or contact Drive."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import nexo_cf4_private as private

SECRET = 'SYNTHETIC_UNPUBLISHED_NUMBER_987.654'
FOLDER = 'private-folder-fixture'
FILE = 'private-output-fixture'
CONFIG = 'private-config-fixture'


class Response:
    status_code = 200
    def __init__(self, value=None, content=b''):
        self.value, self.content = value, content
    def json(self):
        return self.value


class Drive:
    def __init__(self):
        self.payload = b''
        self.public = False
        self.corrupt = False
        self.posts = 0
        self.extra_recipient = False
    def get(self, url, params, timeout):
        if url.endswith('/permissions'):
            ps = [{'id': 'owner', 'type': 'user'}]
            if self.public:
                ps.append({'id': 'anyone', 'type': 'anyone'})
            if self.extra_recipient:
                ps.append({'id': 'stranger', 'type': 'user'})
            return Response({'permissions': ps})
        if params.get('alt') == 'media':
            return Response(content=self.payload + (b'changed' if self.corrupt else b''))
        return Response({'id': FILE, 'trashed': False, 'parents': [FOLDER], 'size': str(len(self.payload)),
                         'mimeType': 'application/vnd.google-apps.folder' if url.endswith(FOLDER) else 'application/gzip'})
    def post(self, url, params, headers, data, timeout):
        self.posts += 1
        self.payload = data.split(b'Content-Type: application/gzip\r\n\r\n')[1].rsplit(b'\r\n--', 1)[0]
        return Response({'id': FILE})


class PrivateOutputTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.env = patch.dict(os.environ, {'GITHUB_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123',
                                           'GITHUB_RUN_ATTEMPT': '1', 'RUNNER_TEMP': str(self.root)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.tmp.cleanup)
        self.cfg = {'schema': 'NEXO_CF4_PRIVATE_V1', 'params': {}, 'output_folder_id': FOLDER,
                    'allowed_permission_ids': ['owner'], 'recipe_sha256': 'b' * 64}
        (self.root / 'config.json').write_text(json.dumps(self.cfg))
        (self.root / 'result.json').write_text(json.dumps({'summary': SECRET}))
        (self.root / 'run.log').write_text(SECRET)
    def test_prepare_checks_config_hash_recipe_hash_and_acl(self):
        recipe = self.root / 'reviewed.py'
        recipe.write_text('# reviewed synthetic fixture')
        self.cfg['recipe_sha256'] = private.digest(recipe.read_bytes())
        raw = json.dumps(self.cfg).encode()
        drive = Drive()
        drive.payload = raw
        with patch.object(private, 'RECIPE', recipe), patch.dict(os.environ, {
            'CF4_PRIVATE_CONFIG_FILE_ID': CONFIG, 'CF4_PRIVATE_CONFIG_SHA256': private.digest(raw)}):
            private.prepare(self.root, drive)
            self.assertEqual(json.loads((self.root / 'params.json').read_text()), {})
            drive.payload = raw + b'changed'
            with self.assertRaisesRegex(private.PrivateDeliveryError, 'CONFIG_BINDING_FAILED'):
                private.prepare(self.root, drive)
    def test_post_upload_acl_change_remains_unverified(self):
        drive = Drive()
        original = drive.post
        def changed(*args, **kwargs):
            response = original(*args, **kwargs)
            drive.public = True
            return response
        drive.post = changed
        with self.assertRaisesRegex(private.PrivateDeliveryError, 'PRIVATE_ACL_REQUIRED'):
            private.upload(self.root, drive)
        self.assertEqual(drive.posts, 1)
        self.assertFalse(json.loads((self.root / 'delivery.json').read_text())['verified'])
    def test_private_upload_readback_and_no_stdout(self):
        out = io.StringIO()
        drive = Drive()
        with contextlib.redirect_stdout(out):
            private.upload(self.root, drive)
        self.assertEqual(out.getvalue(), '')
        receipt = json.loads((self.root / 'delivery.json').read_text())
        self.assertTrue(receipt['verified'])
        self.assertEqual(receipt['sha256'], private.digest(drive.payload))
        self.assertEqual(drive.posts, 1)
    def test_public_or_unapproved_recipient_refused_before_upload(self):
        for attr in ('public', 'extra_recipient'):
            drive = Drive()
            setattr(drive, attr, True)
            with self.assertRaises(private.PrivateDeliveryError):
                private.upload(self.root, drive)
            self.assertEqual(drive.posts, 0)
    def test_corruption_fails_without_retry_or_verified_receipt(self):
        drive = Drive()
        drive.corrupt = True
        with self.assertRaises(private.PrivateDeliveryError):
            private.upload(self.root, drive)
        self.assertEqual(drive.posts, 1)
        self.assertFalse(json.loads((self.root / 'delivery.json').read_text())['verified'])
    def test_upload_timeout_is_not_retried(self):
        drive = Drive()
        with patch.object(drive, 'post', side_effect=TimeoutError(SECRET)) as post:
            with self.assertRaises(TimeoutError):
                private.upload(self.root, drive)
            self.assertEqual(post.call_count, 1)
    def test_failure_console_is_fixed_status_only(self):
        out = io.StringIO()
        with patch.object(sys, 'argv', ['nexo_cf4_private.py', 'prepare']), \
             patch.object(private, 'session_from_env', side_effect=ValueError(SECRET)), \
             contextlib.redirect_stdout(out):
            self.assertEqual(private.main(), 1)
        self.assertEqual(out.getvalue(), 'STATUS FAILED\n')
    def test_compute_child_does_not_receive_credentials_or_actions_commands(self):
        recipe = self.root / 'recipe.py'
        recipe.write_text('# synthetic fixture')
        self.cfg['recipe_sha256'] = private.digest(recipe.read_bytes())
        (self.root / 'config.json').write_text(json.dumps(self.cfg))
        seen = {}
        def invoke(cmd, **kw):
            seen.update(kw)
            Path(kw['env']['RESULT_PATH']).write_text(json.dumps(dict.fromkeys(
                ['verdict', 'decision', 'summary', 'statistics', 'semantic'], SECRET)))
            kw['stdout'].write(SECRET.encode())
            return subprocess.CompletedProcess(cmd, 0)
        with patch.object(private, 'RECIPE', recipe), patch.dict(os.environ, {
            'GOOGLE_SERVICE_ACCOUNT_JSON': SECRET, 'GITHUB_TOKEN': SECRET, 'GITHUB_OUTPUT': SECRET}):
            private.execute(self.root, invoke)
        self.assertNotIn(SECRET, str(seen['env']))
        self.assertEqual(seen['stderr'], subprocess.STDOUT)
        self.assertEqual(seen['env']['NEXO_CF4_PRIVATE_OUTPUT'], '1')
    def test_recipe_entrypoint_refuses_public_route_before_compute(self):
        path = ROOT / 'nexo-one/executor-runtime/recipes/cf4_velocity.py'
        spec = importlib.util.spec_from_file_location('private_test_cf4', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.dict(os.environ, {}, clear=True), patch.object(module, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'PRIVATE_OUTPUT_ROUTE_REQUIRED'):
                module.main()
            run.assert_not_called()
    def test_workflow_has_no_public_output_sinks_and_restricts_main(self):
        text = (ROOT / '.github/workflows/nexo-cf4-private.yml').read_text()
        for forbidden in ('upload-artifact', 'download-artifact', 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'tee ', 'tail ', 'grep ', 'pull_request_target'):
            self.assertNotIn(forbidden, text)
        self.assertIn("github.ref == 'refs/heads/main'", text)
        self.assertIn('persist-credentials: false', text)
        self.assertNotIn('actions: write', text)
    def test_public_routes_block_before_frozen_checkout_and_execution(self):
        text = (ROOT / '.github/workflows/nexo-test-battery.yml').read_text()
        self.assertLess(text.index('if recipe == "cf4_velocity"'), text.index('script_path ='))
        self.assertIn('PRIVATE_OUTPUT_ROUTE_REQUIRED', (ROOT / 'nexo-one/executor-runtime/package_validation.py').read_text())
        import nexo_recipe_smoke
        recipes = self.root / 'recipes'
        (recipes / 'smoke').mkdir(parents=True)
        (recipes / 'smoke/cf4_velocity.json').write_text('{}')
        with patch.object(subprocess, 'run') as run:
            report = self.root / 'report.json'
            self.assertEqual(nexo_recipe_smoke.run_smoke(recipes, report, run), 0)
            run.assert_not_called()
        self.assertNotIn(SECRET, report.read_text())
        self.assertTrue(any(row['recipe'] == 'cf4_velocity' and row['state'] == 'SKIPPED'
                            for row in json.loads(report.read_text())['rows']))


if __name__ == '__main__':
    unittest.main()
