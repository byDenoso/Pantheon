import {createHash} from 'node:crypto';

const text=value=>String(value??'').trim().replace(/\s+/g,' ');
const upper=value=>text(value).toUpperCase();
const normalize=value=>text(value).toLocaleLowerCase('en-US');
const digest=value=>createHash('sha256').update(String(value)).digest('hex').toUpperCase();
function canonical(value){if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(canonical);return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function stableHash(...parts){return digest(parts.map(part=>JSON.stringify(canonical(part))).join('|'));}
function required(input,key){const value=text(input?.[key]);if(!value)throw new Error(`${key.toUpperCase()}_REQUIRED`);return value;}
function fingerprint(input){const parts=['invariant_or_defect_code','affected_entity_kind','affected_entity_id','root_cause_code'].map(key=>normalize(required(input,key)));return stableHash(...parts);}
function workIdFor(fp){return `WORK-HEALTH-${fp.slice(0,20)}`;}
function observationSignature(fp,input){return stableHash(fp,normalize(input.severity||'P0'),normalize(input.material_state||''));}
function healthRequestId(fp,eventType,expectedVersion,discriminator){return `REQ-HEALTH-${stableHash(fp,eventType,expectedVersion,discriminator).slice(0,20)}`;}
async function maybeWork(gateway,workId){try{return await gateway.getWork(workId);}catch(error){if(String(error?.message||error).includes('WORK_NOT_FOUND'))return null;throw error;}}
function refs(value){return Array.isArray(value)?value.map(item=>String(item).trim()).filter(Boolean):[];}
function requireHealthWork(work,workId){if(upper(work?.work_type)!=='HEALTH_INCIDENT')throw new Error(`NOT_HEALTH_INCIDENT:${workId}`);return work;}

export async function observeHealthIssue(gateway,input={}){
  if(!gateway)throw new Error('SEMANTIC_GATEWAY_REQUIRED');
  const fp=fingerprint(input),workId=workIdFor(fp),signature=observationSignature(fp,input),existing=await maybeWork(gateway,workId);
  const invariant=required(input,'invariant_or_defect_code'),affectedKind=required(input,'affected_entity_kind'),affectedId=required(input,'affected_entity_id'),rootCause=required(input,'root_cause_code');
  const evidenceRefs=refs(input.evidence_refs),severity=upper(input.severity||'P0'),materialState=text(input.material_state);
  if(!existing){
    const created=await gateway.createWork({work_id:workId,title:`Health incident: ${invariant}`,correlation_id:`HEALTH-${fp.slice(0,20)}`,domain:'SYSTEM',kind:'HEALTH_INCIDENT',priority:severity,details:{work_type:'HEALTH_INCIDENT',issue_fingerprint:fp,invariant_or_defect_code:invariant,affected_entity_kind:affectedKind,affected_entity_id:affectedId,root_cause_code:rootCause,health_state:'NEW',severity,material_state:materialState,observation_signature:signature,evidence_refs:evidenceRefs}});
    return {status:'HEALTH_ISSUE_CREATED',state:'NEW',notify:true,work_id:workId,issue_fingerprint:fp,mutation:{request_id:created.request_id,status:created.status},readback:created.readback};
  }
  const work={...existing};
  if(text(work.issue_fingerprint)!==fp)throw new Error(`HEALTH_IDENTITY_COLLISION:${workId}`);
  const state=upper(work.health_state||'NEW'),sameObservation=text(work.observation_signature)===signature;
  if(state!=='RESOLVED'&&sameObservation)return {status:'NO_OP_DUPLICATE_HEALTH_ISSUE',state,notify:false,work_id:workId,issue_fingerprint:fp,readback:work};
  const expectedVersion=Number(work.entity_version||0),regressed=state==='RESOLVED';
  const changes=regressed?{status:'READY',owner_role:'EXECUTOR',health_state:'REGRESSED',severity,material_state:materialState,observation_signature:signature,evidence_refs:evidenceRefs}:{health_state:state,severity,material_state:materialState,observation_signature:signature,evidence_refs:evidenceRefs};
  if(typeof gateway.mutateWork!=='function')throw new Error('HEALTH_DIRECT_MUTATION_UNAVAILABLE');
  const eventType=regressed?'HEALTH_ISSUE_REGRESSED':'HEALTH_ISSUE_CHANGED';
  const mutation=await gateway.mutateWork({work,event_type:eventType,correlation_id:`HEALTH-${fp.slice(0,20)}`,writer_role:'ADVISOR',changes,discriminator:signature,request_id:healthRequestId(fp,eventType,expectedVersion,signature)});
  return {status:regressed?'HEALTH_ISSUE_REGRESSED':'HEALTH_ISSUE_CHANGED',state:regressed?'REGRESSED':state,notify:true,work_id:workId,issue_fingerprint:fp,mutation:{request_id:mutation.request_id,status:mutation.status},readback:mutation.readback};
}

export async function startHealthRepair(gateway,input={}){
  const workId=required(input,'work_id'),work=requireHealthWork(await gateway.getWork(workId),workId);
  if(upper(work.health_state)==='REPAIRING'&&upper(work.status)==='RUNNING')return {status:'NO_OP_ALREADY_REPAIRING',state:'REPAIRING',work_id:workId,readback:work};
  const repairAction=required(input,'repair_action'),fp=text(work.issue_fingerprint);
  const result=await gateway.transitionWork('start',{work_id:workId,expected_version:Number(work.entity_version||0),writer_role:'EXECUTOR',correlation_id:`HEALTH-REPAIR-${fp.slice(0,20)}`,details:{health_state:'REPAIRING',repair_action:repairAction}});
  return {status:'HEALTH_REPAIR_STARTED',state:'REPAIRING',work_id:workId,mutation:{request_id:result.request_id,status:result.status},readback:result.readback};
}

export async function resolveHealthIssue(gateway,input={}){
  const workId=required(input,'work_id'),work=requireHealthWork(await gateway.getWork(workId),workId);
  if(upper(work.health_state)==='RESOLVED')return {status:'NO_OP_ALREADY_RESOLVED',state:'RESOLVED',work_id:workId,readback:work};
  const summary=required(input,'resolution_summary'),evidence=refs(input.resolution_evidence_refs);if(!evidence.length)throw new Error('RESOLUTION_EVIDENCE_REQUIRED');
  const fp=text(work.issue_fingerprint),result=await gateway.transitionWork('result',{work_id:workId,expected_version:Number(work.entity_version||0),writer_role:'EXECUTOR',correlation_id:`HEALTH-RESOLVE-${fp.slice(0,20)}`,outcome:'VERIFIED',details:{health_state:'RESOLVED',resolution_summary:summary,resolution_evidence_refs:evidence}});
  return {status:'HEALTH_ISSUE_RESOLVED',state:'RESOLVED',work_id:workId,mutation:{request_id:result.request_id,status:result.status},readback:result.readback};
}

export const _internal={fingerprint,workIdFor,observationSignature,stableHash,healthRequestId};
