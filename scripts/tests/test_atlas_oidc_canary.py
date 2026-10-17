"""Synthetic transport checks, never proof that live OIDC trust works."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request
import urllib.response

from scripts import atlas_oidc_canary as canary
from scripts import nexo_autonomy_runtime as runtime


class Response(io.BytesIO):
    def __init__(self, body, status=200):
        super().__init__(body)
        self.status = status
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        return super().read(size)


class CanaryTests(unittest.TestCase):
    TOKEN = "synthetic-oidc-token-do-not-log"
    PRIVATE = "synthetic-private-envelope-do-not-log"

    def body(self, decisions=None):
        return json.dumps({"contract": canary.CONTRACT,
                           "decisions": [] if decisions is None else decisions}).encode()

    def invoke(self, body=None, status=200, error=None, oidc_error=None):
        response = Response(self.body() if body is None else body, status)
        opener = Mock()
        opener.open.side_effect = error
        if error is None:
            opener.open.return_value = response
        out, err = io.StringIO(), io.StringIO()
        with patch.object(runtime, "oidc", return_value=self.TOKEN, side_effect=oidc_error) as issue, \
             patch.object(urllib.request, "build_opener", return_value=opener) as build, \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = canary.main()
        return result, out.getvalue(), err.getvalue(), response, issue, build, opener

    def assert_failure(self, result):
        self.assertEqual(result[:3], (1, "ATLAS_OIDC_CANARY FAIL count=0\n", ""))

    def test_only_count_is_logged_for_zero_one_and_twenty_items(self):
        for count in (0, 1, 20):
            # The canary never interprets IDs or envelopes as authority.
            body = self.body([{"id": self.PRIVATE, "envelope": {"secret": self.PRIVATE}}] * count)
            result = self.invoke(body)
            self.assertEqual(result[:3], (0, f"ATLAS_OIDC_CANARY PASS count={count}\n", ""))
            self.assertNotIn(self.PRIVATE, result[1])
            self.assertNotIn(self.TOKEN, result[1])

    def test_fixed_get_audience_bounds_and_existing_redirect_guard(self):
        result = self.invoke()
        result[4].assert_called_once_with("nexo-atlas-autonomy-writer")
        result[5].assert_called_once()
        self.assertIs(type(result[5].call_args.args[0]), runtime.NoApiRedirect)
        result[6].open.assert_called_once()
        request = result[6].open.call_args.args[0]
        self.assertEqual(request.full_url, "https://nexoresearch.org/api/autonomy-writer/decisions")
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)
        self.assertEqual(dict(request.header_items()), {
            "Authorization": "Bearer " + self.TOKEN, "Accept": "application/json"})
        self.assertEqual(result[6].open.call_args.kwargs, {"timeout": 5})
        self.assertEqual(result[3].read_sizes, [1048577])

    def test_every_non_200_response_fails_without_reading_body(self):
        for status in (201, 204, 301, 302, 307, 308, 400, 401, 403, 429, 500):
            with self.subTest(status=status):
                result = self.invoke(self.PRIVATE.encode(), status=status)
                self.assert_failure(result)
                self.assertEqual(result[3].read_sizes, [])

    def test_exact_schema_json_and_count_fail_closed(self):
        invalid = [b"", b"not json", b"\xff", b"null", b"[]", b"1", b"true",
                   b'{}', json.dumps({"contract": canary.CONTRACT}).encode(),
                   json.dumps({"contract": canary.CONTRACT, "decisions": [], "extra": 1}).encode(),
                   json.dumps({"contract": "other", "decisions": []}).encode(),
                   json.dumps({"contract": canary.CONTRACT, "decisions": {}}).encode(),
                   json.dumps({"contract": canary.CONTRACT, "decisions": None}).encode(),
                   self.body([{}] * 21),
                   ('{"contract":"wrong","contract":"' + canary.CONTRACT + '","decisions":[]}').encode(),
                   ('{"contract":"' + canary.CONTRACT + '","decisions":[{"x":1,"x":2}]}').encode()]
        for constant in ("NaN", "Infinity", "-Infinity"):
            invalid.append(('{"contract":"' + canary.CONTRACT + '","decisions":[' + constant + ']}').encode())
        for body in invalid:
            with self.subTest(body=body[:40]):
                self.assert_failure(self.invoke(body))

    def test_exact_byte_limit_and_overflow(self):
        body = self.body()
        self.assertEqual(self.invoke(body + b" " * (canary.MAX_BYTES - len(body)))[:3],
                         (0, "ATLAS_OIDC_CANARY PASS count=0\n", ""))
        result = self.invoke(body + b" " * (canary.MAX_BYTES + 10 - len(body)))
        self.assert_failure(result)
        self.assertEqual(result[3].read_sizes, [canary.MAX_BYTES + 1])

    def test_transport_failures_never_log_error_headers_body_or_token(self):
        secret = self.TOKEN + self.PRIVATE
        errors = [TimeoutError(secret), OSError(secret), ValueError(secret),
                  urllib.error.URLError(secret),
                  urllib.error.HTTPError(canary.URL, 401, secret,
                                         {"Authorization": secret}, io.BytesIO(secret.encode()))]
        for error in errors:
            with self.subTest(error=type(error).__name__):
                self.assert_failure(self.invoke(error=error))

    def test_oidc_failure_never_fetches_or_leaks(self):
        result = self.invoke(oidc_error=RuntimeError(self.TOKEN + self.PRIVATE))
        self.assert_failure(result)
        result[5].assert_not_called()
        result[6].open.assert_not_called()

    def test_real_redirect_handler_never_follows_a_second_request(self):
        for code in (301, 302, 303, 307, 308):
            calls = []
            class FakeHTTPS(urllib.request.HTTPSHandler):
                def https_open(self, request):
                    calls.append(request.full_url)
                    response = urllib.response.addinfourl(io.BytesIO(b""),
                        {"Location": "https://not-authorized.invalid/"}, request.full_url, code)
                    response.msg = "redirect"
                    return response
            original_builder = urllib.request.build_opener
            def build(guard):
                self.assertIs(type(guard), runtime.NoApiRedirect)
                return original_builder(guard, FakeHTTPS())
            out, err = io.StringIO(), io.StringIO()
            with patch.object(runtime, "oidc", return_value=self.TOKEN), \
                 patch.object(urllib.request, "build_opener", side_effect=build), \
                 contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                result = canary.main()
            self.assertEqual((result, out.getvalue(), err.getvalue()),
                             (1, "ATLAS_OIDC_CANARY FAIL count=0\n", ""))
            self.assertEqual(calls, [canary.URL])

    def test_workflow_step_is_separate_exact_identity_and_has_no_secret_environment(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/nexo-writer-robot.yml").read_text()
        name = "      - name: Check Atlas OIDC transport without consuming decisions\n"
        self.assertEqual(workflow.count(name), 1)
        step = workflow.split(name)[1].split("      - name:")[0]
        for required in ("steps.cred.outputs.ok == 'true'", "github.repository == 'byDenoso/Pantheon'",
                         "github.ref == 'refs/heads/main'", "continue-on-error: true",
                         "github.workflow_ref == 'byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main'",
                         "run: python -m scripts.atlas_oidc_canary"):
            self.assertIn(required, step)
        for forbidden in ("env:", "secrets.", "GH_TOKEN", "gateway", "context", "proposal_sha256", "GOOGLE"):
            self.assertNotIn(forbidden, step)
        self.assertLess(workflow.index("uses: actions/setup-python@v5"), workflow.index(name))
        self.assertLess(workflow.index(name), workflow.index("- name: Fetch canonical writer bundle from Drive"))

    def test_module_entrypoint_missing_oidc_environment_is_fixed_failure(self):
        root = Path(__file__).resolve().parents[2]
        env = {key: value for key, value in os.environ.items() if not key.startswith("ACTIONS_ID_TOKEN_")}
        result = subprocess.run([sys.executable, "-m", "scripts.atlas_oidc_canary"],
                                cwd=root, env=env, text=True, capture_output=True, timeout=5)
        self.assertEqual((result.returncode, result.stdout, result.stderr),
                         (1, "ATLAS_OIDC_CANARY FAIL count=0\n", ""))


if __name__ == "__main__":
    unittest.main()
