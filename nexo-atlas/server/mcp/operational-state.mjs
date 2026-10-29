import {createHash} from 'node:crypto';
export const TOWER_ID='1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z';

const SCIENTIFIC_TEST_PREFIX='entities/test/';
const SCIENTIFIC_WORK_PREFIX='entities/work/';
const SAFE_REASON=/^[A-Z][A-Z0-9_]{1,79}$/;
const PRIVATE_MARKER=/^(?:OLYMPUS|OLY|CLIENT|PERSON|PRIVATE)(?:[-_:]|$)/i;
const privateScientificRecord=(path,value)=>{
  const domain=String(value?.domain||value?.semantic?.domain_id||'').toUpperCase();
  const privatePath=String(path||'').split('/').some(segment=>
    PRIVATE_MARKER.test(segment.replace(/\.json$/i,'')));
  const identifiers=['id','test_id','work_id','roadmap_id','campaign_id','client_id','person_id'];
  const semanticIdentifiers=['domain_id','topic_id','subdomain_id'];
  const privateIdentifier=identifiers.some(key=>PRIVATE_MARKER.test(String(value?.[key]||'')))||
    semanticIdentifiers.some(key=>PRIVATE_MARKER.test(String(value?.semantic?.[key]||'')));
  return value?.private===true||String(value?.visibility||'').toUpperCase()==='PRIVATE'||
    String(value?.semantic?.visibility||'').toUpperCase()==='PRIVATE'||domain==='OLYMPUS'||
    String(value?.semantic?.domain_id||'').toLowerCase()==='olympus'||privatePath||privateIdentifier;
};
const reasons=value=>Array.isArray(value)?value.map(String).filter(reason=>SAFE_REASON.test(reason)).slice(0,20):[];

function scientificQueueFromTower(tower){
  const tests=[];
  const recovery=[];
  for(const [path,entry] of Object.entries(tower.files||{})){
    const value=entry?.value;
    if(!value||typeof value!=='object'||privateScientificRecord(path,value))continue;
    if(path.startsWith(SCIENTIFIC_TEST_PREFIX)&&value.kind==='TEST'&&typeof value.id==='string'){
      const readiness=value.readiness&&typeof value.readiness==='object'?value.readiness:{};
      const readinessVerified=readiness.policy==='SCIENTIFIC_INTEGRITY_V1'&&typeof readiness.eligible==='boolean';
      tests.push({id:value.id,status:String(value.status||value.state||'UNKNOWN').toUpperCase(),
        domain:String(value.domain||'').toUpperCase(),priority:String(value.priority||'').toUpperCase()||null,
        roadmap_id:typeof value.roadmap_id==='string'?value.roadmap_id:null,
        campaign_id:typeof value.campaign_id==='string'?value.campaign_id:null,
        owner_role:typeof value.owner_role==='string'?value.owner_role.toUpperCase():null,
        readiness:{verified:readinessVerified,eligible:readinessVerified?readiness.eligible:null,
          policy:readinessVerified?readiness.policy:null,reasons:readinessVerified?reasons(readiness.reasons):[],
          scope:typeof readiness.input_scope==='string'?readiness.input_scope:null},
        blocker_reasons:readinessVerified?reasons(readiness.reasons):reasons(String(value.blocker||'').split(',')),
        execution_binding:{recipe:typeof value.recipe==='string'?value.recipe:null,
          params:value.recipe_params&&typeof value.recipe_params==='object'&&!Array.isArray(value.recipe_params)?value.recipe_params:null,
          prereg_hash:typeof value.prereg_hash==='string'?value.prereg_hash:null},
        battery_id:typeof value.battery_id==='string'?value.battery_id:null,
        attempt_id:typeof value.attempt_id==='string'?value.attempt_id:null,
        execution_phase:typeof value.execution_phase==='string'?value.execution_phase.toUpperCase():null,
        version:Number.isInteger(value.entity_version)?value.entity_version:
          Number.isInteger(entry.entity_version)?entry.entity_version:null});
    }else if(path.startsWith(SCIENTIFIC_WORK_PREFIX)&&typeof value.id==='string'&&
      (value.domain==='SCIENCE'||value.kind==='DEPENDENCY_RECOVERY')){
      const validation=value.recovery?.validation&&typeof value.recovery.validation==='object'?value.recovery.validation:{};
      recovery.push({id:value.id,kind:String(value.kind||'WORK').toUpperCase(),
        status:String(value.status||value.state||'UNKNOWN').toUpperCase(),
        owner_role:typeof value.owner_role==='string'?value.owner_role.toUpperCase():null,
        target_role:typeof value.recovery?.target_role==='string'?value.recovery.target_role.toUpperCase():null,
        test_id:typeof value.test_id==='string'?value.test_id:null,
        roadmap_id:typeof value.roadmap_id==='string'?value.roadmap_id:null,
        priority:String(value.priority||'').toUpperCase()||null,
        blocker_reasons:reasons(validation.reasons?.length?validation.reasons:value.recovery?.reasons),
        version:Number.isInteger(value.entity_version)?value.entity_version:
          Number.isInteger(entry.entity_version)?entry.entity_version:null});
    }
  }
  const ledger=tower.files?.['evolution/batteries.json']?.value;
  const batteries=(Array.isArray(ledger?.batteries)?ledger.batteries:[]).filter(row=>row&&typeof row.id==='string')
    .map(row=>({id:row.id,status:String(row.status||'UNKNOWN').toUpperCase(),tests:(Array.isArray(row.tests)?row.tests:[])
      .filter(test=>test&&typeof test.test_id==='string').map(test=>({test_id:test.test_id,
        attempt_id:typeof test.attempt_id==='string'?test.attempt_id:null}))}));
  return {tests:tests.sort((a,b)=>a.id.localeCompare(b.id)),recovery:recovery.sort((a,b)=>a.id.localeCompare(b.id)),batteries};
}

