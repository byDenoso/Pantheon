import {createHash} from 'node:crypto';
import {selectGitHubToken} from './tower-github-gateway.mjs';
import {createDriveClient} from './drive-client.mjs';

const API='https://api.github.com';
const REPO='byDenoso/NEXO-Obsidian-Vault';
const REF='main';
const PREFIX='TOWER_V06/';

function githubHeaders(token){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})};}
async function githubJson(fetchImpl,token,url,label){
  const response=await fetchImpl(url,{headers:githubHeaders(token)});
  const text=await response.text();
  let payload={};if(text){try{payload=JSON.parse(text);}catch{throw new Error(label+'_INVALID_JSON');}}
  if(!response.ok)throw new Error(label+'_HTTP_'+response.status+':'+(payload?.message||'UNKNOWN'));
  return payload;
}
function fingerprint(files){
  const rows=[...files].sort((a,b)=>a.path.localeCompare(b.path)).map(row=>[row.path,row.sha,row.size]);
  return 'sha256:'+createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function snapshotId(commitSha){
  const stamp=new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','Z');
  return 'SNP-'+stamp+'-'+String(commitSha).slice(0,12);
}
function mimeType(path){
  if(path.endsWith('.json'))return 'application/json';
  if(path.endsWith('.md'))return 'text/markdown; charset=utf-8';
  if(path.endsWith('.txt'))return 'text/plain; charset=utf-8';
  if(path.endsWith('.py'))return 'text/x-python; charset=utf-8';
  if(path.endsWith('.js')||path.endsWith('.mjs'))return 'text/javascript; charset=utf-8';
  if(path.endsWith('.yml')||path.endsWith('.yaml'))return 'text/yaml; charset=utf-8';
  if(path.endsWith('.csv'))return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
}
async function canonicalTree(fetchImpl,token){
  const ref=await githubJson(fetchImpl,token,API+'/repos/'+REPO+'/git/ref/heads/'+REF,'GITHUB_REF');
  const commitSha=String(ref?.object?.sha||'');
  if(!/^[0-9a-f]{40}$/i.test(commitSha))throw new Error('GITHUB_CANONICAL_COMMIT_INVALID');
  const commit=await githubJson(fetchImpl,token,API+'/repos/'+REPO+'/git/commits/'+commitSha,'GITHUB_COMMIT');
  const treeSha=String(commit?.tree?.sha||'');
  if(!/^[0-9a-f]{40}$/i.test(treeSha))throw new Error('GITHUB_CANONICAL_TREE_INVALID');
  const tree=await githubJson(fetchImpl,token,API+'/repos/'+REPO+'/git/trees/'+treeSha+'?recursive=1','GITHUB_TREE');
  if(tree?.truncated)throw new Error('GITHUB_TOWER_TREE_TRUNCATED');
  const files=(Array.isArray(tree?.tree)?tree.tree:[])
    .filter(row=>row?.type==='blob'&&String(row.path||'').startsWith(PREFIX))
    .map(row=>({path:String(row.path).slice(PREFIX.length),sha:String(row.sha),size:Number(row.size||0)}))
    .filter(row=>row.path);
  if(!files.some(row=>row.path==='CONTROL.json'))throw new Error('GITHUB_TOWER_CONTROL_MISSING');
  if(files.length<10)throw new Error('GITHUB_TOWER_TREE_IMPLAUSIBLY_SMALL');
  return {commitSha,treeSha,files};
}
async function blobBytes(fetchImpl,token,sha){
  const payload=await githubJson(fetchImpl,token,API+'/repos/'+REPO+'/git/blobs/'+sha,'GITHUB_BLOB');
  if(payload?.encoding!=='base64'||typeof payload?.content!=='string')throw new Error('GITHUB_BLOB_ENCODING_UNSUPPORTED:'+sha);
  return Buffer.from(payload.content.replace(/\n/g,''),'base64');
}

export async function bootstrapDriveFromGithub({env=process.env,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
  const token=selectGitHubToken(env);
  if(!token)throw new Error('GITHUB_CANONICAL_READ_TOKEN_NOT_CONFIGURED');
  const drive=createDriveClient({env,fetchImpl});
  if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');

  const source=await canonicalTree(fetchImpl,token);
  const sourceFingerprint=fingerprint(source.files);
  const current=await drive.readPath('CURRENT.json');
  if(current?.json?.source_fingerprint===sourceFingerprint&&current?.json?.completeness==='COMPLETE_TOWER_V06'){
    return {outcome:'NO_OP',snapshot_id:current.json.snapshot_id,source_fingerprint:sourceFingerprint,files:source.files.length,source_commit:source.commitSha};
  }

  const id=snapshotId(source.commitSha);
  const base='SNAPSHOTS/'+id+'/TOWER';
  let written=0;
  for(const row of source.files){
    const bytes=await blobBytes(fetchImpl,token,row.sha);
    if(bytes.length!==row.size)throw new Error('GITHUB_BLOB_SIZE_MISMATCH:'+row.path);
    await drive.putFile(base+'/'+row.path,bytes,{conflict:'error',mimeType:mimeType(row.path)});
    written+=1;
  }
  if(written!==source.files.length)throw new Error('DRIVE_SNAPSHOT_FILE_COUNT_MISMATCH');

  const manifest={
    contract:'NEXO_DRIVE_SNAPSHOT_V2',
    snapshot_id:id,
    source:'GITHUB_TOWER_V06_MIGRATION',
    source_repository:REPO,
    source_ref:REF,
    source_commit:source.commitSha,
    source_tree_sha:source.treeSha,
    source_fingerprint:sourceFingerprint,
    generated_at:new Date().toISOString(),
    files:source.files.length,
    written_files:written,
    authority:'TOWER_V06',
    storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06',
    immutable:true
  };
  await drive.putJson('SNAPSHOTS/'+id+'/SNAPSHOT.json',manifest,{conflict:'error'});

  const control=await drive.readPath(base+'/CONTROL.json');
  if(!control?.json||control.json.truth_owner!=='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06')throw new Error('DRIVE_BOOTSTRAP_CONTROL_READBACK_FAILED');

  const pointer={
    contract:'NEXO_DRIVE_CURRENT_V2',
    snapshot_id:id,
    source_commit:source.commitSha,
    source_tree_sha:source.treeSha,
    source_fingerprint:sourceFingerprint,
    promoted_at:new Date().toISOString(),
    authority:'TOWER_V06',
    storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06'
  };
  await drive.putJson('CURRENT.json',pointer,{conflict:'replace'});
  return {outcome:'PROMOTED',snapshot_id:id,source_fingerprint:sourceFingerprint,files:source.files.length,source_commit:source.commitSha,manifest,pointer};
}

export const _internal={canonicalTree,fingerprint,mimeType};
