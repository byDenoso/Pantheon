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
  const rel=value=>String(value).replace(/^TOWER_V\\d+\\//,'').replace(/^\\/+/, '');
  let resolvedPrefix=null;
  async function towerPrefix(){
    if(resolvedPrefix)return resolvedPrefix;
    if(drive.configured){
      const pointer=await drive.readPath('CURRENT.json');
      const snapshotId=String(pointer?.json?.snapshot_id||'').trim();
      const complete=pointer?.json?.completeness==='COMPLETE_TOWER_V06';
      if(snapshotId&&complete){
        if(!/^[A-Za-z0-9._-]+$/.test(snapshotId))throw new Error('DRIVE_CURRENT_SNAPSHOT_ID_INVALID');
        resolvedPrefix='SNAPSHOTS/'+snapshotId+'/TOWER';
        return resolvedPrefix;
      }
    }
    resolvedPrefix=String(env.NEXO_DRIVE_TOWER_PREFIX||'TOWER').replace(/^\\/+|\\/+$/g,'');
    return resolvedPrefix;
  }
  const pathFor=async value=>(await towerPrefix())+'/'+rel(value);

  async function readJson(relative){
    if(!drive.configured){
      if(legacy)return legacy.readJson(relative);
      throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    }
    const record=await drive.readPath(await pathFor(relative));
    if(record)return record.json;
    if(legacy)return legacy.readJson(relative);
    return null;
  }
  async function listJsonDirectory(relative){
    if(!drive.configured){
      if(legacy)return legacy.listJsonDirectory(relative);
      throw new Error('DRIVE_PRIMARY_NOT_CONFIGURED');
    }
    const values=await drive.listJsonDirectory(await pathFor(relative));
    if(values.length||!legacy)return values;
    return legacy.listJsonDirectory(relative);
  }
  async function requireJson(relative){const value=await readJson(relative);if(value===null)throw new Error('DRIVE_CANONICAL_READ_MISSING:'+relative);return value;}
  async function readEntity(kind,id){return readJson('entities/'+String(kind).toLowerCase()+'/'+id+'.json');}
  async function readReceipt(id){return readJson('mutations/receipts/'+id+'.json');}

  async function submitTowerMutation(){
    throw new Error('DRIVE_MUTATION_ENGINE_NOT_PROMOTED');
  }
  async function dispatchRuntime(){
    throw new Error('DRIVE_RUNTIME_DISPATCH_NOT_PROMOTED');
  }

  return {
    configured:{towerWrite:false,towerStore:'GOOGLE_DRIVE',rootId:drive.rootId,migrationFallback,readMode:'COMPLETE_SNAPSHOT_ONLY'},
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
