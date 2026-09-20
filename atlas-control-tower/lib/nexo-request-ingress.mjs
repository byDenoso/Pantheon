import {createHash} from 'node:crypto';

const TERMINAL=new Set(['DONE','VERIFIED','REJECTED','FAILED','SUPERSEDED']);
const ROLES=new Set(['DAILY','ADVISOR','EXECUTOR','LEARNER','EMERGENT']);
const MAX_REFS=20;
const ROUTINE=['action','workflow','deploy','hosting','vercel','github actions','tower','drive','sync','sincron','automation','automação','job','runner'];
const ARCH=['architect','arquitet','layer','camada','service','serviço','servico','mechanism','mecanismo','runtime','pipeline','governance','governança'];
const AUTH=['authorize','authorized','approve','approved','autorizo','autorizado','aprovo','aprovado'];
const ESC={
 L4_OR_HIGHER:['l4','l5','l6','autonomy ceiling','authority expansion'],
 IRREVERSIBLE:['irreversible','irreversível','delete production','destroy production','drop production'],
 STRATEGIC_DECISION:['strategic decision','decisão estratégica','decisao estrategica'],
 CLAIM_BOUNDARY:['claim boundary','fronteira da claim','publication claim','scientific claim']
};
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const norm=value=>clean(value).toLocaleLowerCase('pt-BR');
const canonical=value=>{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);};
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
function requireIdentifier(value,field){const v=clean(value);if(!v||v.includes('..')||!IDENTIFIER.test(v))throw new Error('INVALID_IDENTIFIER:'+field);return v;}
function compactList(values){if(values==null||values==='')return [];if(!Array.isArray(values))throw new Error('REQUEST_LIST_FIELD_INVALID');const out=[];for(const raw of values){const v=clean(raw);if(v&&!out.includes(v))out.push(v.slice(0,500));}return out.slice(0,MAX_REFS);}
function appendUnique(existing,value){const out=Array.isArray(existing)?existing.map(clean).filter(Boolean):[];const idx=out.indexOf(value);if(idx>=0)out.splice(idx,1);out.push(value);return out.slice(-MAX_REFS);}
function appendRef(existing,value){const out=Array.isArray(existing)?existing.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>({...x})):[];out.push(value);return out.slice(-MAX_REFS);}
function requestFingerprint({action,subject,scope,domain,target_work_id}){return hash(canonical({action:norm(action),subject:norm(subject),scope:norm(scope),domain:norm(domain),target_work_id:norm(target_work_id)}));}
function requestId(prefix,...parts){return 'REQ-API-INGRESS-'+prefix+'-'+hash(parts.map(canonical).join('|')).slice(0,24).toUpperCase();}
function disposition(action,text){const a=norm(action);if(['merge','consolid','integrat','unif','agrupar'].some(x=>a.includes(x)))return 'MERGE';if(['extend','improve','enhance','add','melhor','ampli','expand'].some(x=>a.includes(x)))return 'EXTEND';if(['supersede','replace','substitu','aposent','retir'].some(x=>a.includes(x)))return 'SUPERSEDE';if(['create','new','criar','novo','nova'].some(x=>a.includes(x)))return 'CREATE_CANDIDATE';return ARCH.some(x=>text.includes(x))?'EXTEND':'NOT_APPLICABLE';}
async function activeP0(towerGateway){
 const index=await towerGateway.readActiveWorkIndex().catch(()=>({work:[]}));
 const refs=[];for(const item of index?.work||[]){if(!item||typeof item!=='object')continue;const status=clean(item.status).toUpperCase();if(TERMINAL.has(status))continue;const p=clean(item.priority).toUpperCase();if(!['P0','CRITICAL'].includes(p))continue;const id=clean(item.id||item.work_id);if(id)refs.push(id);if(refs.length>=5)break;}return refs;
}
async function operatorContract(towerGateway,{action,subject,scope,constraints,existing}){
 const text=norm([action,subject,scope,...constraints].join(' ')),authorization=Boolean(existing)&&AUTH.some(x=>text.includes(x));
 const prior=existing?.operator_contract&&typeof existing.operator_contract==='object'?existing.operator_contract:{};
 const priorEsc=prior.escalation&&typeof prior.escalation==='object'?prior.escalation:{};
 let reasons=authorization?[]:Object.entries(ESC).filter(([,markers])=>markers.some(x=>text.includes(x))).map(([key])=>key);
 if(!authorization&&priorEsc.required)reasons=[...(priorEsc.reasons||reasons)];
 const architecture=disposition(action,text),p0=architecture==='CREATE_CANDIDATE'?await activeP0(towerGateway):[];
 const routine=Boolean(existing)&&ROUTINE.some(x=>text.includes(x));
 return {
  contract:'DENER_OPERATOR_CONTRACT_V1',
  human_role:'INTENT_PRIORITY_CLAIM_BOUNDARY_L4_IRREVERSIBLE_ONLY',
  routine_operations_owner:'NEXO',
  escalation:{required:Boolean(reasons.length),reasons,state:reasons.length?'NEEDS_DENER':authorization?'AUTHORIZED':'AUTONOMOUS'},
  architecture:{order:['MERGE','EXTEND','SUPERSEDE','CREATE'],disposition:architecture,create_is_last_resort:true},
  closure:{p0_pressure:Boolean(p0.length),p0_refs:p0,scheduling_class:p0.length?'AFTER_P0_CLOSURE':'NORMAL'},
  operational_followups:Number(prior.operational_followups||0)+(routine?1:0)
 };
}
async function readWork(towerGateway,id){
 let item=await towerGateway.readEntity('work',id);
 if(!item){const index=await towerGateway.readActiveWorkIndex().catch(()=>({work:[]}));item=(index?.work||[]).find(x=>String(x?.id||x?.work_id||'')===id)||null;}
 return item;
}
async function persist(towerGateway,request){
 const result=await towerGateway.submitTowerMutation(request),entity=await readWork(towerGateway,request.entity_name);
 if(!entity)throw new Error('REQUEST_INGRESS_READBACK_MISSING');
 return {...result,readback:'PASS',entity};
}

