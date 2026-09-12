const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase().replace(/[\s-]+/g,'_');
const arr=value=>Array.isArray(value)?value:[];
const ACTIVE_ROLES=['DAILY','EXECUTOR','LEARNER','EMERGENT','ADVISOR'];
const ROLE_ALIASES=new Map([
 ['DAILY','DAILY'],['EXECUTOR','EXECUTOR'],['LEARNER','LEARNER'],['EMERGENT','EMERGENT'],['EMERGENT_LEARNING','EMERGENT'],
 ['ADVISOR','ADVISOR'],['RESEARCH_ADVISOR','ADVISOR']
]);
const ROLE_LABEL={DAILY:'NEXO Daily',EXECUTOR:'NEXO Executor',LEARNER:'NEXO Learner',EMERGENT:'NEXO Emergent Learning',ADVISOR:'NEXO Research Advisor'};
const roleOf=value=>ROLE_ALIASES.get(upper(value))||'';
const eventStamp=row=>text(row.timestamp||row.created_at||row.updated_at);
const eventStatus=row=>text(row.state_to)||text(row.status)||text(row.result).split('|')[0].trim()||text(row.event_type)||'OBSERVED';
const systemRows=snapshot=>arr(snapshot?.sections?.SYSTEM);
const eventRows=snapshot=>arr(snapshot?.sections?.EVENTS);
const workRows=snapshot=>arr(snapshot?.sections?.WORK);

function systemValue(snapshot,key){
 const rows=systemRows(snapshot).filter(row=>text(row.key)===key).sort((a,b)=>text(b.updated_at).localeCompare(text(a.updated_at)));
 return rows[0]?.value||'';
}
function configuredRoles(snapshot){
 const configured=systemValue(snapshot,'AUTOMATION_ROLES').split('|').map(roleOf).filter(Boolean);
 return configured.length?[...new Set(configured)]:ACTIVE_ROLES;
}
function latestRoleEvent(snapshot,role){
 return eventRows(snapshot).filter(row=>roleOf(row.source_role)===role).sort((a,b)=>eventStamp(b).localeCompare(eventStamp(a)))[0]||null;
}
function fallbackRoleStamp(snapshot,role){return text(systemRows(snapshot).filter(row=>text(row.key)===`LAST_${role}`).sort((a,b)=>text(b.updated_at).localeCompare(text(a.updated_at)))[0]?.value)}
function readbackVerified(row){return /READBACK|VERIFIED|PASS/.test(upper(`${row?.result||''} ${row?.state_to||''} ${row?.evidence_ref||''}`))}