export function validateCanonicalTowerIdentity(tower,proof){
  if(!proof?.body_verified||proof.file_id!==TOWER_ID||tower?.contract!=='NEXO_TOWER_LIVE_V1'||
     tower.stable_file_id!==TOWER_ID||tower.storage!=='GOOGLE_DRIVE_PRIVATE'||
     tower.revision!==tower.state_fingerprint||!/^sha256:[a-f0-9]{64}$/.test(tower.state_fingerprint))
    throw new Error('CANONICAL_TOWER_INVALID');
}
export function operationalStateFromTower(tower,proof){
  validateCanonicalTowerIdentity(tower,proof);
  const work=Object.entries(tower.files).filter(([key,entry])=>key.startsWith('entities/artifact/')&&entry.value?.kind==='NEXO_OPERATIONAL_WORK_V1')
    .map(([,entry])=>({...entry.value.payload,version:entry.value.entity_version}));
  return {authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',revision:tower.revision,readback:'PASS',observed_at:new Date().toISOString(),work,
    science:scientificQueueFromTower(tower),
    integrity:'DRIVE_MD5_AND_REVISION_READBACK',availability:work.length?'CONFIGURED_IN_TOWER':'NO_OPERATIONAL_WORK_REGISTERED'};
}
export async function readVerifiedCanonicalTower({token,fetchImpl=fetch,signal}){
  if(!token)throw new Error('EXISTING_GOOGLE_AUTH_REQUIRED');
  const url=`https://www.googleapis.com/drive/v3/files/${TOWER_ID}`;
  const init=()=>({headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal:signal||AbortSignal.timeout(45000)});
  const query='?fields=id,headRevisionId,size,md5Checksum&supportsAllDrives=true';
  const meta=await fetchImpl(url+query,init());if(!meta.ok)throw new Error('TOWER_METADATA_UNAVAILABLE');
  const before=await meta.json();
  if(before.id!==TOWER_ID||!before.headRevisionId||!/^[a-f0-9]{32}$/.test(before.md5Checksum))throw new Error('TOWER_METADATA_INVALID');
  if(Number(before.size)>32*1024*1024)throw new Error('TOWER_TOO_LARGE');
  const response=await fetchImpl(url+'?alt=media&supportsAllDrives=true',init());if(!response.ok)throw new Error('TOWER_UNAVAILABLE');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>32*1024*1024)throw new Error('TOWER_TOO_LARGE');chunks.push(chunk);}
  const raw=Buffer.concat(chunks),md5=createHash('md5').update(raw).digest('hex');
  if(md5!==before.md5Checksum||raw.length!==Number(before.size))throw new Error('TOWER_BODY_HASH_MISMATCH');
  const check=await fetchImpl(url+query,init());if(!check.ok)throw new Error('TOWER_READ_RACE');
  const after=await check.json();
  if(after.id!==TOWER_ID||after.headRevisionId!==before.headRevisionId||after.md5Checksum!==md5)throw new Error('TOWER_READ_RACE');
  // Preserve the Writer fingerprint: Python/JS float encodings can differ.
  const tower=JSON.parse(raw),proof={file_id:TOWER_ID,body_verified:true};
  // Preserve the existing validation and its Writer-facing semantics.
  validateCanonicalTowerIdentity(tower,proof);
  return {tower,proof};
}

export async function readOperationalTower(options){
  const {tower,proof}=await readVerifiedCanonicalTower(options);
  return operationalStateFromTower(tower,proof);
}