export function createRequestIngressSurface({towerGateway}={}){
 if(!towerGateway)throw new Error('TOWER_GATEWAY_REQUIRED');
 async function ingestRequest(payload={}){
  if(payload.actionable===false)return {admitted:false,outcome:'REJECTED_NON_ACTIONABLE',readback:'NOT_APPLICABLE'};
  const control=await towerGateway.readControl();if(String(control?.mode||'').toUpperCase()!=='ACTIVE')throw new Error('TOWER_NOT_ACTIVE');
  const thread=clean(payload.thread_id),action=clean(payload.action),subject=clean(payload.subject),scope=clean(payload.scope),domain=clean(payload.domain).toUpperCase(),owner=clean(payload.owner_role).toUpperCase();
  if(!thread||!action||!subject||!domain||!owner)throw new Error('REQUEST_INGRESS_INVALID');
  if(!ROLES.has(owner))throw new Error('REQUEST_OWNER_NOT_SUPPORTED');
  const constraints=compactList(payload.constraints),acceptance=compactList(payload.acceptance),priority=clean(payload.priority).toUpperCase()||'NORMAL';
  const target=clean(payload.target_work_id)?requireIdentifier(payload.target_work_id,'target_work_id'):null;
  const fingerprint=requestFingerprint({action,subject,scope,domain,target_work_id:target}),correlation=clean(payload.correlation_id)||'REQ-'+fingerprint.slice(0,20).toUpperCase(),workId=target||'WORK::REQ::'+fingerprint.slice(0,16);
  const existing=await readWork(towerGateway,workId);
  if(target&&!existing)throw new Error('TARGET_WORK_NOT_FOUND');
  const contract=await operatorContract(towerGateway,{action,subject,scope,constraints,existing});
  if(existing&&TERMINAL.has(clean(existing.status).toUpperCase()))return {admitted:true,outcome:'TERMINAL_MATCH',work_id:workId,request_fingerprint:fingerprint,readback:'PASS'};
  const observed=new Date().toISOString(),summary={action:action.slice(0,120),subject:subject.slice(0,300),scope:scope.slice(0,500),constraints,acceptance};
  if(existing){
    const version=Number(existing.entity_version||0),requestRef={thread_id:thread,correlation_id:correlation,observed_at:observed,fingerprint};
    const changes={thread_id:thread,last_request:summary,last_request_fingerprint:fingerprint,last_request_at:observed,request_count:Number(existing.request_count||0)+1,request_refs:appendRef(existing.request_refs,requestRef),source_threads:appendUnique(existing.source_threads,thread),request_fingerprints:appendUnique(existing.request_fingerprints,fingerprint),constraints:compactList([...(Array.isArray(existing.constraints)?existing.constraints:[]),...constraints]),acceptance:compactList([...(Array.isArray(existing.acceptance)?existing.acceptance:[]),...acceptance]),priority,status:clean(existing.status).toUpperCase()||'READY',operator_contract:contract};
    const request={request_id:requestId('MERGE',workId,version,fingerprint,thread,correlation),entity_kind:'work',entity_name:workId,expected_version:version,writer_role:'ADVISOR',material:true,correlation_id:correlation,changes,event_type:'REQUEST_MERGED'};
    return {admitted:true,outcome:'MERGED',work_id:workId,request_fingerprint:fingerprint,operator_contract:contract,...await persist(towerGateway,request)};
  }
  const requestRef={thread_id:thread,correlation_id:correlation,observed_at:observed,fingerprint};
  const changes={status:'READY',owner_role:owner,title:subject.slice(0,300),kind:'TASK',priority,domain,thread_id:thread,request_fingerprint:fingerprint,last_request_fingerprint:fingerprint,last_request:summary,last_request_at:observed,request_count:1,request_refs:[requestRef],source_threads:[thread],request_fingerprints:[fingerprint],constraints,acceptance,operator_contract:contract};
  const request={request_id:'REQ-API-INGRESS-CREATE-'+fingerprint.slice(0,24).toUpperCase(),entity_kind:'work',entity_name:workId,expected_version:0,writer_role:'ADVISOR',material:true,correlation_id:correlation,changes,event_type:'REQUEST_INGESTED'};
  return {admitted:true,outcome:'CREATED',work_id:workId,request_fingerprint:fingerprint,operator_contract:contract,...await persist(towerGateway,request)};
 }
 async function ingestObjective(payload={}){
  const goal=clean(payload.goal);if(!goal)throw new Error('OBJECTIVE_GOAL_REQUIRED');
  const domain=clean(payload.domain||'ENGINEERING').toUpperCase();
  return ingestRequest({thread_id:clean(payload.thread_id)||'THR::'+domain+'::OBJECTIVE',action:clean(payload.action)||'PURSUE_OBJECTIVE',subject:goal,scope:clean(payload.scope),domain,owner_role:clean(payload.owner_role||'EXECUTOR').toUpperCase(),constraints:payload.constraints||[],acceptance:payload.acceptance||[],priority:clean(payload.priority||'NORMAL').toUpperCase(),correlation_id:payload.correlation_id,target_work_id:payload.target_work_id,actionable:true});
 }
 return {ingestRequest,ingestObjective};
}

export const _internal={requestFingerprint,requestId,compactList,appendUnique,appendRef,disposition};
