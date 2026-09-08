import {createHash,timingSafeEqual} from 'node:crypto';
import {DEFAULT_NEON_DATA_API_URL} from './neon-v1.mjs';

// Only the hash is committed. The bearer value lives in the private scheduled-task
// contract and is never accepted as database content or echoed by this module.
export const DEFAULT_RUNNER_KEY_SHA256='16d3948705dfd2c5687242244081a970e486c386179d99fde62c37866502db7f';
const DERIVED='DERIVED_NOT_EVIDENCE';
const TRUTH='NEON_TRUTH_OWNER';
const BRIDGE_ENV='NEXO_SCHEDULED_DURABLE_BRIDGE';
const RECEIPT_STATUSES=new Set(['SUCCESS','FAILED','BLOCKED']);
const SAFE_DOMAINS=new Set(['NEXO','SCIENCE','ENGINEERING','OLYMPUS']);
const ACTION_STATUSES=new Set(['PENDING','IN_PROGRESS','BLOCKED','COMPLETED']);
const ACTION_TRANSITIONS={
  PENDING:new Set(['IN_PROGRESS','BLOCKED']),
  IN_PROGRESS:new Set(['PENDING','BLOCKED','COMPLETED']),
  BLOCKED:new Set(['PENDING','IN_PROGRESS']),
  COMPLETED:new Set(),
};

const clip=(value,max=1200)=>String(value??'').slice(0,max);
const sha256=value=>createHash('sha256').update(String(value)).digest('hex');
const nonEmpty=(value,name,max=240)=>{const v=clip(value,max).trim();if(!v)throw Error(`${name}_REQUIRED`);return v};
const isUuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));

export function authorizeRunnerKey(accessKey,expectedHash=DEFAULT_RUNNER_KEY_SHA256){
  if(!accessKey||!expectedHash)return false;
  const actual=Buffer.from(sha256(accessKey),'hex'),expected=Buffer.from(String(expectedHash).toLowerCase(),'hex');
  return actual.length===expected.length&&actual.length>0&&timingSafeEqual(actual,expected);
}

