import unittest
import os
import subprocess
import sys
from pathlib import Path
from scripts.nexo_shadow_intake import assess, parse_request, PREFIX

HEADER=['data','de','para','texto','link','tipo','item','id']
D='a'*64
REQUEST=f'{PREFIX} bat-unit-test-6 {D}'

def row(name='NEXO-INTAKE-EXAMPLE-1', text=REQUEST, role='S1', item='R1-1.1'):
    return ['2026-10-20T20:00:00Z',role,'P',text,'ROADMAP!2','PEDIDO',item,name]

class IntakeTest(unittest.TestCase):
    def test_valid_pointer_requires_approval(self):
        out=assess([HEADER,row()]);self.assertEqual(out['status'],'READ_ONLY_NOT_DISPATCHED')
        self.assertEqual(out['candidates'][0]['status'],'UNATTESTED_NEEDS_VERIFIED_HUMAN_MANDATE')
    def test_no_natural_language_execution(self):
        self.assertEqual(assess([HEADER,row(text='Por favor executar')])['invalid'],1)
    def test_invalid_digest(self):
        self.assertIsNone(parse_request(f'{PREFIX} bat-unit-test-6 bad'))
    def test_private_marker_and_malformed_rows(self):
        self.assertEqual(assess([HEADER,row(text=f'{PREFIX} PEER_private {D}'),['a']])['invalid'],1)
    def test_bad_actor_claim(self):
        self.assertEqual(assess([HEADER,row(role='UNKNOWN')])['invalid'],1)
    def test_repeated_id_is_idempotent(self):
        out=assess([HEADER,row(),row()]);self.assertEqual(len(out['candidates']),1)
    def test_collision_does_not_issue_commands(self):
        out=assess([HEADER,row(),row(item='R2-2.1')]);self.assertEqual(out['conflicts'],1)
    def test_cli_invocation_fails_closed_without_credentials(self):
        env=dict(os.environ)
        env.pop('GOOGLE_SERVICE_ACCOUNT_JSON',None)
        repo=Path(__file__).resolve().parents[2]
        result=subprocess.run([sys.executable,'scripts/nexo_shadow_intake.py'],
            cwd=repo,env=env,capture_output=True,text=True,timeout=10)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('PRIVATE_WRITER_CREDENTIAL_MISSING',result.stderr)
        self.assertNotIn('ModuleNotFoundError',result.stderr)
    def test_incomplete_header_rejected(self):
        with self.assertRaisesRegex(ValueError,'HEADER'):assess([HEADER[:5]])

if __name__=='__main__': unittest.main()
