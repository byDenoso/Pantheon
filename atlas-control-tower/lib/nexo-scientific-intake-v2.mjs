import {createHash} from 'node:crypto';
import {scientificFingerprintV2} from './nexo-roadmap.mjs';

const TERMINAL=new Set(['DONE','VERIFIED','FAILED','INCONCLUSIVE','SUPERSEDED','REJECTED','RESULT']);
const ACTIVE=new Set(['READY','QUEUED','DISPATCHED','RUNNING','CHECKPOINTED','WAIT_DEPENDENCY','RESULT_AVAILABLE','VERIFYING']);
const RUNNABLE=new Set(['ACTIVE','PROVEN','VALIDATED_CURRENT','PASS']);
const V2_SCALAR=['question','dataset_and_selection','null','rival','priors','likelihood','covariance','observable','cuts','parameterization','method','decision_rule','claim_boundary'];
const V2_LIST=['datasets','model_constraints','success_criteria','kill_criteria'];

const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const fold=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('und');
const canonList=value=>{
  if(value==null||value==='')return [];
  if(!Array.isArray(value))throw new Error('SCIENTIFIC_LIST_FIELD_MUST_BE_ARRAY');
  return [...new Set(value.map(fold).filter(Boolean))].sort();
};
const canonical=value=>{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
};
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const stableId=(prefix,...parts)=>prefix+'-'+sha(parts.map(canonical).join('|')).slice(0,20).toUpperCase();

export function scientificFingerprintV1(spec={}){
  const payload={
    question:fold(spec.question),
    datasets:canonList(spec.datasets),
    rival:fold(spec.rival)||null,
    null:fold(spec.null)||null,
    method:fold(spec.method)||null,
    decision_rule:fold(spec.decision_rule)||null,
    model_constraints:canonList(spec.model_constraints)
  };
  return 'sha256:'+sha(canonical(payload));
}
export function scientificIdsV2(spec={}){
  const fingerprint=scientificFingerprintV2(spec),hex=fingerprint.slice(7).toUpperCase();
  return {fingerprint,testId:'T-SCI-'+hex.slice(0,20),workId:'WORK::T-SCI-'+hex.slice(0,20),triggerId:'TRIGGER-SCI-'+hex.slice(0,20)};
}
function frozenContract(spec,testId){
  const frozen={id:testId};
  for(const field of [...V2_SCALAR,...V2_LIST])if(Object.hasOwn(spec,field))frozen[field]=structuredClone(spec[field]);
  frozen.outputs=spec.outputs!==undefined?structuredClone(spec.outputs):['scientific_result'];
  frozen.resolution_policy={
    missing_scientific_fields:'CANONICAL_METHOD_OR_BOUNDED_BRANCH',
    ambiguity:'BRANCH_OR_SENSITIVITY',
    claim_promotion:'FORBIDDEN_UNTIL_EXPLICIT_EVIDENCE'
  };
  return frozen;
}
async function readWork(gateway,id){
  let item=await gateway.readEntity('work',id);
  if(!item&&typeof gateway.readActiveWorkIndex==='function'){
    const index=await gateway.readActiveWorkIndex().catch(()=>({work:[]}));
    item=(index?.work||[]).find(row=>String(row?.id||row?.work_id||'')===id)||null;
  }
  return item;
}
async function ensureEntity(gateway,{kind,id,changes,fingerprint,correlationId,eventType,writerRole='ADVISOR'}){
  const existing=await gateway.readEntity(kind,id);
  if(existing){
    const observed=String(existing.scientific_fingerprint||'');
    if(observed&&observed!==fingerprint)throw new Error('SCIENTIFIC_IDENTITY_COLLISION:'+id);
    return {entity:existing,created:false,receipt:null};
  }
  const request={
    request_id:stableId('REQ-SCI-'+kind.toUpperCase(),id,fingerprint),
    entity_kind:kind,entity_name:id,expected_version:0,writer_role:writerRole,material:true,
    correlation_id:correlationId,changes:{id,...changes},event_type:eventType
  };
  const persisted=await gateway.submitTowerMutation(request);
  const entity=await gateway.readEntity(kind,id);
  if(!entity)throw new Error('SCIENTIFIC_'+kind.toUpperCase()+'_READBACK_MISSING:'+id);
  if(String(entity.scientific_fingerprint||'')!==fingerprint)throw new Error('SCIENTIFIC_FINGERPRINT_READBACK_MISMATCH:'+id);
  return {entity,created:true,receipt:persisted?.receipt||persisted};
}
async function resolveCapability(gateway,spec){
  const manifest=await gateway.readCapabilityManifest();
  const capabilities=manifest?.capabilities||{};
  const requested=clean(spec.capability_id||spec.execution_capability)||null;
  const usable=id=>{
    const item=capabilities?.[id];
    return item&&typeof item==='object'&&RUNNABLE.has(String(item.status||'ACTIVE').toUpperCase())?{capability_id:id,...item}:null;
  };
  if(requested){
    const specific=usable(requested);
    if(specific)return {state:'READY',capability:specific,requested};
  }
  const generic=usable('scientific.generic_contract_executor_v1');
  if(generic)return {state:'READY',capability:{...generic,resolution:'UNIVERSAL_FROZEN_CONTRACT_ADAPTER',requested_capability_id:requested},requested};
  return {state:'CAPABILITY_GAP',capability:null,requested,detail:{error:'CAPABILITY_GAP',message:'no executable specific or universal frozen-contract capability is available',requested_capability_id:requested}};
}
function attached(existing,{fingerprint,execute}){
  if(!existing)return null;
  const observed=String(existing.scientific_fingerprint||'');
  if(observed&&observed!==fingerprint)throw new Error('SCIENTIFIC_IDENTITY_COLLISION:'+String(existing.id||existing.work_id||'WORK'));
  const status=String(existing.status||'').toUpperCase();
  if(TERMINAL.has(status))return {state:'DUPLICATE_TERMINAL',canonical_readback:true,run_id:existing.last_run_id||null,result_ref:existing.last_result_id||existing.result_ref||null};
  if(!execute)return {state:ACTIVE.has(status)?'ATTACH_EXISTING':'PREPARED',canonical_readback:true,run_id:existing.last_run_id||null};
  if(existing.last_run_id||ACTIVE.has(status)&&status!=='READY')return {state:'ATTACH_EXISTING',canonical_readback:true,run_id:existing.last_run_id||null};
  return null;
}