export function deterministicRunId(effectKey){
  const key=nonEmpty(effectKey,'EFFECT_KEY',500);
  const chars=sha256(`nexo-durable-runner-v1:${key}`).slice(0,32).split('');
  chars[12]='5';
  chars[16]=((parseInt(chars[16],16)&0x3)|0x8).toString(16);
  const h=chars.join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const SURFACES={
  actions_open:{schema:'nexo_ops',table:'actions',query:{select:'*',status:'in.(PENDING,IN_PROGRESS,BLOCKED)',order:'priority.asc,updated_at.desc',limit:25}},
  action:{schema:'nexo_ops',table:'actions',keyColumn:'id'},
  science_entity:{schema:'science_v1',table:'entities',keyColumn:'entity_id'},
  science_revision:{schema:'science_v1',table:'revisions',keyColumn:'revision_id'},
  learning_strategy:{schema:'learning_v1',table:'strategies',keyColumn:'strategy_id'},
  learning_policy:{schema:'learning_v1',table:'policies',keyColumn:'policy_id'},
  learning_lesson:{schema:'learning_v1',table:'lessons',keyColumn:'lesson_id'},
  olympus_state:{schema:'olympus',table:'current_state',keyColumn:'person_id'},
  olympus_person:{schema:'olympus',table:'people',keyColumn:'id'},
  olympus_event:{schema:'olympus',table:'events',keyColumn:'legacy_event_id'},
};

export function createRunnerBridge({env=process.env,fetchImpl,timeoutMs=12000}={}){
  const doFetch=fetchImpl||((...args)=>fetch(...args));
  const base=String(env.NEON_DATA_API_URL||DEFAULT_NEON_DATA_API_URL).replace(/\/+$/,'');
  const expectedHash=env.NEXO_RUNNER_KEY_SHA256||DEFAULT_RUNNER_KEY_SHA256;
  let tokenOverride='';
  const oidc=()=>tokenOverride||env.VERCEL_OIDC_TOKEN||'';
  const guard=accessKey=>{if(!authorizeRunnerKey(accessKey,expectedHash))throw Error('RUNNER_UNAUTHORIZED');if(!oidc())throw Error('VERCEL_OIDC_TOKEN_MISSING')};
  const readHeaders=schema=>({Authorization:`Bearer ${oidc()}`,Accept:'application/json','Accept-Profile':schema});
  const writeHeaders=(schema,upsert=false)=>({Authorization:`Bearer ${oidc()}`,Accept:'application/json','Content-Type':'application/json','Content-Profile':schema,Prefer:`${upsert?'resolution=merge-duplicates,':''}return=representation`});
  async function parse(response,label){
    if(!response.ok){const body=await response.text().catch(()=>'');throw Error(`${label}_${response.status}:${body.slice(0,180)}`)}
    return response.json();
  }
  async function select(schema,table,paramsObj={}){
    const params=new URLSearchParams(Object.entries(paramsObj).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
    const response=await doFetch(`${base}/${encodeURIComponent(table)}?${params}`,{headers:readHeaders(schema),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_READ_${schema}_${table}`);
  }
  async function upsert(schema,table,row){
    const response=await doFetch(`${base}/${encodeURIComponent(table)}`,{method:'POST',headers:writeHeaders(schema,true),body:JSON.stringify(row),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_WRITE_${schema}_${table}`);
  }
  async function patch(schema,table,column,value,body){
    const params=new URLSearchParams({[column]:`eq.${value}`});
    const response=await doFetch(`${base}/${encodeURIComponent(table)}?${params}`,{method:'PATCH',headers:writeHeaders(schema,false),body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_PATCH_${schema}_${table}`);
  }
  async function patchWhere(schema,table,filters,body){
    const params=new URLSearchParams(Object.entries(filters).map(([column,value])=>[column,`eq.${value}`]));
    const response=await doFetch(`${base}/${encodeURIComponent(table)}?${params}`,{method:'PATCH',headers:writeHeaders(schema,false),body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_PATCH_${schema}_${table}`);
  }
  async function readback(schema,table,column,value){
    const rows=await select(schema,table,{select:'*',[column]:`eq.${value}`,limit:1});
    if(!Array.isArray(rows)||!rows[0])throw Error(`READBACK_MISSING_${schema}_${table}`);
    return rows[0];
  }
  async function receipt(input={}){
    guard(input.accessKey);
    const effectKey=nonEmpty(input.effectKey,'EFFECT_KEY',500),loop=nonEmpty(input.loop,'LOOP',180);
    const lane=String(input.lane||'NEXO').toUpperCase();if(!SAFE_DOMAINS.has(lane))throw Error('LANE_NOT_ALLOWED');
    const status=String(input.status||'SUCCESS').toUpperCase();if(!RECEIPT_STATUSES.has(status))throw Error('STATUS_NOT_ALLOWED');
    const actionId=input.actionId?clip(input.actionId,80):null;
    if(actionId&&!isUuid(actionId))throw Error('ACTION_ID_INVALID');
    const id=deterministicRunId(effectKey);
    const existing=await select('nexo_ops','execution_runs',{select:'*',id:`eq.${id}`,limit:1});
    if(existing?.[0]){
      if(existing[0].metadata?.effect_key!==effectKey)throw Error('IDEMPOTENCY_CONFLICT_EXECUTION_RUN');
      if(existing[0].readback_verified)return {id,effectKey,readbackVerified:true,row:existing[0],authority:DERIVED,replay:true};
    }
    const row={
      id,action_id:actionId,domain:lane,status,runtime_env:BRIDGE_ENV,artifact_hash:null,
      execution_log:clip(input.summary,2000),readback_verified:false,
      metadata:{effect_key:effectKey,loop,lane,checkpoint:clip(input.checkpoint,160),resume_pointer:clip(input.resumePointer,500),expected_outcome:clip(input.expectedOutcome,800),observed_outcome:clip(input.observedOutcome,800),bridge_version:'DURABLE_RUNNER_V1',transport_authority:DERIVED},
    };
    await upsert('nexo_ops','execution_runs',row);
    const persisted=await readback('nexo_ops','execution_runs','id',id);
    if(persisted.id!==id||persisted.metadata?.effect_key!==effectKey)throw Error('READBACK_MISMATCH_EXECUTION_RUN');
    const verified=await patch('nexo_ops','execution_runs','id',id,{readback_verified:true});
    const finalRow=verified?.[0]||{...persisted,readback_verified:true};
    return {id,effectKey,readbackVerified:true,row:finalRow,authority:DERIVED,replay:false};
  }
  async function checkpoint(input={}){
    guard(input.accessKey);
    const effectKey=nonEmpty(input.effectKey,'EFFECT_KEY',500),loop=nonEmpty(input.loop,'LOOP',180);
    const lane=String(input.lane||'NEXO').toUpperCase();if(!SAFE_DOMAINS.has(lane))throw Error('LANE_NOT_ALLOWED');
    const eventId=`BRIDGE::${effectKey}`;
    const existing=await select('nexo_ops','runtime_events',{select:'*',event_id:`eq.${eventId}`,limit:1});
    if(existing?.[0]){
      if(existing[0].payload?.effect_key!==effectKey)throw Error('IDEMPOTENCY_CONFLICT_RUNTIME_EVENT');
      return {eventId,effectKey,readbackVerified:true,row:existing[0],authority:DERIVED,replay:true};
    }
    const row={
      event_id:eventId,event_type:'DURABLE_CHECKPOINT',component:loop,domain:lane,action_id:null,
      status:clip(input.status||'CHECKPOINTED',120),summary:clip(input.summary,2000),occurred_at:new Date().toISOString(),
      source_kind:BRIDGE_ENV,source_id:effectKey,source_ref:null,
      payload:{effect_key:effectKey,loop,lane,step:clip(input.step,160),checkpoint:clip(input.checkpoint,160),resume_pointer:clip(input.resumePointer,500),bridge_version:'DURABLE_RUNNER_V1',transport_authority:DERIVED},
    };
    await upsert('nexo_ops','runtime_events',row);
    const persisted=await readback('nexo_ops','runtime_events','event_id',eventId);
    if(persisted.event_id!==eventId||persisted.payload?.effect_key!==effectKey)throw Error('READBACK_MISMATCH_RUNTIME_EVENT');
    return {eventId,effectKey,readbackVerified:true,row:persisted,authority:DERIVED,replay:false};
  }
  async function transitionAction(input={}){
    guard(input.accessKey);
    const effectKey=nonEmpty(input.effectKey,'EFFECT_KEY',500);
    const actionId=nonEmpty(input.actionId,'ACTION_ID',80);if(!isUuid(actionId))throw Error('ACTION_ID_INVALID');
    const actor=nonEmpty(input.actor,'ACTOR',180);
    const expectedStatus=String(input.expectedStatus||'').toUpperCase();
    const targetStatus=String(input.targetStatus||'').toUpperCase();
    if(!ACTION_STATUSES.has(expectedStatus)||!ACTION_STATUSES.has(targetStatus))throw Error('ACTION_STATUS_INVALID');
    if(!ACTION_TRANSITIONS[expectedStatus]?.has(targetStatus))throw Error('ACTION_TRANSITION_NOT_ALLOWED');
    const existing=await select('nexo_ops','actions',{select:'*',id:`eq.${actionId}`,limit:1});
    const current=existing?.[0];if(!current)throw Error('ACTION_NOT_FOUND');
    if(current.status===targetStatus&&current.metadata?.last_transition_effect_key===effectKey){
      return {actionId,effectKey,targetStatus,readbackVerified:true,row:current,authority:DERIVED,replay:true};
    }
    if(String(current.status).toUpperCase()!==expectedStatus)throw Error('ACTION_PRECONDITION_FAILED');
    const blockerReason=targetStatus==='BLOCKED'?nonEmpty(input.blockerReason,'BLOCKER_REASON',2000):null;
    const metadata={...(current.metadata||{}),last_transition_effect_key:effectKey,last_transition_actor:actor,last_transition_from:expectedStatus,last_transition_to:targetStatus};
    const changed=await patchWhere('nexo_ops','actions',{id:actionId,status:expectedStatus},{status:targetStatus,blocker_reason:blockerReason,metadata,updated_at:new Date().toISOString()});
    if(!Array.isArray(changed)||!changed[0])throw Error('ACTION_PRECONDITION_FAILED');
    const persisted=await readback('nexo_ops','actions','id',actionId);
    if(String(persisted.status).toUpperCase()!==targetStatus||persisted.metadata?.last_transition_effect_key!==effectKey)throw Error('READBACK_MISMATCH_ACTION_TRANSITION');
    return {actionId,effectKey,targetStatus,readbackVerified:true,row:persisted,authority:DERIVED,replay:false};
  }
  async function readTruth({accessKey,surface,key}={}){
    guard(accessKey);
    const spec=SURFACES[String(surface||'')];if(!spec)throw Error('SURFACE_NOT_ALLOWED');
    const paramsObj={select:'*',...(spec.query||{})};
    if(spec.keyColumn){const value=nonEmpty(key,'KEY',500);paramsObj[spec.keyColumn]=`eq.${value}`;paramsObj.limit=25}
    const rows=await select(spec.schema,spec.table,paramsObj);
    return {authority:TRUTH,schema:spec.schema,table:spec.table,surface,rows,readAt:new Date().toISOString()};
  }
  return {
    receipt,checkpoint,transitionAction,readTruth,
    setToken(value){tokenOverride=value?String(value):''},
    get configured(){return Boolean(oidc())},
    get base(){return base},
  };
}
