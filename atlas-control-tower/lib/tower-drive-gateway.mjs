import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createDriveClient} from './drive-client.mjs';
import {createTowerGithubGateway,resolveFrozenCapability} from './tower-github-gateway.mjs';
import {createTowerDriveLease} from './tower-drive-lease.mjs';
import {applyDriveMutationToBundle} from './tower-drive-transaction.mjs';
import {buildDriveSnapshotCandidate} from './tower-drive-writer.mjs';

const exactEntityIdFromFingerprint=fingerprint=>{
  const hex=String(fingerprint||'').replace(/^sha256:/,'');
  if(!/^[0-9a-f]{64}$/i.test(hex))throw new Error('INVALID_SCIENTIFIC_FINGERPRINT');
  return 'T-CHAT-'+hex.slice(0,12).toUpperCase();
};
const stableId=(prefix,...parts)=>prefix+'-'+createHash('sha256').update(parts.join('|')).digest('hex').slice(0,20).toUpperCase();

export function createTowerDriveGateway({env=process.env,fetchImpl=globalThis.fetch}={}){
  const drive=createDriveClient({env,fetchImpl});
  const lease=createTowerDriveLease({env,fetchImpl});
  const migrationFallback=String(env.NEXO_DRIVE_MIGRATION_FALLBACK_GITHUB||'')==='1';
  const legacy=migrationFallback?createTowerGithubGateway({env,fetchImpl}):null;
  const maintenance=createTowerGithubGateway({env,fetchImpl});
  let bundleCache=null;

  async function loadBundle({force=false}={}){
    if(!force&&bundleCache)return bundleCache;
    if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    const pointerRecord=await drive.readPath('CURRENT.json');
    const pointer=pointerRecord?.json;
    if(!pointer||pointer.completeness!=='COMPLETE_TOWER_V06'||!pointer.snapshot_id)throw new Error('DRIVE_COMPLETE_SNAPSHOT_REQUIRED');
    if(!/^[A-Za-z0-9._-]+$/.test(String(pointer.snapshot_id)))throw new Error('DRIVE_CURRENT_SNAPSHOT_ID_INVALID');
    const dir=await drive.resolveDirectory('SNAPSHOTS/'+pointer.snapshot_id);
    if(!dir)throw new Error('DRIVE_CURRENT_SNAPSHOT_MISSING');
    const file=await drive.findChild(dir.id,'TOWER.bundle.json.gz');
    if(!file)throw new Error('DRIVE_CURRENT_BUNDLE_MISSING');
    const bytes=await drive.getBuffer(file.id);
    let payload;
    try{payload=JSON.parse(gunzipSync(bytes).toString('utf8'));}catch{throw new Error('DRIVE_CURRENT_BUNDLE_INVALID');}
    if(payload?.contract!=='NEXO_TOWER_BUNDLE_V1')throw new Error('DRIVE_CURRENT_BUNDLE_CONTRACT_INVALID');
    if(payload?.authority!=='TOWER_V06')throw new Error('DRIVE_CURRENT_BUNDLE_AUTHORITY_INVALID');
    if(payload?.source_fingerprint!==pointer.source_fingerprint)throw new Error('DRIVE_CURRENT_BUNDLE_FINGERPRINT_MISMATCH');
    if(!payload.files||typeof payload.files!=='object')throw new Error('DRIVE_CURRENT_BUNDLE_FILES_INVALID');
    bundleCache={pointer,payload};
    return bundleCache;
  }
  async function promote(parent,nextPayload,{requestId=null}={}){
    const candidate=buildDriveSnapshotCandidate(nextPayload,parent,{requestId});
    const snapshotDir='SNAPSHOTS/'+candidate.snapshotId;
    await drive.putFile(snapshotDir+'/TOWER.bundle.json.gz',candidate.bytes,{conflict:'error',mimeType:'application/gzip'});
    await drive.putJson(snapshotDir+'/SNAPSHOT.json',candidate.manifest,{conflict:'error'});
    const current=await drive.readPath('CURRENT.json');
    if(!current?.json||current.json.snapshot_id!==parent.snapshot_id||current.json.source_fingerprint!==parent.source_fingerprint)throw new Error('DRIVE_CURRENT_PRECONDITION_FAILED');
    await drive.putJson('CURRENT.json',candidate.pointer,{conflict:'replace'});
    bundleCache=null;
    const verify=await loadBundle({force:true});
    if(verify.pointer.snapshot_id!==candidate.snapshotId||verify.pointer.source_fingerprint!==candidate.fingerprint)throw new Error('DRIVE_PROMOTION_READBACK_FAILED');
    return {candidate,verify};
  }
  async function readJson(relative){
    const path=String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+/, '');
    try{
      const {payload}=await loadBundle();
      const entry=payload.files[path];
      if(!entry)return null;
      if(entry.encoding!=='json')throw new Error('DRIVE_BUNDLE_ENTRY_NOT_JSON:'+path);
      return structuredClone(entry.value);
    }catch(error){
      if(legacy)return legacy.readJson(relative);
      throw error;
    }
  }
  async function listJsonDirectory(relative){
    const prefix=String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+|\/+$/g,'')+'/';
    try{
      const {payload}=await loadBundle();
      const values=[];
      for(const [path,entry] of Object.entries(payload.files)){
        if(!path.startsWith(prefix)||!path.endsWith('.json'))continue;
        const rest=path.slice(prefix.length);
        if(rest.includes('/'))continue;
        if(entry?.encoding==='json')values.push(structuredClone(entry.value));
      }
      return values;
    }catch(error){
      if(legacy)return legacy.listJsonDirectory(relative);
      throw error;
    }
  }
  async function requireJson(relative){const value=await readJson(relative);if(value===null)throw new Error('DRIVE_CANONICAL_READ_MISSING:'+relative);return value;}
  async function readEntity(kind,id){return readJson('entities/'+String(kind).toLowerCase()+'/'+id+'.json');}
  async function readReceipt(id){return readJson('mutations/receipts/'+id+'.json');}

  async function submitTowerMutation(request){
    if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    if(!lease.configured)throw new Error('DRIVE_MUTATION_LEASE_NOT_CONFIGURED');
    return lease.runExclusive(async()=>{
      bundleCache=null;
      const current=await loadBundle({force:true});
      const tx=applyDriveMutationToBundle(current.payload,request);
      if(tx.idempotent)return {request_id:request.request_id,status:'COMPLETE',receipt:tx.receipt,idempotent:true,snapshot_id:current.pointer.snapshot_id};
      const {candidate,verify}=await promote(current.pointer,tx.bundle,{requestId:request.request_id});
      const receipt=verify.payload.files['mutations/receipts/'+request.request_id+'.json']?.value;
      if(!receipt||receipt.readback!=='PASS')throw new Error('DRIVE_MUTATION_RECEIPT_READBACK_FAILED');
      return {request_id:request.request_id,status:'COMPLETE',receipt:structuredClone(receipt),idempotent:false,snapshot_id:candidate.snapshotId,source_fingerprint:candidate.fingerprint};
    },{owner:'NEXO_TOWER_MUTATION'});
  }
  async function dispatchRuntime({trigger_id,run_id,work_id,capability_id,data_bounded=false}){
    if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    if(!lease.configured)throw new Error('DRIVE_RUNTIME_LEASE_NOT_CONFIGURED');
    for(const [key,value] of Object.entries({trigger_id,run_id,work_id,capability_id}))if(!String(value||'').trim())throw new Error(key.toUpperCase()+'_REQUIRED');
    return lease.runExclusive(async()=>{
      bundleCache=null;
      const current=await loadBundle({force:true}),payload=structuredClone(current.payload);
      const path='runtime/launch/inbox/'+run_id+'.json';
      const existing=payload.files[path]?.value;
      const launch={schema_version:'1.0.0',event_type:'RUNTIME_LAUNCH_REQUESTED',trigger_id,run_id,work_id,capability_id,data_bounded:Boolean(data_bounded),storage:'GOOGLE_DRIVE_PRIVATE'};
      if(existing){
        for(const key of ['trigger_id','run_id','work_id','capability_id','data_bounded'])if(existing[key]!==launch[key])throw new Error('RUNTIME_LAUNCH_CONFLICT:'+run_id);
        return {status:'ACCEPTED',dispatch_mode:'DRIVE_LAUNCH_EVENT',trigger_id,run_id,work_id,capability_id,already_enqueued:true,snapshot_id:current.pointer.snapshot_id};
      }
      payload.files[path]={encoding:'json',value:launch};
      const {candidate}=await promote(current.pointer,payload,{requestId:'LAUNCH-'+run_id});
      return {status:'ACCEPTED',dispatch_mode:'DRIVE_LAUNCH_EVENT',trigger_id,run_id,work_id,capability_id,already_enqueued:false,snapshot_id:candidate.snapshotId};
    },{owner:'NEXO_RUNTIME_DISPATCH'});
  }

  return {
    configured:{towerWrite:Boolean(drive.configured&&lease.configured),towerStore:'GOOGLE_DRIVE',rootId:drive.rootId,migrationFallback,readMode:'COMPLETE_BUNDLE_ONLY',writeModel:'DRIVE_IMMUTABLE_SNAPSHOT_LEASED_CAS',leaseConfigured:lease.configured},
    readJson,listJsonDirectory,
    readControl:()=>requireJson('CONTROL.json'),
    readEntity,
    readActiveWorkIndex:()=>requireJson('indexes/active-work.json'),
    readRoleView:role=>requireJson('bootstrap/'+String(role).toLowerCase()+'.json'),
    readReceipt,
    readCapabilityManifest:()=>requireJson('manifests/capabilities.json'),
    readRuntimeReport:runId=>readJson('runtime/reports/'+runId+'.json'),
    readEvidence:id=>readJson('runtime/evidence/'+id+'.json'),
    readCampaignIndex:()=>requireJson('indexes/campaigns.json'),
    readInterdomainIndex:()=>requireJson('indexes/interdomain-active.json'),
    async getCurrentSnapshotMeta(){const {pointer}=await loadBundle({force:true});return {...structuredClone(pointer),writer_ready:Boolean(drive.configured&&lease.configured)};},
    submitTowerMutation,dispatchRuntime,
    cleanupMergedBranches:options=>maintenance.cleanupMergedBranches(options),
    async findByFingerprint(fingerprint,{testId}={}){const id=testId||exactEntityIdFromFingerprint(fingerprint),entity=await readEntity('test',id);if(!entity)return null;if(entity.scientific_fingerprint&&entity.scientific_fingerprint!==fingerprint)return null;return entity;},
    async persistTest(request){const result=await submitTowerMutation({...request,entity_kind:request.entity_kind||'test'});return result.receipt||result;},
    async readbackTest(testId){const entity=await readEntity('test',testId);if(!entity)throw new Error('TOWER_TEST_READBACK_MISSING');return entity;},
    async resolveCapability(spec){const frozen=resolveFrozenCapability(spec,env);if(frozen)return frozen;const requested=String(spec?.execution_capability||'').trim();if(!requested)return null;const manifest=await requireJson('manifests/capabilities.json');const item=manifest?.capabilities?.[requested];if(!item||!['ACTIVE','PROVEN','VALIDATED_CURRENT'].includes(String(item.status||'ACTIVE').toUpperCase()))return null;return {capability_id:requested,...item};},
    async dispatchTest({testId,correlationId,spec,capability}){const runId=stableId('RUN-SCI',testId,correlationId);await dispatchRuntime({trigger_id:correlationId,run_id:runId,work_id:testId,capability_id:capability?.capability_id||spec?.execution_capability||'SCIENCE',data_bounded:false});return 'drive:runtime:'+runId;},
    drive,lease
  };
}
