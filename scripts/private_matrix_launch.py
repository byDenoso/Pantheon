"""Generic private capsule loader. Captures ALL private process output.

No model, priors, data, checkpoint IDs or credentials are embedded in this file.
The operator supplies a reviewed SHA-bound private launch request. Merge and
workflow dispatch are independent actions; this file does neither.
"""
import hashlib,io,json,os,re,subprocess,sys,tarfile
from pathlib import Path,PurePosixPath
MAX_CAPSULE=16*1024*1024

def need(ok):
    if not ok:raise ValueError('private launch validation failed')
def digest(data):return hashlib.sha256(data).hexdigest()
def get(session,ref,max_bytes=MAX_CAPSULE):
    need(isinstance(ref,dict)and re.fullmatch(r'[A-Za-z0-9_-]{10,200}',ref.get('id',''))and re.fullmatch(r'[0-9a-f]{64}',ref.get('sha256','')))
    response=session.get('https://www.googleapis.com/drive/v3/files/'+ref['id'],params={'alt':'media'},timeout=120,stream=True)
    response.raise_for_status();parts=[];total=0
    for chunk in response.iter_content(1024*1024):
        total+=len(chunk);need(total<=max_bytes);parts.append(chunk)
    data=b''.join(parts);need(digest(data)==ref['sha256']);return data

def extract_capsule(data,destination):
    root=Path(destination);need(not root.exists());root.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz')as archive:
        members=archive.getmembers();need(0<len(members)<=200 and sum(m.size for m in members)<=MAX_CAPSULE)
        seen=set()
        for item in members:
            path=PurePosixPath(item.name);need(item.isfile()and not path.is_absolute()and '..'not in path.parts and '\\'not in item.name and str(path)==item.name and item.name not in seen)
            seen.add(item.name);target=root.joinpath(*path.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.extractfile(item).read())
    manifest=json.loads((root/'capsule_manifest.json').read_text());need(manifest['schema']=='nexo.private.capsule.v1')
    files=manifest['files'];need(set(files)==seen-{'capsule_manifest.json'})
    for name,sha in files.items():need(digest((root/name).read_bytes())==sha)
    entry=manifest['entrypoint'];need(entry in files and entry.endswith('.py'))
    return root/entry

def validate_request(request,campaign,model,replica):
    need(request.get('schema')=='nexo.private.b6.launch.v1')
    need(request.get('campaign')==campaign=='B6' and request.get('model')==model and model in ('peer','lcdm'))
    need(type(request.get('replica'))is int and request.get('replica')==replica and replica in (1,2))
    need(request.get('execution_class')=='NORMAL_NESTED')
    acceptance=request.get('numerical_acceptance',{})
    need(acceptance.get('historical_gate_passed')is False and acceptance.get('user_accepted_current_configuration')is True)
    need(request.get('registry_execution_authorized')is True and request.get('private_publication_authorized')is True)

def main():
    os.umask(0o077)
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds=service_account.Credentials.from_service_account_info(json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']),scopes=['https://www.googleapis.com/auth/drive'])
    session=AuthorizedSession(creds)
    raw=get(session,{'id':os.environ['MANIFEST_ID'],'sha256':os.environ['MANIFEST_SHA256']})
    request=json.loads(raw);validate_request(request,os.environ['CAMPAIGN'],os.environ['MODEL'],int(os.environ['REPLICA']))
    folder=Path(os.environ['RUNNER_TEMP'])/'private-b6-launch';entry=extract_capsule(get(session,request['capsule']),folder)
    private_request=folder/'launch_request.json';private_request.write_bytes(raw)
    # Captures stdout AND stderr, including upstream tracebacks with parameters.
    with (folder/'private_execution.log').open('wb')as log:
        completed=subprocess.run([sys.executable,str(entry),'--request',str(private_request)],stdout=log,stderr=log,check=False)
    need(completed.returncode in (0,75))
    # Capsule must have already verified private snapshot readback.
    receipt=json.loads((folder/'launch_receipt.json').read_text())
    need(receipt['request_sha256']==digest(raw) and receipt['private_snapshot_readback']is True)
    status=receipt['status'];need(status in ('INITIALIZING','RUNNING','CONVERGED','BUDGET_EXHAUSTED'))
    print('STATUS '+status)

if __name__=='__main__':
    try:main()
    except BaseException:
        print('STATUS LAUNCH_FAILED');sys.exit(1)
