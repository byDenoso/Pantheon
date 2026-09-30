import io
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('api_read',Path(__file__).parents[1]/'github_api_read.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
URL='https://api.github.com/repos/byDenoso/TCC/compare/base...nexo-inbox'


class Reads(unittest.TestCase):
    def test_existing_credential_is_header_only_for_exact_origin(self):
        opener=Mock();opener.open.return_value=io.BytesIO(b'{"commits":[]}')
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}):
            self.assertEqual(a.read_api_json(URL,opener=opener),{'commits':[]})
        req=opener.open.call_args.args[0]
        self.assertEqual(req.get_header('Authorization'),'Bearer synthetic-fixture')
        self.assertNotIn('synthetic-fixture',req.full_url)

    def test_other_origins_and_missing_token_never_open_network(self):
        opener=Mock()
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}):
            for url in ['http://api.github.com/x','https://api.github.com.evil/x',
                        'https://raw.githubusercontent.com/x','https://u@api.github.com/x',
                        'https://api.github.com:443/x']:
                with self.assertRaises(ValueError):a.read_api_json(url,opener=opener)
        with patch.dict(os.environ,{},clear=True),self.assertRaisesRegex(ValueError,'no anonymous'):
            a.read_api_json(URL,opener=opener)
        opener.open.assert_not_called()

    def test_redirect_never_forwards_authorization(self):
        for url in ['https://example.org/x',URL]:
            with self.assertRaisesRegex(ValueError,'redirects'):
                a.NoApiRedirect().redirect_request(None,None,302,'Found',{},url)

    def test_rate_headers_delay_retry_and_keep_total_attempts_bounded(self):
        opener=Mock();sleeps=[]
        opener.open.side_effect=[HTTPError(URL,403,'rate limited',{'Retry-After':'2','X-RateLimit-Remaining':'0','X-RateLimit-Reset':'1005'},None),io.BytesIO(b'{}')]
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}):
            self.assertEqual(a.read_api_json(URL,opener=opener,sleep=sleeps.append,now=lambda:1000),{})
        self.assertEqual(sleeps,[5]);self.assertEqual(opener.open.call_count,2)

    def test_http_date_and_repeated_rate_limit_stop_after_one_retry(self):
        self.assertEqual(a.retry_delay({'Retry-After':'Thu, 01 Jan 1970 00:16:45 GMT'},1000),5)
        opener=Mock();opener.open.side_effect=HTTPError(URL,429,'quota',{'Retry-After':'2'},None)
        sleeps=[]
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}),self.assertRaises(HTTPError):
            a.read_api_json(URL,opener=opener,sleep=sleeps.append)
        self.assertEqual(opener.open.call_count,2);self.assertEqual(sleeps,[2])

    def test_long_quota_window_does_not_retry_early(self):
        opener=Mock();opener.open.side_effect=HTTPError(URL,429,'quota',{'Retry-After':'600'},None)
        sleep=Mock()
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}),self.assertRaisesRegex(RuntimeError,'later cycle'):
            a.read_api_json(URL,opener=opener,sleep=sleep)
        sleep.assert_not_called();self.assertEqual(opener.open.call_count,1)

    def test_permission_denial_is_not_classified_as_rate_limit(self):
        opener=Mock();opener.open.side_effect=HTTPError(URL,403,'permission denied',{},None)
        with patch.dict(os.environ,{'GH_TOKEN':'synthetic-fixture'}),self.assertRaises(HTTPError):
            a.read_api_json(URL,opener=opener,sleep=lambda x:self.fail('permission retry'))
        self.assertEqual(opener.open.call_count,1)

    def test_workflow_auth_is_limited_to_metadata_step(self):
        text=(Path(__file__).parents[2]/'.github/workflows/nexo-writer-robot.yml').read_text()
        section=text.split('- name: Collect proposals from public TCC inbox',1)[1].split('- name: Collect proposals from scheduled Sheet spool',1)[0]
        self.assertIn('GH_TOKEN: ${{ github.token }}',section)
        self.assertIn('comparison=read_api_json(api)',section)
        self.assertIn('headers={"User-Agent":"nexo-writer-robot"}',section)
        self.assertNotIn('Authorization',section)

if __name__=='__main__':unittest.main()
