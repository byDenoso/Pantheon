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

const clip=(value,max=1200)=>String(value??'').slice(0,max);
const sha256=value=>createHash('sha256').update(String(value)).digest('hex');
const nonEmpty=(value,name,max=240)=>{const v=clip(value,max).trim();if(!v)throw Error(`${name}_REQUIRED`);return v};

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
  const headers=(schema,write=false)=>({
    Authorization:`Bearer ${oidc()}`,
    Accept:'application/json',
    ...(write?{'Content-Type':'application/json','Content-Profile':schema,Prefer:'resolution=merge-duplicates,return=representation'}:{'Accept-Profile':schema}),
  });
  async function parse(response,label){
    if(!response.ok){const body=await response.text().catch(()=>'');throw Error(`${label}_${response.status}:${body.slice(0,180)}`)}
    return response.json();
  }
  async function select(schema,table,query={}){
    const params=new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
    const response=await doFetch(`${base}/${encodeURIComponent(table)}?${params}`,{headers:headers(schema,false),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_READ_${schema}_${table}`);
  }
  async function upsert(schema,table,row){
    const response=await doFetch(`${base}/${encodeURIComponent(table)}`,{method:'POST',headers:headers(schema,true),body:JSON.stringify(row),signal:AbortSignal.timeout(timeoutMs)});
    return parse(response,`NEON_WRITE_${schema}_${table}`);
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
    if(actionId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId))throw Error('ACTION_ID_INVALID');
    const id=deterministicRunId(effectKey);
    const row={
      id,action_id:actionId,domain:lane,status,runtime_env:BRIDGE_ENV,artifact_hash:null,
      execution_log:clip(input.summary,2000),readback_verified:true,
      metadata:{
        effect_key:effectKey,loop,lane,checkpoint:clip(input.checkpoint,160),resume_pointer:clip(input.resumePointer,500),
        expected_outcome:clip(input.expectedOutcome,800),observed_outcome:clip(input.observedOutcome,800),
        bridge_version:'DURABLE_RUNNER_V1',transport_authority:DERIVED,
      },
    };
    await upsert('nexo_ops','execution_runs',row);
    const persisted=await readback('nexo_ops','execution_runs','id',id);
    if(persisted.id!==id||persisted.metadata?.effect_key!==effectKey)throw Error('READBACK_MISMATCH_EXECUTION_RUN');
    return {id,effectKey,readbackVerified:true,row:persisted,authority:DERIVED};
  }
  async function checkpoint(input={}){
    guard(input.accessKey);
    const effectKey=nonEmpty(input.effectKey,'EFFECT_KEY',500),loop=nonEmpty(input.loop,'LOOP',180);
    const lane=String(input.lane||'NEXO').toUpperCase();if(!SAFE_DOMAINS.has(lane))throw Error('LANE_NOT_ALLOWED');
    const eventId=`BRIDGE::${effectKey}`;
    const row={
      event_id:eventId,event_type:'DURABLE_CHECKPOINT',component:loop,domain:lane,action_id:null,
      status:clip(input.status||'CHECKPOINTED',120),summary:clip(input.summary,2000),occurred_at:new Date().toISOString(),
      source_kind:BRIDGE_ENV,source_id:effectKey,source_ref:null,
      payload:{effect_key:effectKey,loop,lane,step:clip(input.step,160),checkpoint:clip(input.checkpoint,160),resume_pointer:clip(input.resumePointer,500),bridge_version:'DURABLE_RUNNER_V1',transport_authority:DERIVED},
    };
    await upsert('nexo_ops','runtime_events',row);
    const persisted=await readback('nexo_ops','runtime_events','event_id',eventId);
    if(persisted.event_id!==eventId||persisted.payload?.effect_key!==effectKey)throw Error('READBACK_MISMATCH_RUNTIME_EVENT');
    return {eventId,effectKey,readbackVerified:true,row:persisted,authority:DERIVED};
  }
  async function readTruth({accessKey,surface,key}={}){
    guard(accessKey);
    const spec=SURFACES[String(surface||'')];if(!spec)throw Error('SURFACE_NOT_ALLOWED');
    const query={select:'*',...(spec.query||{})};
    if(spec.keyColumn){const value=nonEmpty(key,'KEY',500);query[spec.keyColumn]=`eq.${value}`;query.limit=25}
    const rows=await select(spec.schema,spec.table,query);
    return {authority:TRUTH,schema:spec.schema,table:spec.table,surface,rows,readAt:new Date().toISOString()};
  }
  return {
    receipt,checkpoint,readTruth,
    setToken(value){tokenOverride=value?String(value):''},
    get configured(){return Boolean(oidc())},
    get base(){return base},
  };
}
