import {classifyExecutorQueue,findCapability} from './tower-eligibility.mjs';
const ROLES=new Set(['DAILY','ADVISOR','EXECUTOR','LEARNER','EMERGENT']);
const PRIORITY={P0:-1,CRITICAL:0,HIGH:1,MEDIUM_HIGH:2,MEDIUM:3,NORMAL:4,LOW:5};
const STATUS={VERIFIED:0,READY:1,RUNNING:2,CHECKPOINTED:3,WAIT_DEPENDENCY:4};
const BLOCKERS=new Set(['SCIENTIFIC_DEFINITION_MISSING','AUTHORIZATION_MISSING','IRREVERSIBLE_CONFLICT']);
const LEGACY_ADVISOR=new Set(['ACTION','RESEARCH','REVIEW','PROCEDURAL_HYPOTHESIS','ENGINEERING_FIX']);
const ACTIVE_CAPS=new Set(['ACTIVE','PROVEN','VALIDATED_CURRENT']);

const rank=(map,value,fallback=9)=>Object.hasOwn(map,String(value||''))?map[String(value||'')]:fallback;
const capabilityRunnable=(item,capabilities)=>{
  const task=String(item.task_id||''),capabilityId=String(item.capability_id||'');
  if(task||capabilityId){
    // Tower work entities bind by capability_id (e.g. peer.detection.d05_v1); legacy rows by task_id.
    const cap=findCapability(capabilities,{capabilityId:capabilityId||null,taskId:task||null});
    return Boolean(cap&&ACTIVE_CAPS.has(String(cap.status||'ACTIVE').toUpperCase())&&(cap.backend||cap.executable||cap.task_id));
  }
  const frozen=item.frozen_test;
  return Boolean(frozen&&frozen.id&&frozen.method&&frozen.decision_rule&&frozen.outputs&&frozen.claim_boundary);
};
const legitimateBlocker=item=>BLOCKERS.has(String(item.blocker_class||item.blocker_type||item.blocker_reason_code||'').toUpperCase());
function eligible(item,role,capabilities){
  const status=String(item.status||'').toUpperCase(),owner=String(item.owner_role||'').toUpperCase();
  if(role==='EXECUTOR')return owner==='EXECUTOR'&&['READY','RUNNING','CHECKPOINTED'].includes(status)&&!legitimateBlocker(item)&&String(item.execution_policy||'AUTO').toUpperCase()!=='MANUAL'&&capabilityRunnable(item,capabilities);
  if(role==='ADVISOR'){
    if(['DONE','VERIFIED','REJECTED','FAILED'].includes(status))return false;
    if(owner==='ADVISOR')return true;
    if(['SOURCE_BINDING_PENDING','BINDING_INCOMPLETE'].includes(status))return true;
    if(owner)return false;
    return LEGACY_ADVISOR.has(String(item.kind||'').toUpperCase());
  }
  if(role==='LEARNER')return ['VERIFIED','DONE'].includes(status)&&item.learning_state!=='LEARNED';
  if(role==='EMERGENT')return owner==='EMERGENT'||String(item.kind||'').toUpperCase()==='EMERGENT_TEST';
  return item.director_relevant===true;
}
function queueCard(item,role){
 const common=['id','entity_version','status','kind','owner_role','priority','thread_id','question','next_action','blocker','blocker_class','migration_state','interdomain_ref'];
 const executor=['task_id','capability_id','implementation_ref','repository','source_revision','required_outputs','validation_ref','result_ref','frozen_test','execution_class','dispatch_requested','dispatch_state'];
 const learner=['result_ref','learning_state'];
 const keys=common.concat(role==='EXECUTOR'?executor:role==='LEARNER'?learner:[]);
 return Object.fromEntries(keys.filter(k=>item[k]!==undefined&&item[k]!==null).map(k=>[k,item[k]]));
}
export function deriveRoleView({role,control={},activeWork={},capabilities={},entities=null,frozenTests={},resolveRef=null}){
  const normalized=String(role||'').toUpperCase();
  if(!ROLES.has(normalized))throw new Error('ROLE_NOT_SUPPORTED');
  const indexItems=Array.isArray(activeWork?.work)?activeWork.work:[];
  // AUT-004: with hydrated entities, the executor selects only RUNNABLE work; READY-but-not-runnable
  // goes to blocked_input here instead of being discovered after hydration inside the round.
  let selection=null,items=indexItems;
  if(normalized==='EXECUTOR'&&entities){
    const lookup=entities instanceof Map?id=>entities.get(id):id=>entities[id];
    const {rows,stats}=classifyExecutorQueue(indexItems,entities,{capabilities,frozenTests,resolveRef});
    const runnable=new Set(rows.filter(row=>row.selection==='RUNNABLE').map(row=>row.id));
    items=indexItems.filter(item=>runnable.has(item.id)).map(item=>({...item,...lookup(item.id)}));
    selection={stats,blocked_input:rows.filter(row=>row.selection==='BLOCKED_INPUT').map(({id,reasons})=>({id,status:'BLOCKED_INPUT',reasons})),stale_index:rows.filter(row=>row.selection==='STALE_INDEX').map(({id,reasons})=>({id,reasons}))};
  }
  const queue=items.filter(item=>item&&eligible(item,normalized,capabilities)).map(item=>queueCard(item,normalized)).sort((a,b)=>{
    const parkedA=String(a.status)==='WAIT_DEPENDENCY'?1:0,parkedB=String(b.status)==='WAIT_DEPENDENCY'?1:0;
    return parkedA-parkedB+(String(a.owner_role||'')===normalized?0:1)-(String(b.owner_role||'')===normalized?0:1)+rank(PRIORITY,a.priority)-rank(PRIORITY,b.priority)+rank(STATUS,a.status)-rank(STATUS,b.status)+String(a.id||'').localeCompare(String(b.id||''));
  }).slice(0,Number(control.role_queue_limit||5));
  return {role:normalized,control,event_cursor:control.event_cursor||null,queue,queue_count:queue.length,queue_limit:Number(control.role_queue_limit||5),view_model:selection?'DERIVED_LIVE_FROM_HYDRATED_ENTITIES':'DERIVED_LIVE_FROM_ACTIVE_WORK',...(selection?{selection_stats:selection.stats,blocked_input:selection.blocked_input,stale_index:selection.stale_index}:{})};
}
