import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createDriveClient} from './drive-client.mjs';
import {createTowerGithubGateway,resolveFrozenCapability} from './tower-github-gateway.mjs';
import {isCurrentTowerBundlePath,towerBundlePathRole} from './tower-drive-writer.mjs';
import {deriveRoleView} from './tower-role-view.mjs';

const LIVE_TOWER_FILE='NEXO_TOWER_LIVE.json.gz';
const LIVE_CACHE_TTL_MS=5000;
const SHA256=/^sha256:[0-9a-f]{64}$/i;

const exactEntityIdFromFingerprint=fingerprint=>{
  const hex=String(fingerprint||'').replace(/^sha256:/,'');
  if(!/^[0-9a-f]{64}$/i.test(hex))throw new Error('INVALID_SCIENTIFIC_FINGERPRINT');
  return 'T-CHAT-'+hex.slice(0,12).toUpperCase();
};
const stableId=(prefix,...parts)=>prefix+'-'+createHash('sha256').update(parts.join('|')).digest('hex').slice(0,20).toUpperCase();

export function createTowerDriveGateway({env=process.env,fetchImpl=globalThis.fetch,driveClient=null}={}){
  const drive=driveClient||createDriveClient({env,fetchImpl});
  const maintenance=createTowerGithubGateway({env,fetchImpl});
  let bundleCache=null;
  let bundleLoad=null;

  async function loadBundle({force=false}={}){
    if(!force&&bundleCache&&Date.now()-bundleCache.loadedAt<LIVE_CACHE_TTL_MS)return bundleCache;
    if(bundleLoad){
      if(!force)return bundleLoad;
      await bundleLoad.catch(()=>{});
    }
    bundleLoad=(async()=>{
    if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    const file=await drive.findChild(drive.rootId,LIVE_TOWER_FILE);
    if(!file)throw new Error('DRIVE_LIVE_TOWER_FILE_MISSING');
    const bytes=await drive.getBuffer(file.id);
    let payload;
    try{payload=JSON.parse(gunzipSync(bytes).toString('utf8'));}catch{throw new Error('DRIVE_LIVE_TOWER_FILE_INVALID');}
    if(payload?.contract!=='NEXO_TOWER_LIVE_V1')throw new Error('DRIVE_LIVE_TOWER_CONTRACT_INVALID');
    if(payload?.authority!=='TOWER_V06')throw new Error('DRIVE_LIVE_TOWER_AUTHORITY_INVALID');
    if(payload?.truth_owner!=='TOWER_V06@GOOGLE_DRIVE_PRIVATE'||payload?.storage!=='GOOGLE_DRIVE_PRIVATE')throw new Error('DRIVE_LIVE_TOWER_TRUTH_OWNER_INVALID');
    if(payload?.write_model!=='IN_PLACE_FILE_REVISION_CAS_READBACK')throw new Error('DRIVE_LIVE_TOWER_WRITE_MODEL_INVALID');
    if(payload?.stable_file_id!==file.id)throw new Error('DRIVE_LIVE_TOWER_FILE_ID_MISMATCH');
    if(!SHA256.test(String(payload?.revision||''))||payload.revision!==payload.state_fingerprint)throw new Error('DRIVE_LIVE_TOWER_REVISION_INVALID');
    if(!payload.files||typeof payload.files!=='object'||Array.isArray(payload.files))throw new Error('DRIVE_LIVE_TOWER_FILES_INVALID');
    const control=payload.files['CONTROL.json']?.value;
    if(payload.files['CONTROL.json']?.encoding!=='json'||control?.truth_owner!=='TOWER_V06@GOOGLE_DRIVE_PRIVATE'||control?.write_model!==payload.write_model||control?.cutover_state!=='DRIVE_PRIMARY_ACTIVE__GIT_CODE_PROVENANCE_ONLY')throw new Error('DRIVE_LIVE_TOWER_CONTROL_MISMATCH');
    const pointer={contract:payload.contract,snapshot_id:null,revision:payload.revision,state_fingerprint:payload.state_fingerprint,source_fingerprint:payload.state_fingerprint,updated_at:payload.updated_at,file_count:payload.file_count,stable_file_id:payload.stable_file_id,authority:payload.authority,storage:payload.storage,truth_owner:payload.truth_owner,completeness:'LIVE_TOWER_V06'};
    bundleCache={pointer,payload,loadedAt:Date.now()};
    return bundleCache;
    })();
    try{return await bundleLoad;}finally{bundleLoad=null;}
  }
  async function readJson(relative){
    const path=String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+/, '');
    try{
      const {payload}=await loadBundle();
      const entry=payload.files[path];
      if(!entry)return null;
      if(!isCurrentTowerBundlePath(path,payload))return null;
      if(entry.encoding!=='json')throw new Error('DRIVE_BUNDLE_ENTRY_NOT_JSON:'+path);
      return structuredClone(entry.value);
    }catch(error){throw error;}
  }
  async function listJsonDirectory(relative){
    const prefix=String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+|\/+$/g,'')+'/';
    try{
      const {payload}=await loadBundle();
      const values=[];
      for(const [path,entry] of Object.entries(payload.files)){
        if(!path.startsWith(prefix)||!path.endsWith('.json'))continue;
        if(!isCurrentTowerBundlePath(path,payload))continue;
        const rest=path.slice(prefix.length);
        if(rest.includes('/'))continue;
        if(entry?.encoding==='json')values.push(structuredClone(entry.value));
      }
      return values;
    }catch(error){throw error;}
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
    configured:{towerWrite:false,towerStore:'GOOGLE_DRIVE_PRIVATE',rootId:drive.rootId,migrationFallback:false,readMode:'LIVE_STABLE_FILE_REVISION',writeModel:'IN_PLACE_FILE_REVISION_CAS_READBACK',leaseConfigured:false,writerRole:'CHATGPT_CORE_DIRECT_ONLY'},
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
    async getCurrentSnapshotMeta(){const {pointer,payload}=await loadBundle();return {...structuredClone(pointer),writer_ready:false,write_model:'IN_PLACE_FILE_REVISION_CAS_READBACK',writer_role:'CHATGPT_RUNTIME_STATELESS_EXECUTOR',derived_stale_policy:payload.derived_stale_policy||'HISTORICAL_ONLY__NEVER_CURRENT_INPUT',derived_stale_allowed_prefixes:payload.derived_stale_allowed_prefixes||['projections/public/']};},
    classifyBundlePath:relative=>towerBundlePathRole(String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+/,'')),
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
