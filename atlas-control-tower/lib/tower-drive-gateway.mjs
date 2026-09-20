import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
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
  let bundleCache=null;

  async function loadBundle(){
    if(bundleCache)return bundleCache;
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

  async function readJson(relative){
    const path=String(relative).replace(/^TOWER_V\d+\//,'').replace(/^\/+/, '');
    try{
      const {payload}=await loadBundle();
      const entry=payload.files[path];
      if(!entry)return null;
      if(entry.encoding!=='json')throw new Error('DRIVE_BUNDLE_ENTRY_NOT_JSON:'+path);
      return entry.value;
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
        if(entry?.encoding==='json')values.push(entry.value);
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

  async function submitTowerMutation(){throw new Error('DRIVE_MUTATION_ENGINE_NOT_PROMOTED');}
  async function dispatchRuntime(){throw new Error('DRIVE_RUNTIME_DISPATCH_NOT_PROMOTED');}

  return {
    configured:{towerWrite:false,towerStore:'GOOGLE_DRIVE',rootId:drive.rootId,migrationFallback,readMode:'COMPLETE_BUNDLE_ONLY'},
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
