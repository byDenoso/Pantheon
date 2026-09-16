import {createHash} from 'node:crypto';

const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const normalize=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('en-US');
const digest=value=>createHash('sha256').update(String(value)).digest('hex').toUpperCase();
function required(input,key){const value=text(input?.[key]);if(!value)throw new Error(`${key.toUpperCase()}_REQUIRED`);return value;}
function fingerprint(input){const parts=['invariant_or_defect_code','affected_entity_kind','affected_entity_id','root_cause_code'].map(key=>normalize(required(input,key)));return digest(parts.join(' | '));}
function workIdFor(fp){return `WORK-HEALTH-${fp.slice(0,20)}`;}
function observationSignature(fp,input){return digest(`${fp}|${upper(input.severity||'P1')}|${normalize(input.material_state||'observed')}`);}
function correlation(prefix,workId,signature){return `${prefix}-${digest(`${workId}|${signature}`).slice(0,20)}`;}
async function maybeWork(gateway,workId){try{return await gateway.getWork(workId);}catch(error){if(String(error?.message||error).includes('WORK_NOT_FOUND'))return null;throw error;}}
function refs(value){return Array.isArray(value)?value.map(text).filter(Boolean):[];}

export async function observeHealthIssue(gateway,input={}){
  if(!gateway)throw new Error('SEMANTIC_GATEWAY_REQUIRED');
  const fp=fingerprint(input),workId=workIdFor(fp),signature=observationSignature(fp,input),existing=await maybeWork(gateway,workId);
  const evidenceRefs=refs(input.evidence_refs),severity=upper(input.severity)||'P1',observedAt=text(input.observed_at)||new Date().toISOString();
  if(!existing){
    const created=await gateway.createWork({work_id:workId,title:`Health incident ${required(input,'invariant_or_defect_code')}`,correlation_id:correlation('CORR-HEALTH-NEW',workId,signature),domain:'SYSTEM',kind:'HEALTH_INCIDENT',priority:severity,details:{work_type:'HEALTH_INCIDENT',issue_fingerprint:fp,root_cause_code:required(input,'root_cause_code'),affected_entity:{kind:required(input,'affected_entity_kind'),id:required(input,'affected_entity_id')},health_state:'NEW',severity,material_state:text(input.material_state)||'observed',evidence_refs:evidenceRefs,observation_signature:signature,last_observed_at:observedAt}});
    return {status:'HEALTH_ISSUE_CREATED',state:'NEW',work_id:workId,issue_fingerprint:fp,notify:true,readback:created.readback};
  }
  const state=upper(existing.health_state||existing.state||'NEW');
  if(state!=='RESOLVED'&&text(existing.observation_signature)===signature){
    return {status:'NO_OP_DUPLICATE_HEALTH_ISSUE',state,work_id:workId,issue_fingerprint:fp,notify:false,readback:existing};
  }
  const changes={health_state:state==='RESOLVED'?'REGRESSED':state,severity,material_state:text(input.material_state)||'observed',evidence_refs:[...new Set([...(existing.evidence_refs||[]),...evidenceRefs])],observation_signature:signature,last_observed_at:observedAt};
  let result;
  if(typeof gateway.mutateWork==='function'){
    result=await gateway.mutateWork({work:existing,event_type:state==='RESOLVED'?'HEALTH_ISSUE_REGRESSED':'HEALTH_ISSUE_CHANGED',correlation_id:correlation(state==='RESOLVED'?'CORR-HEALTH-REGRESS':'CORR-HEALTH-CHANGE',workId,signature),writer_role:'EXECUTOR',changes:{...(state==='RESOLVED'?{status:'READY',owner_role:'EXECUTOR'}:{}),...changes},discriminator:state==='RESOLVED'?'health-regress':'health-change'});
  }else{
    result=await gateway.transitionWork('handoff',{work_id:workId,expected_version:Number(existing.entity_version||0),writer_role:'EXECUTOR',target_role:'EXECUTOR',correlation_id:correlation('CORR-HEALTH-FALLBACK',workId,signature),details:changes});
  }
  const nextState=changes.health_state;
  return {status:nextState==='REGRESSED'?'HEALTH_ISSUE_REGRESSED':'HEALTH_ISSUE_CHANGED',state:nextState,work_id:workId,issue_fingerprint:fp,notify:true,readback:result.readback};
}

export async function startHealthRepair(gateway,input={}){
  const workId=required(input,'work_id'),work=await gateway.getWork(workId),repairAction=required(input,'repair_action');
  const result=await gateway.transitionWork('start',{work_id:workId,expected_version:Number(work.entity_version||0),writer_role:'EXECUTOR',correlation_id:correlation('CORR-HEALTH-REPAIR',workId,repairAction),details:{health_state:'REPAIRING',repair_action:repairAction,repair_started_at:text(input.repair_started_at)||new Date().toISOString()}});
  return {status:'HEALTH_REPAIR_STARTED',state:'REPAIRING',work_id:workId,notify:false,readback:result.readback};
}

export async function resolveHealthIssue(gateway,input={}){
  const workId=required(input,'work_id'),summary=required(input,'resolution_summary'),evidence=refs(input.resolution_evidence_refs);if(!evidence.length)throw new Error('RESOLUTION_EVIDENCE_REQUIRED');
  const work=await gateway.getWork(workId);
  const result=await gateway.transitionWork('result',{work_id:workId,expected_version:Number(work.entity_version||0),writer_role:'EXECUTOR',correlation_id:correlation('CORR-HEALTH-RESOLVE',workId,summary),outcome:'VERIFIED',details:{health_state:'RESOLVED',resolution_summary:summary,resolution_evidence_refs:evidence,resolved_at:text(input.resolved_at)||new Date().toISOString()}});
  return {status:'HEALTH_ISSUE_RESOLVED',state:'RESOLVED',work_id:workId,notify:true,readback:result.readback};
}

export const _internal={fingerprint,workIdFor,observationSignature};
