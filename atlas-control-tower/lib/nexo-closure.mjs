import {createHash} from 'node:crypto';

const TERMINAL=new Set(['DONE','VERIFIED','REJECTED','FAILED','SUPERSEDED']);
const DEP_SUCCESS=new Set(['DONE','VERIFIED']);
const HUMAN_CLASSES=new Set(['HUMAN_AUTH_REQUIRED','HUMAN_DECISION_REQUIRED']);
const clean=value=>String(value??'').trim();
const upper=value=>clean(value).toUpperCase();
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
function requestId(command,workId,correlationId){return 'REQ-API-'+upper(command)+'-'+hash(command+'|'+workId+'|'+correlationId).slice(0,20);}
function classifyText(text){
  const classes=new Set();
  if(['HUMAN_DECISION','DECISION_REQUIRED','APPROVAL_REQUIRED','NEEDS_DENER','OPERATOR_CANCELLED','CANCELLED_BY_OPERATOR','EXPLICIT_OPERATOR_REOPEN'].some(x=>text.includes(x)))classes.add('HUMAN_DECISION_REQUIRED');
  if(['SECRET','CREDENTIAL','AUTH_REQUIRED','AUTHORIZATION_REQUIRED','OAUTH','CONSENT_REQUIRED','PROVISIONING','PROVIDER_AUTH'].some(x=>text.includes(x)))classes.add('HUMAN_AUTH_REQUIRED');
  if(['RATE_LIMIT','RATE LIMIT','CAPACITY','QUOTA','OUTAGE','TRANSIENT','TEMPORARY','TIMEOUT','SERVICE_UNAVAILABLE','BUILD_LIMIT','BUILD RATE LIMIT'].some(x=>text.includes(x)))classes.add('EXTERNAL_TRANSIENT');
  return classes;
}
function tokens(value={}){
  return ['id','blocker_type','blocker_state','dependency_type','dependency_state','state','detail'].map(k=>upper(value[k])).filter(Boolean).join(' ');
}
export function classifyDependency(work={}){
  const deps=Array.isArray(work.dependency_ids)?work.dependency_ids.map(clean).filter(Boolean):[];
  const classes=classifyText(tokens(work));
  if(Array.isArray(work.remaining_dependencies))for(const item of work.remaining_dependencies)if(item&&typeof item==='object')for(const c of classifyText(tokens(item)))classes.add(c);
  if(!classes.size&&deps.length)return {dependency_class:'CANONICAL_WORK',human_action_required:false,auto_retry_eligible:true};
  if(!classes.size)return {dependency_class:'UNCLASSIFIED',human_action_required:false,auto_retry_eligible:false};
  const ordered=[...classes].sort(),human=ordered.some(x=>HUMAN_CLASSES.has(x)),retry=classes.has('EXTERNAL_TRANSIENT');
  return ordered.length===1?{dependency_class:ordered[0],human_action_required:human,auto_retry_eligible:retry}:{dependency_class:'MIXED',dependency_classes:ordered,human_action_required:human,auto_retry_eligible:retry};
}
async function getWork(gateway,id){
  let work=await gateway.readEntity('work',id);
  if(!work){const index=await gateway.readActiveWorkIndex().catch(()=>({work:[]}));work=(index?.work||[]).find(x=>String(x?.id||x?.work_id||'')===id)||null;}
  if(!work)throw new Error('WORK_NOT_FOUND:'+id);
  return work;
}
async function mutate(gateway,work,{correlationId,changes,eventType}){
  const workId=String(work.id||work.work_id),request={request_id:requestId(eventType,workId,correlationId),entity_kind:'work',entity_name:workId,expected_version:Number(work.entity_version||0),writer_role:'LEARNER',material:true,correlation_id:correlationId,changes,event_type:eventType};
  const persisted=await gateway.submitTowerMutation(request),readback=await gateway.readEntity('work',workId);
  if(!readback)throw new Error('RECONCILE_READBACK_MISSING');
  return {request_id:request.request_id,status:persisted?.status||'COMPLETE',receipt:persisted?.receipt||persisted,readback};
}
export function createClosureSurface({towerGateway}={}){
  if(!towerGateway)throw new Error('TOWER_GATEWAY_REQUIRED');
  async function reconcileWork({work_id,correlation_id}={}){
    const workId=clean(work_id),correlationId=clean(correlation_id);
    if(!workId)throw new Error('WORK_ID_REQUIRED');if(!correlationId)throw new Error('CORRELATION_ID_REQUIRED');
    const work=await getWork(towerGateway,workId),status=upper(work.status);
    if(TERMINAL.has(status))return {work_id:workId,transition:'NO_TRANSITION',reason:'ALREADY_TERMINAL'};
    if(status==='WAIT_DEPENDENCY'){
      const deps=Array.isArray(work.dependency_ids)?work.dependency_ids.map(clean).filter(Boolean):[],classification=classifyDependency(work);
      if(classification.human_action_required&&classification.auto_retry_eligible)return {work_id:workId,transition:'NO_TRANSITION',reason:'MIXED_DEPENDENCY_WAIT',...classification};
      if(classification.human_action_required)return {work_id:workId,transition:'NO_TRANSITION',reason:'HUMAN_INTERVENTION_REQUIRED',...classification};
      if(!deps.length){
        if(classification.auto_retry_eligible)return {work_id:workId,transition:'NO_TRANSITION',reason:'RETRYABLE_EXTERNAL_DEPENDENCY',...classification};
        return {work_id:workId,transition:'NO_TRANSITION',reason:'DEPENDENCY_SET_MISSING'};
      }
      const pending=[];
      for(const id of deps){try{const dep=await getWork(towerGateway,id);if(!DEP_SUCCESS.has(upper(dep.status)))pending.push(id);}catch{pending.push(id);}}
      if(pending.length)return {work_id:workId,transition:'NO_TRANSITION',reason:'DEPENDENCY_PENDING',pending_dependency_ids:pending};
      const target=upper(work.resume_role||work.owner_role||'EXECUTOR');
      const result=await mutate(towerGateway,work,{correlationId,changes:{status:'READY',owner_role:target,dependency_state:'RESOLVED',resolved_dependency_ids:deps},eventType:'WORK_WAKE_REQUESTED'});
      return {work_id:workId,transition:'RESUME',reason:'DEPENDENCIES_RESOLVED',result};
    }
    if(status==='CHECKPOINTED'&&work.closure_ready===true){
      const result=await mutate(towerGateway,work,{correlationId,changes:{status:'DONE',closure_reconciler:'EXPLICIT_CLOSURE_READY'},eventType:'WORK_DONE'});
      return {work_id:workId,transition:'COMPLETE',reason:'EXPLICIT_CLOSURE_READY',result};
    }
    return {work_id:workId,transition:'NO_TRANSITION',reason:'NO_MACHINE_CLOSURE_CONDITION'};
  }
  return {reconcileWork};
}