export function cockpitAutomationRuns(snapshot){
 return configuredRoles(snapshot).map(role=>{
  const event=latestRoleEvent(snapshot,role),updatedAt=eventStamp(event||{})||fallbackRoleStamp(snapshot,role),status=event?eventStatus(event):'ACTIVE';
  return {id:`automation:${role}`,label:ROLE_LABEL[role]||role,status,domain:'NEXO',summary:event?`${text(event.event_type)||'ATIVIDADE'} · estado canônico publicado`:'Automação ativa; sem evento canônico recente no recorte.',updatedAt,metadata:{loop:ROLE_LABEL[role]||role,checkpoint:'SSOT',readback_verified:event?readbackVerified(event):false,source:'CANONICAL_SSOT'}};
 });
}
function normalizedEvents(snapshot){
 return eventRows(snapshot).map(row=>({id:text(row.event_id),label:text(row.event_type)||text(row.event_id),status:eventStatus(row),domain:'NEXO',summary:text(row.summary)||`${roleOf(row.source_role)||'SYSTEM'} · ${text(row.event_type)||'EVENT'}`,updatedAt:eventStamp(row),metadata:{event_type:text(row.event_type),component:roleOf(row.source_role)||text(row.source_role),source_role:roleOf(row.source_role),target_role:roleOf(row.target_role),correlation_id:text(row.correlation_id),payload:{readback_required:false}}})).filter(row=>row.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function normalizedWork(snapshot){
 return workRows(snapshot).map(row=>({id:text(row.work_id),label:text(row.question)||text(row.work_id),status:text(row.status),domain:text(row.domain)||'NEXO',summary:text(row.next_step),updatedAt:text(row.updated_at),metadata:{kind:text(row.kind),priority:text(row.priority),authority:text(row.authority),verification_status:text(row.verification_status),result_ref:text(row.result_ref)}})).filter(row=>row.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function meta(projected,snapshot){return {source:projected?.source||'drive',freshness:projected?.freshness||'LIVE',sourceVersion:projected?.sourceVersion||snapshot?.sourceModifiedAt||snapshot?.generatedAt||'',fingerprint:projected?.fingerprint||snapshot?.fingerprint||'',authority:'GOOGLE_DRIVE',projectionOnly:true,sourceRef:projected?.sourceRef||'',access:snapshot?.access||'SERVICE'}}
function graph(projected,snapshot,focus,nodes,edges,extra={}){return {...meta(projected,snapshot),focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:1,cache:'LIVE',issues:[],...extra}}
function operationsRoot(projected,snapshot){
 const runs=cockpitAutomationRuns(snapshot),events=normalizedEvents(snapshot),work=normalizedWork(snapshot);
 const root={id:'system:OPERATIONS',type:'SYSTEM',label:'Operação',status:'ACTIVE',summary:'Automações, trabalho, eventos e estado operacional do NEXO.'};
 const domains=[
  {id:'domain:AUTOMATIONS',domain:'AUTOMATIONS',type:'DOMAIN',label:'Automações',status:'ACTIVE',summary:`${runs.length} papéis ativos publicados pelo estado canônico.`},
  ...(work.length?[{id:'domain:WORK',domain:'WORK',type:'DOMAIN',label:'Work',status:'ACTIVE',summary:`${work.length} itens de trabalho no recorte canônico.`}]:[]),
  {id:'domain:EVENTS',domain:'EVENTS',type:'DOMAIN',label:'Eventos',status:'ACTIVE',summary:`${events.length} eventos no recorte canônico.`},
  {id:'domain:SYSTEM',domain:'SYSTEM',type:'DOMAIN',label:'Sistema',status:'ACTIVE',summary:'Versão, runtime, conectores e política operacional publicada.'}
 ];
 return graph(projected,snapshot,root.id,[root,...domains],domains.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}
function operationalDetail(projected,snapshot,focus){
 const key=text(focus).replace(/^domain:/,'').toUpperCase();
 let children=[];
 if(key==='AUTOMATIONS')children=cockpitAutomationRuns(snapshot).map(run=>({...run,type:'AUTOMATION'}));
 if(key==='WORK')children=normalizedWork(snapshot).filter(row=>!/SUPERSEDED|REJECTED|RETIRED/.test(upper(row.status))).slice(0,96).map(row=>({...row,type:'WORK'}));
 if(key==='EVENTS')children=normalizedEvents(snapshot).slice(0,96).map(row=>({...row,type:'EVENT'}));
 if(key==='SYSTEM')children=systemRows(snapshot).filter(row=>!/SUPERSEDED|RETIRED/.test(upper(row.status))).slice(-96).map(row=>({id:text(row.system_id)||`system-config:${text(row.key)}`,type:'CONFIG',label:text(row.key)||text(row.system_id),status:text(row.status),summary:text(row.value),updatedAt:text(row.updated_at)}));
 const labels={AUTOMATIONS:'Automações',WORK:'Work',EVENTS:'Eventos',SYSTEM:'Sistema'},root={id:`domain:${key}`,type:'DOMAIN',domain:key,label:labels[key]||key,status:'ACTIVE'};
 return graph(projected,snapshot,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
}

export function enhanceCockpitRoute(snapshot,route,query={},projected){
 if(route==='automation-runs')return cockpitAutomationRuns(snapshot);
 if(route==='ops'){
  const runs=cockpitAutomationRuns(snapshot),events=normalizedEvents(snapshot),actions=normalizedWork(snapshot),base=projected&&typeof projected==='object'?projected:{};
  return {...base,...meta(base,snapshot),counts:{blocked:actions.filter(row=>/BLOCK/.test(upper(row.status))).length,runs:runs.length,success:runs.filter(row=>!/FAIL|BLOCK|ERROR/.test(upper(row.status))).length,readbackVerified:runs.filter(row=>row.metadata.readback_verified).length},actions,runs,events};
 }
 if(route!=='graph')return projected;
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:NEXO'){
  const base=projected&&typeof projected==='object'?projected:{};let nodes=arr(base.nodes),edges=arr(base.edges);
  if(snapshot?.access==='PUBLIC_SANITIZED'){nodes=nodes.filter(node=>text(node.id)!=='system:OLYMPUS');edges=edges.filter(edge=>text(edge.source)!=='system:OLYMPUS'&&text(edge.target)!=='system:OLYMPUS')}
  if(!nodes.some(node=>text(node.id)==='system:OPERATIONS'))nodes=[...nodes,{id:'system:OPERATIONS',type:'SYSTEM',label:'Operação',status:'ACTIVE',summary:'Automações, eventos e saúde operacional do NEXO.'}];
  if(!edges.some(edge=>text(edge.source)==='system:NEXO'&&text(edge.target)==='system:OPERATIONS'))edges=[...edges,{id:'contains:system:NEXO:system:OPERATIONS',source:'system:NEXO',target:'system:OPERATIONS',type:'CONTAINS',declared:true}];
  return {...base,...meta(base,snapshot),nodes,edges,total:nodes.length};
 }
 if(focus==='system:OPERATIONS')return operationsRoot(projected,snapshot);
 if(/^domain:(AUTOMATIONS|WORK|EVENTS|SYSTEM)$/i.test(focus))return operationalDetail(projected,snapshot,focus);
 return projected;
}