export function createScientificIntakeV2({towerGateway}={}){
  if(!towerGateway)throw new Error('TOWER_GATEWAY_REQUIRED');
  async function submit(payload={}){
    const control=await towerGateway.readControl();
    if(String(control?.mode||'').toUpperCase()!=='ACTIVE')throw new Error('TOWER_NOT_ACTIVE');
    const correlationId=clean(payload.correlation_id);
    if(!correlationId)throw new Error('SCIENTIFIC_CORRELATION_ID_REQUIRED');
    const execute=Boolean(payload.execute),dataBounded=Boolean(payload.data_bounded),specs=payload.tests;
    if(!Array.isArray(specs)||specs.length<1||specs.length>50||!specs.every(item=>item&&typeof item==='object'&&!Array.isArray(item)))throw new Error('SCIENTIFIC_TESTS_INVALID');
    const outputs=[];let anyPending=false;
    for(let index=0;index<specs.length;index++){
      const spec={...specs[index]};
      if(!clean(spec.claim_boundary))spec.claim_boundary='Exploratory execution only; no automatic claim promotion.';
      const question=clean(spec.question),title=clean(spec.title)||question;
      if(!question||!title)throw new Error('SCIENTIFIC_TEST_TITLE_QUESTION_REQUIRED');
      const ids=scientificIdsV2(spec),frozen=frozenContract(spec,ids.testId);
      const capability=await resolveCapability(towerGateway,spec);
      const campaignId=clean(spec.campaign_id)||null,testGroupId=clean(spec.test_group_id)||null;
      const testChanges={
        domain:'SCIENCE',title,objective:question,question,status:'READY',operational_status:'READY',analytical_status:'UNASSESSED',
        scientific_fingerprint:ids.fingerprint,scientific_fingerprint_version:2,scientific_execution_state:capability.state,
        capability_id:capability.capability?.capability_id||null,requested_capability_id:capability.requested,
        datasets:Array.isArray(spec.datasets)?[...spec.datasets]:[],rival:spec.rival??null,null:spec.null??null,method:spec.method??null,
        decision_rule:spec.decision_rule??null,model_constraints:Array.isArray(spec.model_constraints)?[...spec.model_constraints]:[],
        claim_boundary:frozen.claim_boundary, frozen_test:frozen, scientific_result:null
      };
      for(const field of ['roadmap_id','roadmap_test_id','roadmap_ref'])if(spec[field]!==undefined&&spec[field]!==null&&spec[field]!=='')testChanges[field]=spec[field];
      if(campaignId)testChanges.campaign_id=campaignId;
      if(testGroupId){testChanges.test_group_id=testGroupId;testChanges.parent_id=testGroupId;}
      await ensureEntity(towerGateway,{kind:'test',id:ids.testId,changes:testChanges,fingerprint:ids.fingerprint,correlationId:correlationId+':'+String(index+1).padStart(2,'0')+':test',eventType:'TEST_REGISTERED'});

      let work=await readWork(towerGateway,ids.workId),workId=ids.workId;
      if(!work){
        const legacyFingerprint=scientificFingerprintV1(spec),legacyId='WORK-SCI-'+legacyFingerprint.slice(7,27).toUpperCase();
        const legacy=await readWork(towerGateway,legacyId);
        if(legacy){work=legacy;workId=String(legacy.id||legacy.work_id||legacyId);}
      }
      if(!work){
        const workChanges={
          status:'READY',owner_role:'EXECUTOR',title,kind:'ACTION',priority:String(spec.priority||'NORMAL').toUpperCase(),domain:'SCIENCE',
          test_id:ids.testId,scientific_fingerprint:ids.fingerprint,scientific_fingerprint_version:2,scientific_execution_state:capability.state,
          execution_requested:execute,requested_capability_id:capability.requested,datasets:Array.isArray(spec.datasets)?[...spec.datasets]:[],
          rival:spec.rival??null,null:spec.null??null,method:spec.method??null,decision_rule:spec.decision_rule??null,
          model_constraints:Array.isArray(spec.model_constraints)?[...spec.model_constraints]:[],claim_boundary:frozen.claim_boundary,
          test_group_id:testGroupId,capability_id:capability.capability?.capability_id||null,frozen_test:frozen,scheduler_visibility_contract:'OPTIONAL_PROJECTION_NOT_GATE'
        };
        for(const field of ['roadmap_id','roadmap_test_id','roadmap_ref'])if(spec[field]!==undefined&&spec[field]!==null&&spec[field]!=='')workChanges[field]=spec[field];
        if(campaignId)workChanges.campaign_id=campaignId;
        if(capability.detail)workChanges.capability_gap=capability.detail;
        const ensured=await ensureEntity(towerGateway,{kind:'work',id:ids.workId,changes:workChanges,fingerprint:ids.fingerprint,correlationId:correlationId+':'+String(index+1).padStart(2,'0')+':work',eventType:'WORK_CREATED'});
        work=ensured.entity;workId=ids.workId;
      }
      const schedulerVisible=String(work.test_id||'')===ids.testId||workId.startsWith('WORK-SCI-');
      if(capability.state==='CAPABILITY_GAP'){
        outputs.push({test_id:ids.testId,work_id:workId,campaign_id:campaignId,test_group_id:testGroupId,fingerprint:ids.fingerprint,fingerprint_version:2,state:'RECOVERY_REQUIRED',canonical_readback:true,scheduler_visible:schedulerVisible,recovery_required:true,recovery_reason:'CAPABILITY_GAP',capability_gap:capability.detail});
        continue;
      }
      const reuse=attached(work,{fingerprint:ids.fingerprint,execute});
      if(reuse){outputs.push({test_id:ids.testId,work_id:workId,campaign_id:campaignId,test_group_id:testGroupId,fingerprint:ids.fingerprint,fingerprint_version:2,scheduler_visible:schedulerVisible,...reuse});continue;}
      if(!execute){
        outputs.push({test_id:ids.testId,work_id:workId,campaign_id:campaignId,test_group_id:testGroupId,fingerprint:ids.fingerprint,fingerprint_version:2,state:'PREPARED',canonical_readback:true,scheduler_visible:schedulerVisible});
        continue;
      }
      const runId=stableId('RUN',ids.triggerId,workId,capability.capability.capability_id);
      const dispatch=await towerGateway.dispatchRuntime({trigger_id:ids.triggerId,run_id:runId,work_id:workId,capability_id:capability.capability.capability_id,data_bounded:dataBounded});
      outputs.push({test_id:ids.testId,work_id:workId,campaign_id:campaignId,test_group_id:testGroupId,fingerprint:ids.fingerprint,fingerprint_version:2,state:'DISPATCHED',canonical_readback:true,scheduler_visible:true,trigger_id:ids.triggerId,run_id:runId,...dispatch});
      anyPending=true;
    }
    return {accepted:true,execute,ordering:'TEST_THEN_WORK_THEN_DISPATCH',scheduler_visibility_contract:'OPTIONAL_PROJECTION_NOT_GATE',tests:outputs,pending:anyPending};
  }
  return {submit};
}

export const _internal={frozenContract,resolveCapability,attached,ensureEntity,stableId};
