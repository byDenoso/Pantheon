import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'code'))
import nested_private as p


class Response:
    status_code=200
    def __init__(self, data=None, content=b''): self.data=data; self.content=content
    def json(self): return self.data


class Session:
    def __init__(self):
        self.data={'slot00000000':b'', 'slot11111111':b''}
        self.patches=0; self.public=False; self.timeout=False; self.corrupt=False
    def get(self,url,params=None,timeout=None):
        file_id=url.split('/')[-1]
        if file_id=='permissions':
            return Response({'permissions':[{'id':'owner','type':'anyone' if self.public else 'user'}]})
        if (params or {}).get('alt')=='media': return Response(content=self.data[file_id])
        return Response({'id':file_id, 'trashed':False,'ownedByMe':False,
                         'mimeType':'application/vnd.google-apps.folder' if file_id=='folder000000' else 'application/gzip',
                         'capabilities':{'canEdit':True},'parents':['folder000000'],'size':str(len(self.data.get(file_id,b'')))})
    def patch(self,url,params=None,headers=None,data=None,timeout=None):
        self.patches+=1; self.data[url.split('/')[-1]]=b'bad' if self.corrupt else data
        if self.timeout: raise TimeoutError('private scientific error')
        return Response()


def config():
    return {'schema':'NEXO_NESTED_PRIVATE_V1','campaign':'toy','revision':'test',
            'output_folder_id':'folder000000','allowed_permission_ids':['owner'],
            'slots':{'S1-LCDM-s0':['slot00000000','slot11111111']}}


class Privacy(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        self.env=patch.dict(os.environ,{'JOB':'S1-LCDM-s0','CHUNK':'0','GITHUB_OUTPUT':str(self.root/'output'),'GITHUB_SHA':'test','JOB_T0':'0'})
        self.env.start()
        (self.root/'config.json').write_text(json.dumps(config()))
        (self.root/'ckpt').mkdir(); (self.root/'ckpt/toy.save').write_bytes(b'private checkpoint')
        (self.root/'results').mkdir(); (self.root/'results/toy.json').write_text('{"logZ":123,"dlogz_final":0.01}')
        (self.root/'execution.json').write_text('{"status":"CHECKPOINTED"}')
    def tearDown(self): self.env.stop(); self.tmp.cleanup()
    def test_upload_readback_and_restore(self):
        s=Session(); capture=io.StringIO()
        with contextlib.redirect_stdout(capture): p.upload(self.root,s)
        self.assertEqual(capture.getvalue(),'')
        self.assertEqual((self.root/'output').read_text(),'continue=true\n')
        dst=self.root/'restore'
        p.unpack(s.data['slot00000000'],dst,dict(p.binding(config()),chunk=0))
        self.assertEqual((dst/'ckpt/toy.save').read_bytes(),b'private checkpoint')
        self.assertEqual(s.patches,1)
    def test_timeout_reconciles_without_replay(self):
        s=Session(); s.timeout=True
        p.upload(self.root,s)
        self.assertEqual(s.patches,1)
        self.assertTrue(json.loads((self.root/'delivery.json').read_text())['verified'])
    def test_bad_readback_blocks_continuation(self):
        s=Session(); s.corrupt=True
        with self.assertRaises(p.PrivateDeliveryError): p.upload(self.root,s)
        self.assertFalse((self.root/'output').exists())
        self.assertEqual(s.patches,1)
    def test_nonempty_slot_never_overwritten(self):
        s=Session(); s.data['slot00000000']=b'prior result'
        with self.assertRaises(p.PrivateDeliveryError): p.upload(self.root,s)
        self.assertEqual(s.patches,0)
    def test_public_acl_blocks_before_write(self):
        s=Session(); s.public=True
        with self.assertRaises(p.PrivateDeliveryError): p.upload(self.root,s)
        self.assertEqual(s.patches,0)
    def test_missing_next_slot_preserves_current_but_stops(self):
        s=Session(); s.data['slot11111111']=b'already used'
        with self.assertRaises(p.PrivateDeliveryError): p.upload(self.root,s)
        self.assertEqual((self.root/'output').read_text(),'continue=false\n')
        self.assertTrue(json.loads((self.root/'delivery.json').read_text())['verified'])
    def test_path_traversal_rejected(self):
        buf=io.BytesIO()
        with tarfile.open(fileobj=buf,mode='w:gz') as arc:
            t=tarfile.TarInfo('../escape'); t.size=1; arc.addfile(t,io.BytesIO(b'x'))
        with self.assertRaises(p.PrivateDeliveryError): p.unpack(buf.getvalue(),self.root,{})
    def test_wrong_campaign_rejected_before_files(self):
        s=Session(); p.upload(self.root,s)
        dst=self.root/'restore'
        with self.assertRaises(p.PrivateDeliveryError): p.unpack(s.data['slot00000000'],dst,{'campaign':'wrong'})
        self.assertFalse(dst.exists())
    def test_no_public_scientific_artifacts_or_cache(self):
        workflow=(Path(__file__).resolve().parents[1]/'.github/workflows/nested.yml').read_text()
        self.assertNotIn('upload-artifact',workflow)
        self.assertNotIn('actions/cache',workflow)
        self.assertNotIn('ckpt_status',workflow)
        self.assertNotIn('GITHUB_STEP_SUMMARY',workflow)
        self.assertIn('steps.delivery.outcome == \'success\'',workflow)
    def test_timeout_kills_entire_group_and_waits(self):
        import subprocess
        from unittest.mock import MagicMock
        proc=MagicMock(); proc.pid=123
        proc.__enter__.return_value=proc
        proc.wait.side_effect=[subprocess.TimeoutExpired('toy',1),None]
        with patch.object(p.subprocess,'Popen',return_value=proc) as popen, patch.object(p.os,'killpg') as kill:
            with self.assertRaises(subprocess.TimeoutExpired):
                p.invoke_private(['toy'],timeout=1)
            self.assertTrue(popen.call_args.kwargs['start_new_session'])
            kill.assert_called_once_with(123,p.signal.SIGKILL)
            self.assertEqual(proc.wait.call_count,2)

    def test_child_has_no_credentials_and_captures_output(self):
        os.environ['CHUNK']='1'
        os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']='secret'
        def invoke(args, **kw):
            self.assertNotIn('GOOGLE_SERVICE_ACCOUNT_JSON',kw['env'])
            self.assertNotIn('GITHUB_OUTPUT',kw['env'])
            kw['stdout'].write(b'scientific result 123\n')
            return type('R',(),{'returncode':3})()
        out=io.StringIO()
        with contextlib.redirect_stdout(out): p.execute(self.root,invoke)
        self.assertEqual(out.getvalue(),'')
        self.assertIn(b'123',(self.root/'logs/chunk-1.log').read_bytes())
        os.environ.pop('GOOGLE_SERVICE_ACCOUNT_JSON',None)

if __name__=='__main__': unittest.main()
