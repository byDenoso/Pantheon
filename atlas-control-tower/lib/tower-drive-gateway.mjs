import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createDriveClient} from './drive-client.mjs';
import {createTowerGithubGateway,resolveFrozenCapability} from './tower-github-gateway.mjs';
import {applyDriveMutationToBundle} from './tower-drive-transaction.mjs';
import {buildDriveSnapshotCandidate} from './tower-drive-writer.mjs';
import {deriveRoleView} from './tower-role-view.mjs';

const exactEntityIdFromFingerprint=fingerprint=>{
  const hex=String(fingerprint||'').replace(/^sha256:/,'');
  if(!/^[0-9a-f]{64}$/i.test(hex))throw new Error('INVALID_SCIENTIFIC_FINGERPRINT');
  return 'T-CHAT-'+hex.slice(0,12).toUpperCase();
};
const stableId=(prefix,...parts)=>prefix+'-'+createHash('sha256').update(parts.join('|')).digest('hex').slice(0,20).toUpperCase();

export function createTowerDriveGateway({env=process.env,fetchImpl=globalThis.fetch}={}){
  const drive=createDriveClient({env,fetchImpl});
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

  async function submitTowerMutation(){
    throw new Error('DRIVE_V2_CORE_DIRECT_ONLY');
  }
  async function dispatchRuntime(){
    throw new Error('DRIVE_V2_CORE_DIRECT_ONLY');
  }

  return {
    configured:{towerWrite:false,towerStore:'GOOGLE_DRIVE',rootId:drive.rootId,migrationFallback,readMode:'COMPLETE_BUNDLE_ONLY',writeModel:'DRIVE_IMMUTABLE_SNAPSHOT_SINGLE_WRITER_CURRENT',leaseConfigured:false,writerRole:'CHATGPT_CORE_DIRECT_ONLY'},
    readJson,listJsonDirectory,
    readControl:()=>requireJson('CONTROL.json'),
    readEntity,
    readActiveWorkIndex:()=>requireJson('indexes/active-work.json'),
    async readRoleView(role){const [control,activeWork,manifest]=await Promise.all([requireJson('CONTROL.json'),requireJson('indexes/active-work.json'),requireJson('manifests/capabilities.json')]);return deriveRoleView({role,control:{...control,event_cursor:(await requireJson('snapshot/latest.json')).event_cursor},activeWork,capabilities:manifest?.capabilities||{}});},
    readReceipt,
    readCapabilityManifest:()=>requireJson('manifests/capabilities.json'),
    readRuntimeReport:runId=>readJson('runtime/reports/'+runId+'.json'),
    readEvidence:id=>readJson('runtime/evidence/'+id+'.json'),
    readCampaignIndex:()=>requireJson('indexes/campaigns.json'),
    readInterdomainIndex:()=>requireJson('indexes/interdomain-active.json'),
    async getCurrentSnapshotMeta(){const {pointer}=await loadBundle({force:true});return {...structuredClone(pointer),writer_ready:false,write_model:'DRIVE_IMMUTABLE_SNAPSHOT_SINGLE_WRITER_CURRENT',writer_role:'CHATGPT_CORE_DIRECT_ONLY'};},
    submitTowerMutation,dispatchRuntime,
    cleanupMergedBranches:options=>maintenance.cleanupMergedBranches(options),
    async findByFingerprint(fingerprint,{testId}={}){const id=testId||exactEntityIdFromFingerprint(fingerprint),entity=await readEntity('test',id);if(!entity)return null;if(entity.scientific_fingerprint&&entity.scientific_fingerprint!==fingerprint)return null;return entity;},
    async persistTest(request){const result=await submitTowerMutation({...request,entity_kind:request.entity_kind||'test'});return result.receipt||result;},
    async readbackTest(testId){const entity=await readEntity('test',testId);if(!entity)throw new Error('TOWER_TEST_READBACK_MISSING');return entity;},
    async resolveCapability(spec){const frozen=resolveFrozenCapability(spec,env);if(frozen)return frozen;const requested=String(spec?.execution_capability||'').trim();if(!requested)return null;const manifest=await requireJson('manifests/capabilities.json');const item=manifest?.capabilities?.[requested];if(!item||!['ACTIVE','PROVEN','VALIDATED_CURRENT'].includes(String(item.status||'ACTIVE').toUpperCase()))return null;return {capability_id:requested,...item};},
    async dispatchTest({testId,correlationId,spec,capability}){const runId=stableId('RUN-SCI',testId,correlationId);await dispatchRuntime({trigger_id:correlationId,run_id:runId,work_id:testId,capability_id:capability?.capability_id||spec?.execution_capability||'SCIENCE',data_bounded:false});return 'drive:runtime:'+runId;},
    drive,lease:null
  };
}
