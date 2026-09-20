import {createHash} from 'node:crypto';
import {createDriveClient} from './drive-client.mjs';
import {createTowerGithubGateway} from './tower-github-gateway.mjs';

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
  const towerPrefix=String(env.NEXO_DRIVE_TOWER_PREFIX||'TOWER').replace(/^\/+|\/+$/g,'');

  const rel=value=>String(value).replace(/^TOWER_V\d+\//,'').replace(/^\/+/, '');
  const pathFor=value=>towerPrefix+'/'+rel(value);

  async function readJson(relative){
    if(!drive.configured){
      if(legacy)return legacy.readJson(relative);
      throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    }
    const record=await drive.readPath(pathFor(relative));
    if(record)return record.json;
    if(legacy)return legacy.readJson(relative);
    return null;
  }
  async function listJsonDirectory(relative){
    if(!drive.configured){
      if(legacy)return legacy.listJsonDirectory(relative);
      throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    }
    const values=await drive.listJsonDirectory(pathFor(relative));
    if(values.length||!legacy)return values;
    return legacy.listJsonDirectory(relative);
  }
  async function requireJson(relative){const value=await readJson(relative);if(value===null)throw new Error('DRIVE_CANONICAL_READ_MISSING:'+relative);return value;}
  async function readEntity(kind,id){return readJson('entities/'+String(kind).toLowerCase()+'/'+id+'.json');}
  async function readReceipt(id){return readJson('mutations/receipts/'+id+'.json');}

  async function submitTowerMutation(request){
    if(!drive.configured)throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    if(!request?.request_id||!request?.entity_name||!request?.entity_kind)throw new Error('INVALID_TOWER_MUTATION');
    const existing=await readReceipt(request.request_id);
    if(existing)return {request_id:request.request_id,status:'COMPLETE',receipt:existing};
    await drive.putJson(pathFor('mutations/inbox/'+request.request_id+'.json'),request,{conflict:'idempotent'});
    return {request_id:request.request_id,status:'PENDING',receipt:null,storage:'DRIVE'};
  }
  async function dispatchRuntime({trigger_id,run_id,work_id,capability_id,data_bounded=false}){
    for(const [key,value] of Object.entries({trigger_id,run_id,work_id,capability_id}))if(!String(value||'').trim())throw new Error(key.toUpperCase()+'_REQUIRED');
    const launch={schema_version:'1.0.0',event_type:'RUNTIME_LAUNCH_REQUESTED',trigger_id,run_id,work_id,capability_id,data_bounded:Boolean(data_bounded),storage:'DRIVE'};
    await drive.putJson(pathFor('runtime/launch/inbox/'+run_id+'.json'),launch,{conflict:'idempotent'});
    return {status:'ACCEPTED',dispatch_mode:'DRIVE_LAUNCH_EVENT',trigger_id,run_id,work_id,capability_id,already_enqueued:false};
  }

  return {
    configured:{towerWrite:drive.configured,towerStore:'GOOGLE_DRIVE',rootId:drive.rootId,migrationFallback},
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
    submitTowerMutation,dispatchRuntime,
    async cleanupMergedBranches(options={}){if(!legacy)throw new Error('GITHUB_MAINTENANCE_GATEWAY_DISABLED');return legacy.cleanupMergedBranches(options);},
    async findByFingerprint(fingerprint,{testId}={}){const id=testId||exactEntityIdFromFingerprint(fingerprint),entity=await readEntity('test',id);if(!entity)return null;if(entity.scientific_fingerprint&&entity.scientific_fingerprint!==fingerprint)return null;return entity;},
    async persistTest(request){const result=await submitTowerMutation({...request,entity_kind:request.entity_kind||'test'});return result.receipt||result;},
    async readbackTest(testId){const entity=await readEntity('test',testId);if(!entity)throw new Error('TOWER_TEST_READBACK_MISSING');return entity;},
    async resolveCapability(spec){if(legacy)return legacy.resolveCapability(spec);const requested=String(spec?.execution_capability||'').trim();return requested?{capability_id:requested}:null;},
    async dispatchTest({testId,correlationId,spec,capability}){const runId=stableId('RUN-SCI',testId,correlationId);await dispatchRuntime({trigger_id:correlationId,run_id:runId,work_id:testId,capability_id:capability?.capability_id||spec?.execution_capability||'SCIENCE',data_bounded:false});return 'drive:runtime:'+runId;},
    drive
  };
}
