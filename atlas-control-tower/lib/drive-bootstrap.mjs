import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {selectGitHubToken} from './tower-github-gateway.mjs';
import {createDriveClient} from './drive-client.mjs';

const API='https://api.github.com';
const REPO='byDenoso/NEXO-Obsidian-Vault';
const REF='main';
const PREFIX='/TOWER_V06/';

function githubHeaders(token){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})};}
async function githubJson(fetchImpl,token,url,label){
  const response=await fetchImpl(url,{headers:githubHeaders(token)});
  const text=await response.text();
  let payload={};if(text){try{payload=JSON.parse(text);}catch{throw new Error(label+'_INVALID_JSON');}}
  if(!response.ok)throw new Error(label+'_HTTP_'+response.status+':'+(payload?.message||'UNKNOWN'));
  return payload;
}
async function githubTarball(fetchImpl,token,commitSha){
  const first=await fetchImpl(API+'/repos/'+REPO+'/tarball/'+commitSha,{headers:githubHeaders(token),redirect:'manual'});
  if(first.status>=300&&first.status<400){
    const location=first.headers.get('location');
    if(!location)throw new Error('GITHUB_TARBALL_REDIRECT_MISSING');
    const response=await fetchImpl(location);
    if(!response.ok)throw new Error('GITHUB_TARBALL_HTTP_'+response.status);
    return Buffer.from(await response.arrayBuffer());
  }
  if(!first.ok)throw new Error('GITHUB_TARBALL_HTTP_'+first.status);
  return Buffer.from(await first.arrayBuffer());
}
function readTarEntries(gzipBytes){
  const tar=gunzipSync(gzipBytes);
  const entries=[];
  let offset=0;
  while(offset+512<=tar.length){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0))break;
    const name=header.subarray(0,100).toString('utf8').replace(/\0.*$/s,'');
    const prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/s,'');
    const full=(prefix?prefix+'/':'')+name;
    const sizeRaw=header.subarray(124,136).toString('ascii').replace(/\0/g,'').trim();
    const size=parseInt(sizeRaw||'0',8);
    const type=String.fromCharCode(header[156]||48);
    const dataStart=offset+512;
    const dataEnd=dataStart+size;
    if(dataEnd>tar.length)throw new Error('GITHUB_TARBALL_TRUNCATED');
    if(type==='0'||type==='\0')entries.push({path:full,data:Buffer.from(tar.subarray(dataStart,dataEnd))});
    offset=dataStart+Math.ceil(size/512)*512;
  }
  return entries;
}
function towerEntries(tarball){
  const entries=readTarEntries(tarball);
  const tower=[];
  for(const entry of entries){
    const marker=entry.path.indexOf(PREFIX);
    if(marker<0)continue;
    const path=entry.path.slice(marker+PREFIX.length);
    if(path)tower.push({path,data:entry.data});
  }
  if(!tower.some(row=>row.path==='CONTROL.json'))throw new Error('GITHUB_TOWER_CONTROL_MISSING');
  if(tower.length<10)throw new Error('GITHUB_TOWER_ARCHIVE_IMPLAUSIBLY_SMALL');
  return tower;
}
function digestEntries(entries){
  const rows=entries.map(row=>[row.path,row.data.length,createHash('sha256').update(row.data).digest('hex')]).sort((a,b)=>a[0].localeCompare(b[0]));
  return 'sha256:'+createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function makeBundle(entries,{commitSha,sourceFingerprint}){
  const files={};
  for(const row of entries){
    if(row.path.endsWith('.json')){
      try{files[row.path]={encoding:'json',value:JSON.parse(row.data.toString('utf8'))};continue;}
      catch{throw new Error('TOWER_JSON_INVALID:'+row.path);}
    }
    files[row.path]={encoding:'base64',data:row.data.toString('base64')};
  }
  const payload={
    contract:'NEXO_TOWER_BUNDLE_V1',
    authority:'TOWER_V06',
    source_repository:REPO,
    source_ref:REF,
    source_commit:commitSha,
    source_fingerprint:sourceFingerprint,
    file_count:entries.length,
    files
  };
  return gzipSync(Buffer.from(JSON.stringify(payload),'utf8'),{level:9});
}
function snapshotId(commitSha){
  const stamp=new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').replace('Z','Z');
  return 'SNP-'+stamp+'-'+String(commitSha).slice(0,12);
}

export async function bootstrapDriveFromGithub({env=process.env,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('FETCH_REQUIRED');
  const token=selectGitHubToken(env);
  if(!token)throw new Error('GITHUB_CANONICAL_READ_TOKEN_NOT_CONFIGURED');
  const drive=createDriveClient({env,fetchImpl});
  if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');

  const ref=await githubJson(fetchImpl,token,API+'/repos/'+REPO+'/git/ref/heads/'+REF,'GITHUB_REF');
  const commitSha=String(ref?.object?.sha||'');
  if(!/^[0-9a-f]{40}$/i.test(commitSha))throw new Error('GITHUB_CANONICAL_COMMIT_INVALID');

  const archive=await githubTarball(fetchImpl,token,commitSha);
  const entries=towerEntries(archive);
  const sourceFingerprint=digestEntries(entries);
  const current=await drive.readPath('CURRENT.json');
  if(current?.json?.source_fingerprint===sourceFingerprint&&current?.json?.completeness==='COMPLETE_TOWER_V06'){
    return {outcome:'NO_OP',snapshot_id:current.json.snapshot_id,source_fingerprint:sourceFingerprint,files:entries.length,source_commit:commitSha};
  }

  const bundle=makeBundle(entries,{commitSha,sourceFingerprint});
  const id=snapshotId(commitSha);
  const snapshotDir='SNAPSHOTS/'+id;
  await drive.putFile(snapshotDir+'/TOWER.bundle.json.gz',bundle,{conflict:'error',mimeType:'application/gzip'});

  const bundleControl=JSON.parse(entries.find(row=>row.path==='CONTROL.json').data.toString('utf8'));
  if(bundleControl.truth_owner!=='byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06')throw new Error('DRIVE_BOOTSTRAP_CONTROL_AUTHORITY_INVALID');

  const manifest={
    contract:'NEXO_DRIVE_SNAPSHOT_V3',
    snapshot_id:id,
    source:'GITHUB_TOWER_V06_MIGRATION',
    source_repository:REPO,
    source_ref:REF,
    source_commit:commitSha,
    source_fingerprint:sourceFingerprint,
    generated_at:new Date().toISOString(),
    files:entries.length,
    source_bytes:entries.reduce((sum,row)=>sum+row.data.length,0),
    bundle_bytes:bundle.length,
    bundle_path:'TOWER.bundle.json.gz',
    authority:'TOWER_V06',
    storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06',
    immutable:true
  };
  await drive.putJson(snapshotDir+'/SNAPSHOT.json',manifest,{conflict:'error'});

  const verifyDir=await drive.resolveDirectory(snapshotDir);
  const bundleFile=verifyDir&&await drive.findChild(verifyDir.id,'TOWER.bundle.json.gz');
  if(!bundleFile)throw new Error('DRIVE_BOOTSTRAP_BUNDLE_READBACK_MISSING');
  const verifyBundle=await drive.getBuffer(bundleFile.id);
  const verifyPayload=JSON.parse(gunzipSync(verifyBundle).toString('utf8'));
  if(verifyPayload.source_fingerprint!==sourceFingerprint||verifyPayload.file_count!==entries.length)throw new Error('DRIVE_BOOTSTRAP_BUNDLE_READBACK_FAILED');

  const pointer={
    contract:'NEXO_DRIVE_CURRENT_V3',
    snapshot_id:id,
    source_commit:commitSha,
    source_fingerprint:sourceFingerprint,
    promoted_at:new Date().toISOString(),
    authority:'TOWER_V06',
    storage:'GOOGLE_DRIVE_PRIVATE',
    completeness:'COMPLETE_TOWER_V06'
  };
  await drive.putJson('CURRENT.json',pointer,{conflict:'replace'});
  return {outcome:'PROMOTED',snapshot_id:id,source_fingerprint:sourceFingerprint,files:entries.length,source_commit:commitSha,manifest,pointer};
}

export const _internal={readTarEntries,towerEntries,digestEntries,makeBundle};
