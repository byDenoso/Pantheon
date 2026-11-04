"""Private immutable per-chunk Drive transport; fails closed, never publishes artifacts."""
import argparse, hashlib, io, json, os, re, signal, subprocess, sys, tarfile, time
from pathlib import Path
API = "https://www.googleapis.com/drive/v3/files"
SCOPE = "https://www.googleapis.com/auth/drive"
SHA = re.compile(r"[0-9a-f]{64}\Z")
ID = re.compile(r"[A-Za-z0-9_-]{10,}\Z")


class PrivateDeliveryError(Exception):
    pass


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def checked(response):
    if not 200 <= response.status_code < 300:
        raise PrivateDeliveryError("DRIVE_OPERATION_FAILED")
    return response


def metadata(session, file_id):
    if not ID.fullmatch(file_id):
        raise PrivateDeliveryError("INVALID_FILE_ID")
    value = checked(session.get(API + "/" + file_id,
        params={"fields": "id,mimeType,trashed,parents,size,driveId,ownedByMe,capabilities(canEdit)"}, timeout=60)).json()
    # My Drive only: inherited shared-drive policies need a separate review.
    if value.get("trashed") is not False or value.get("driveId"):
        raise PrivateDeliveryError("UNSUPPORTED_DESTINATION")
    return value


def permissions(session, file_id, allowed=None):
    rows, token = [], None
    while True:
        query = {"fields": "permissions(id,type,deleted),nextPageToken", "pageSize": 100}
        if token:
            query["pageToken"] = token
        value = checked(session.get(API + "/" + file_id + "/permissions", params=query, timeout=60)).json()
        rows.extend(value.get("permissions", []))
        token = value.get("nextPageToken")
        if not token:
            break
    if not rows or any(p.get("deleted") or p.get("type") not in {"user", "group"}
                       or not p.get("id") or (allowed is not None and p["id"] not in allowed) for p in rows):
        raise PrivateDeliveryError("PRIVATE_ACL_REQUIRED")
    return rows


def session_from_env():
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]), scopes=[SCOPE])
    return AuthorizedSession(creds)


MAX_ARCHIVE = 512 * 1024 * 1024
REPO = Path(__file__).resolve().parents[1]


def target(session, cfg, file_id):
    meta = metadata(session, file_id)
    permissions(session, file_id, cfg['allowed_permission_ids'])
    folder = cfg['output_folder_id']
    if metadata(session, folder).get('mimeType') != 'application/vnd.google-apps.folder':
        raise PrivateDeliveryError('FOLDER_REQUIRED')
    permissions(session, folder, cfg['allowed_permission_ids'])
    if (meta.get('capabilities', {}).get('canEdit') is not True or meta.get('parents') != [folder] or meta.get('ownedByMe') is not False
            or meta.get('mimeType', '').startswith('application/vnd.google-apps.')):
        raise PrivateDeliveryError('USER_OWNED_BINARY_REQUIRED')
    return meta


def binding(cfg):
    return {'campaign': cfg['campaign'], 'revision': cfg['revision'], 'job': os.environ['JOB']}


def unpack(raw, root, expected):
    if len(raw) > MAX_ARCHIVE:
        raise PrivateDeliveryError('ARCHIVE_TOO_LARGE')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as arc:
        members = arc.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)) or sum(m.size for m in members) > MAX_ARCHIVE:
            raise PrivateDeliveryError('ARCHIVE_INVALID')
        for m in members:
            path = Path(m.name)
            if not m.isfile() or path.is_absolute() or '..' in path.parts or not (
                m.name == 'manifest.json' or path.parts[0] in {'ckpt', 'results', 'logs'}):
                raise PrivateDeliveryError('ARCHIVE_PATH_INVALID')
        manifest = json.loads(arc.extractfile('manifest.json').read())
        if any(manifest.get(k) != v for k, v in expected.items()):
            raise PrivateDeliveryError('CHECKPOINT_BINDING_MISMATCH')
        if manifest.get('status') not in ('CHECKPOINTED', 'CONVERGED'):
            raise PrivateDeliveryError('CHECKPOINT_NOT_RESUMABLE')
        files = manifest['files']
        if set(names) != set(files) | {'manifest.json'}:
            raise PrivateDeliveryError('MANIFEST_MISMATCH')
        staged = {}
        for name, info in files.items():
            data = arc.extractfile(name).read()
            if len(data) != info['bytes'] or digest(data) != info['sha256']:
                raise PrivateDeliveryError('CHECKPOINT_HASH_MISMATCH')
            staged[name] = data
        # Validate every member before writing any state; never use extractall.
        for name, data in staged.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return manifest


