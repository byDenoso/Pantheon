"""Trusted hydration and separate credential-free operational execution."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

TOWER_ID='1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z'
SCOPE='ENGINEERING_OPERATIONAL_ONLY'
MAX_BYTES=2*1024*1024
REPO='byDenoso/Pantheon'

def canonical(x):return json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def sha(x):return hashlib.sha256(x if isinstance(x,bytes) else canonical(x)).hexdigest()
def require(ok,code):
    if not ok:raise ValueError(code)

def read_drive(session,file_id,version=None,expected_hash=None,max_bytes=MAX_BYTES):
    require(isinstance(file_id,str) and re.fullmatch(r'[A-Za-z0-9_-]+',file_id),'DRIVE_ID_INVALID')
    url='https://www.googleapis.com/drive/v3/files/'+file_id
    def metadata():
        r=session.get(url,params={'fields':'id,headRevisionId,size,md5Checksum','supportsAllDrives':'true'},timeout=45)
        r.raise_for_status();return r.json()
    before=metadata();require(before.get('id')==file_id and int(before.get('size',max_bytes+1))<=max_bytes,'DRIVE_METADATA_INVALID')
    require(not version or version==before.get('headRevisionId'),'DRIVE_REVISION_CHANGED')
    r=session.get(url,params={'alt':'media','supportsAllDrives':'true'},stream=True,timeout=45)
    r.raise_for_status();parts=[];size=0
    for part in r.iter_content(65536):
        size+=len(part);require(size<=max_bytes,'DRIVE_BODY_TOO_LARGE');parts.append(part)
    raw=b''.join(parts);after=metadata()
    require(before==after,'DRIVE_READ_RACE')
    require(hashlib.md5(raw).hexdigest()==before.get('md5Checksum'),'DRIVE_BODY_MD5_MISMATCH')
    require(not expected_hash or sha(raw)==expected_hash,'DRIVE_BODY_SHA256_MISMATCH')
    return raw

def make_capsule(package,package_hash):
    require(sha(package)==package_hash,'PACKAGE_HASH_MISMATCH')
    require(package.get('contract')=='NEXO_FROZEN_OPERATIONAL_PACKAGE_V1' and package.get('scope')==SCOPE and
            package.get('scientific_result_eligible') is False,'PACKAGE_SCOPE_INVALID')
    require(package.get('work_id')=='OPERATIONAL-CONTROL-DRIVE-SUM-V1','PILOT_WORK_ID_INVALID')
    require(package['recipe']['id']=='drive-sum-mean-v1','RECIPE_NOT_ALLOWLISTED')
    data=base64.b64decode(package['input_bytes_b64'],validate=True)
    recipe=base64.b64decode(package['recipe_bytes_b64'],validate=True)
    require(sha(data)==package['input']['sha256'] and sha(recipe)==package['recipe']['sha256'],'CAPSULE_SOURCE_HASH_MISMATCH')
    require(sha(recipe)=='17f0855b95de6d77ad9bc26ff92a05a38692b14455a022dfc34a810ef6ad96be','RECIPE_NOT_ALLOWLISTED')
    require(json.loads(data)=={'contract':'NEXO_DRIVE_OPERATIONAL_CONTROL_V1','values':[1,2,3]},'ONLY_KNOWN_OPERATIONAL_FIXTURE_ALLOWED')
    require(package['known_result']=={'count':3,'sum':6,'mean':2},'KNOWN_RESULT_CHANGED')
    return dict(contract='NEXO_OPERATIONAL_CAPSULE_V1',scope=SCOPE,work_id=package['work_id'],
                package_sha256=package_hash,definition_sha256=package['definition_sha256'],
                input_sha256=package['input']['sha256'],recipe_sha256=package['recipe']['sha256'],
                code_sha=package['code']['sha'],known_result=package['known_result'],
                input_bytes_b64=package['input_bytes_b64'],recipe_bytes_b64=package['recipe_bytes_b64'])

def hydrate(session,env):
    require(env.get('GITHUB_REPOSITORY')==REPO and env.get('GITHUB_REF')=='refs/heads/main','MAIN_ORIGIN_REQUIRED')
    require(env.get('EXPECTED_COMMIT')==env.get('GITHUB_SHA'),'RUN_COMMIT_NOT_FROZEN')
    for key in ('PACKAGE_SHA256','CORRELATION'):
        require(re.fullmatch(r'[0-9a-f]{64}' if key=='PACKAGE_SHA256' else r'[0-9a-f]{40}',env.get(key,'')),'INPUT_FORMAT_INVALID')
    tower=json.loads(read_drive(session,TOWER_ID,max_bytes=32*1024*1024))
    require(tower.get('stable_file_id')==TOWER_ID and tower.get('revision')=='sha256:'+sha(tower['files']),'TOWER_FINGERPRINT_INVALID')
    entry=tower['files'].get('entities/artifact/OPERATIONAL-CONTROL-RUNTIME-V1.json',{}).get('value',{})
    require(not entry or entry.get('kind')=='NEXO_OPERATIONAL_RUNTIME_V1','CANONICAL_CONFIG_IDENTITY_INVALID')
    config=entry.get('payload') if entry else tower['files'].get('contracts/OPERATIONAL_RUNTIME_V1.json',{}).get('value',{})
    require(config.get('enabled') is True and config.get('publication_authorized') is True and config.get('approval_ref'),'PUBLICATION_SUSPENDED')
    matching=[]
    for entry in tower['files'].values():
        artifact=entry.get('value',{})
        if artifact.get('kind')!='NEXO_OPERATIONAL_WORK_V1':continue
        work=artifact.get('payload',{})
        reference=work.get('package') or {}
        if reference.get('file_id')==env.get('PACKAGE_FILE_ID') and reference.get('sha256')==env['PACKAGE_SHA256']:
            matching.append(work)
    require(len(matching)==1,'CANONICAL_PACKAGE_NOT_UNIQUE');work=matching[0]
    require(work['package']['version']==env.get('PACKAGE_VERSION') and work['outbox']['key']==env['CORRELATION'],'CANONICAL_DISPATCH_MISMATCH')
    require(work['outbox'].get('execution_sha')==env['EXPECTED_COMMIT'],'CANONICAL_CODE_MISMATCH')
    raw=read_drive(session,env['PACKAGE_FILE_ID'],env['PACKAGE_VERSION'],env['PACKAGE_SHA256'])
    package=json.loads(raw)
    require(package['definition_sha256']==work['definition_sha256'] and package['role_session']==work['role_session'],'PACKAGE_CANONICAL_BINDING_MISMATCH')
    return make_capsule(package,env['PACKAGE_SHA256'])

def execute(capsule,expected_sha):
    require(sha(capsule)==expected_sha,'CAPSULE_HASH_MISMATCH')
    require(capsule.get('contract')=='NEXO_OPERATIONAL_CAPSULE_V1' and capsule.get('scope')==SCOPE,'CAPSULE_SCOPE_INVALID')
    data=base64.b64decode(capsule['input_bytes_b64'],validate=True)
    recipe=base64.b64decode(capsule['recipe_bytes_b64'],validate=True)
    require(sha(data)==capsule['input_sha256'] and sha(recipe)==capsule['recipe_sha256'],'FROZEN_BYTES_CHANGED')
    require(sha(recipe)=='17f0855b95de6d77ad9bc26ff92a05a38692b14455a022dfc34a810ef6ad96be','RECIPE_NOT_ALLOWLISTED')
    require(capsule['known_result']=={'count':3,'sum':6,'mean':2},'KNOWN_RESULT_CHANGED')
    with tempfile.TemporaryDirectory(prefix='nexo-execution-') as temp:
        root=Path(temp);(root/'recipe.py').write_bytes(recipe);(root/'input.json').write_bytes(data)
        result=subprocess.run([sys.executable,'-I','-S',str(root/'recipe.py'),str(root/'input.json'),str(root/'output.json')],
            env={'LANG':'C.UTF-8'},cwd=root,timeout=10,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        require(result.returncode==0,'RECIPE_FAILED');raw=(root/'output.json').read_bytes()
        require(len(raw)<65536,'RESULT_TOO_LARGE');numbers=json.loads(raw)
    require(set(numbers)=={'count','sum','mean'} and type(numbers['count']) is int,'RESULT_FIELDS_INVALID')
    require(all(type(numbers[k]) in (int,float) and math.isfinite(numbers[k]) for k in ('sum','mean')),'RESULT_NONFINITE')
    numbers['known_result_matched']=all(numbers[k]==v for k,v in capsule['known_result'].items())
    return dict(contract='NEXO_OPERATIONAL_RESULT_V1',scope=SCOPE,work_id=capsule['work_id'],
                package_sha256=capsule['package_sha256'],definition_sha256=capsule['definition_sha256'],
                input_sha256=capsule['input_sha256'],recipe_sha256=capsule['recipe_sha256'],
                result=numbers,result_sha256=sha(numbers),executed_at=datetime.now(timezone.utc).isoformat().replace('+00:00','Z'))

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['hydrate','execute']);p.add_argument('--input');p.add_argument('--output',required=True);p.add_argument('--sha256');a=p.parse_args()
    if a.mode=='hydrate':
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
        info=json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON'])
        creds=service_account.Credentials.from_service_account_info(info,scopes=['https://www.googleapis.com/auth/drive.readonly'])
        result=hydrate(AuthorizedSession(creds),os.environ)
    else:
        require(a.input and a.sha256,'INPUT_AND_HASH_REQUIRED')
        raw=Path(a.input).read_bytes();require(len(raw)<=MAX_BYTES,'CAPSULE_TOO_LARGE')
        result=execute(json.loads(raw),a.sha256)
    output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(canonical(result))
    if a.mode=='hydrate' and os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write('capsule_sha256='+sha(result)+'\n')
    print(json.dumps({'mode':a.mode,'sha256':sha(result),'scope':SCOPE}))

if __name__=='__main__':main()
