import {createHash} from 'node:crypto';

const SAFE_SYSTEM_KEYS=new Set([
 'NEXO_VERSION','MIGRATION_PHASE','WRITE_MODEL','WRITE_GUARD','AUTOMATION_STATUS','AUTOMATION_ROLES',
 'RUNTIME_STATUS','CONNECTOR_STATUS','RUN_LOCK','STATE_MODEL','NEXO_CONTROL_PLANE_VERSION','EXTERNAL_DISPATCH_MODE',
 'SNAPSHOT_PIPELINE','LAST_DAILY','LAST_ADVISOR','LAST_EXECUTOR','LAST_LEARNER','LAST_EMERGENT'
]);
const ROLE_ALIASES=new Map([
 ['DAILY','DAILY'],['EXECUTOR','EXECUTOR'],['LEARNER','LEARNER'],['EMERGENT','EMERGENT'],
 ['EMERGENT_LEARNING','EMERGENT'],['ADVISOR','ADVISOR'],['RESEARCH_ADVISOR','ADVISOR']
]);
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase().replace(/[\s-]+/g,'_');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const roleOf=row=>ROLE_ALIASES.get(upper(row?.source_role))||ROLE_ALIASES.get(upper(row?.target_role))||'';
const eventStatus=row=>text(row?.state_to)||text(row?.result).split('|')[0].trim()||text(row?.event_type)||'OBSERVED';

function sanitizeSystem(rows=[]){
 return rows.filter(row=>SAFE_SYSTEM_KEYS.has(text(row?.key))).map(row=>({
  system_id:text(row.system_id),key:text(row.key),value:text(row.value),status:text(row.status),updated_at:text(row.updated_at)
 }));
}
function sanitizeEvents(rows=[]){
 return rows.filter(row=>roleOf(row)).sort((a,b)=>text(b.timestamp).localeCompare(text(a.timestamp))).slice(0,240).map(row=>{
  const role=roleOf(row),timestamp=text(row.timestamp),eventType=text(row.event_type)||'ACTIVITY';
  return {
   event_id:`EVT::PUBLIC::${hash([role,timestamp,eventType,text(row.correlation_id)]).slice(0,20)}`,
   timestamp,event_type:eventType,summary:`${role} · ${eventType}`,result:eventStatus(row),
   source_role:role,target_role:ROLE_ALIASES.get(upper(row.target_role))||'',state_from:text(row.state_from),state_to:text(row.state_to),severity:text(row.severity)
  };
 });
}
function sanitizeProjection(rows=[],kind=''){return rows.map(row=>{
 const base={record_type:text(row.record_type||row.type),record_id:text(row.record_id||row.id),status:text(row.status),title:text(row.title),summary:text(row.summary),parent_id:text(row.parent_id)};
 if(kind==='Science')return {...base,domain:text(row.domain)};
 return base;
}).filter(row=>row.record_id||row.record_type);}

export function buildPublicAtlasSsot(snapshot){
 const sections={THREADS:[],WORK:[],EVENTS:sanitizeEvents(snapshot?.sections?.EVENTS||[]),KNOWLEDGE:[],DECISIONS:[],SYSTEM:sanitizeSystem(snapshot?.sections?.SYSTEM||[])};
 const projections={
  Science:sanitizeProjection(snapshot?.projections?.Science||[],'Science'),
  Engineering:sanitizeProjection(snapshot?.projections?.Engineering||[],'Engineering'),
  Olympus:[],StructuralLearning:[],CrossDomain:[],Integrity:[]
 };
 const semantic={sourceFileId:text(snapshot?.sourceFileId),sections,projections,access:'PUBLIC_SANITIZED'};
 return {
  contract:'NEXO_ATLAS_SSOT_V1',authority:'GOOGLE_DRIVE',projectionAuthority:'DERIVED_FROM_SSOT',projectionOnly:true,
  access:'PUBLIC_SANITIZED',privacyGate:'OLYMPUS_EXCLUDED',sourceFileId:text(snapshot?.sourceFileId),
  sourceModifiedAt:text(snapshot?.sourceModifiedAt),generatedAt:text(snapshot?.generatedAt),fingerprint:`sha256:${hash(semantic)}`,
  sections,projections,counts:{...Object.fromEntries(Object.entries(sections).map(([key,value])=>[key,value.length])),...Object.fromEntries(Object.entries(projections).map(([key,value])=>[key,value.length]))}
 };
}