def prepare(root, session):
    config_id = os.environ['NESTED_PRIVATE_CONFIG_FILE_ID']
    expected = os.environ['NESTED_PRIVATE_CONFIG_SHA256']
    if not SHA.fullmatch(expected):
        raise PrivateDeliveryError('CONFIG_HASH_REQUIRED')
    metadata(session, config_id)
    permissions(session, config_id)
    raw = checked(session.get(API+'/'+config_id, params={'alt':'media'}, timeout=60)).content
    if len(raw) > 65536 or digest(raw) != expected:
        raise PrivateDeliveryError('CONFIG_BINDING_FAILED')
    cfg = json.loads(raw)
    if (cfg.get('schema') != 'NEXO_NESTED_PRIVATE_V1' or not cfg.get('campaign')
            or cfg.get('revision') != os.environ['GITHUB_SHA']
            or not cfg.get('allowed_permission_ids')):
        raise PrivateDeliveryError('CONFIG_INVALID')
    permissions(session, config_id, cfg['allowed_permission_ids'])
    chunk = int(os.environ['CHUNK'])
    slots = cfg['slots'][os.environ['JOB']]
    if chunk < 0 or chunk >= len(slots) or len(set(slots)) != len(slots):
        raise PrivateDeliveryError('EXCLUSIVE_CHUNK_SLOT_REQUIRED')
    all_ids = [x for values in cfg['slots'].values() for x in values]
    if len(all_ids) != len(set(all_ids)):
        raise PrivateDeliveryError('SLOT_REUSED_ACROSS_LEGS')
    if int(target(session, cfg, slots[chunk]).get('size', -1)) != 0:
        raise PrivateDeliveryError('IMMUTABLE_SLOT_ALREADY_WRITTEN')
    if chunk:
        old = target(session, cfg, slots[chunk-1])
        if not 0 < int(old.get('size', 0)) <= MAX_ARCHIVE:
            raise PrivateDeliveryError('PREVIOUS_CHUNK_MISSING')
        payload = checked(session.get(API+'/'+slots[chunk-1], params={'alt':'media'}, timeout=180)).content
        unpack(payload, root, dict(binding(cfg), chunk=chunk-1))
        if not list((root/'ckpt').glob('*.save')):
            raise PrivateDeliveryError('SAMPLER_CHECKPOINT_REQUIRED')
    (root/'config.json').write_bytes(raw)


def invoke_private(args, *, timeout, check=False, **kwargs):
    # Timeout must terminate the worker pool too before archival can begin.
    with subprocess.Popen(args, start_new_session=True, **kwargs) as proc:
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            raise
        return subprocess.CompletedProcess(args, proc.returncode)


def execute(root, invoke=invoke_private):
    cfg = json.loads((root/'config.json').read_text())
    job = os.environ['JOB']
    stack, model, seed = job.split('-')
    if stack != 'S1' or model not in {'LCDM','P1','P3'} or seed not in {'s0','s1'}:
        raise PrivateDeliveryError('JOB_INVALID')
    env = {'PATH':os.defpath, 'HOME':str(root), 'LANG':'C.UTF-8',
           'OMP_NUM_THREADS':'1', 'OPENBLAS_NUM_THREADS':'1'}
    logs = root/'logs'; logs.mkdir(exist_ok=True)
    chunk = int(os.environ['CHUNK'])
    with (logs/f'chunk-{chunk}.log').open('wb') as log:
        if chunk == 0:
            rc = invoke([sys.executable, str(REPO/'code/smoke_point.py'), 'S1', '--models', model, '--tol','1e-3'],
                        cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=1800, check=False).returncode
            smoke = REPO/'results/smoke_S1.json'
            if smoke.exists():
                (root/'results').mkdir(exist_ok=True)
                (root/'results/smoke_S1.json').write_bytes(smoke.read_bytes())
            if rc:
                (root/'execution.json').write_text(json.dumps({'rc':rc,'status':'FAILED'}))
                raise PrivateDeliveryError('SMOKE_FAILED')
        hours = max(0.01, 5.2-(time.time()-float(os.environ['JOB_T0']))/3600)
        try:
            rc = invoke([sys.executable, str(REPO/'code/run_n2.py'), '--stack',stack,'--model',model,
                '--seedidx',seed[1:],'--njobs','4','--max-hours',str(hours),'--chunk-iter','8','--outroot',str(root)],
                cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=hours*3600+300, check=False).returncode
        except subprocess.TimeoutExpired:
            rc = 124
    status = {0:'CONVERGED',3:'CHECKPOINTED'}.get(rc,'FAILED')
    (root/'execution.json').write_text(json.dumps({'rc':rc,'status':status}))
    if rc not in (0,3):
        raise PrivateDeliveryError('COMPUTE_FAILED')


def upload(root, session):
    cfg = json.loads((root/'config.json').read_text())
    chunk = int(os.environ['CHUNK']); slots = cfg['slots'][os.environ['JOB']]
    state = json.loads((root/'execution.json').read_text()) if (root/'execution.json').exists() else {'status':'FAILED'}
    paths = [p for folder in ('ckpt','results','logs') for p in (root/folder).glob('**/*') if p.is_file()]
    files = {str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':digest(p.read_bytes())} for p in paths}
    manifest = dict(binding(cfg), chunk=chunk, status=state['status'], files=files)
    (root/'manifest.json').write_text(json.dumps(manifest, sort_keys=True))
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf,mode='w:gz') as arc:
        for p in paths+[root/'manifest.json']:
            arc.add(p, arcname=str(p.relative_to(root)), recursive=False)
    payload = buf.getvalue()
    if len(payload) > MAX_ARCHIVE:
        raise PrivateDeliveryError('ARCHIVE_TOO_LARGE')
    file_id = slots[chunk]
    if int(target(session,cfg,file_id).get('size',-1)) != 0:
        raise PrivateDeliveryError('IMMUTABLE_SLOT_ALREADY_WRITTEN')
    # One attempt only. An uncertain upload is reconciled by readback, never replay.
    try:
        checked(session.patch('https://www.googleapis.com/upload/drive/v3/files/'+file_id,
            params={'uploadType':'media'},headers={'Content-Type':'application/gzip'}, data=payload,timeout=180))
    except Exception:
        pass
    meta = target(session,cfg,file_id)
    actual = checked(session.get(API+'/'+file_id,params={'alt':'media'},timeout=180)).content
    if int(meta.get('size',-1)) != len(payload) or digest(actual) != digest(payload):
        raise PrivateDeliveryError('PRIVATE_READBACK_FAILED')
    next_ready = chunk+1 < len(slots) and int(target(session,cfg,slots[chunk+1]).get('size',-1)) == 0
    with open(os.environ['GITHUB_OUTPUT'],'a') as f:
        f.write('continue='+str(state['status']=='CHECKPOINTED' and next_ready).lower()+'\n')
    (root/'delivery.json').write_text(json.dumps({'verified':True,'bytes':len(payload),'sha256':digest(payload)}))
    if state['status']=='CHECKPOINTED' and not next_ready:
        raise PrivateDeliveryError('NEXT_PRIVATE_SLOT_REQUIRED')


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('action',choices=['prepare','execute','upload'])
    action=parser.parse_args().action
    os.umask(0o077)
    root=Path(os.environ['RUNNER_TEMP'])/'nested-private'; root.mkdir(mode=0o700,exist_ok=True)
    try:
        if action=='execute': execute(root)
        else: globals()[action](root,session_from_env())
    except Exception:
        print('STATUS FAILED'); return 1
    print('STATUS '+{'prepare':'PREPARED','execute':'CHUNK_FINISHED','upload':'PRIVATE_READBACK_VERIFIED'}[action]); return 0

if __name__=='__main__':
    raise SystemExit(main())
