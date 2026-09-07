import baseHandler from './runtime.js';

const BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const DERIVED='DERIVED_NOT_EVIDENCE';
const READ_CACHE='private, max-age=60, stale-while-revalidate=300';
const OPS_SYSTEM={id:'system:AUTOMATION',type:'SYSTEM',label:'Black Box',authority:DERIVED,status:'active',summary:'Flight recorder operacional do NEXO publicado em nexo_ops.'};
const OPS_STAGES=[['ACTIONS','Ações','actions'],['RUNS','Execuções','execution_runs'],['EVENTS','Eventos de runtime','runtime_events']];
const isLearningId=id=>['learning-stage:','observation:','pattern:','lesson:','strategy:','policy:'].some(p=>String(id||'').startsWith(p));
const isOpsId=id=>String(id||'').startsWith('ops-stage:')||['action:','run:','event:'].some(p=>String(id||'').startsWith(p));
const escq=v=>encodeURIComponent(String(v));
const fnv=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)};
const tokenOf=req=>req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
let opsCache=null;

async function select(req,table,q={}){
 const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
 const p=new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
 const r=await fetch(`${BASE}/${escq(table)}?${p}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':'nexo_ops'},signal:AbortSignal.timeout(15000)});
 if(!r.ok){const body=await r.text().catch(()=> '');throw Error(`NEXO_OPS_${r.status}:${body.slice(0,180)}`)}return r.json();
}

async function loadOps(req,force=false){
 if(!force&&opsCache&&Date.now()-opsCache.at<60000)return opsCache.data;
 const [actions,runs,events]=await Promise.all([
  select(req,'actions',{select:'*',order:'updated_at.desc',limit:500}),
  select(req,'execution_runs',{select:'*',order:'created_at.desc',limit:1000}),
  select(req,'runtime_events',{select:'*',order:'occurred_at.desc',limit:2000})
 ]);
 opsCache={at:Date.now(),data:{actions,runs,events}};return opsCache.data;
}

const stageNode=(id,label,count,source)=>({id:`ops-stage:${id}`,type:'DOMAIN',label,authority:DERIVED,status:'active',summary:`${count} registros em nexo_ops.${source}.`,metadata:{opsStage:id,source:`nexo_ops.${source}`,count}});
const actionNode=a=>({id:`action:${a.id}`,canonicalId:String(a.id),type:'ACTION',label:a.title||String(a.id),authority:DERIVED,status:a.status||'unknown',summary:a.blocker_reason||'',domain:a.domain||'',updatedAt:a.updated_at||a.created_at||'',metadata:{priority:a.priority,blocker_reason:a.blocker_reason||'',source_ref:a.source_ref||'',...a.metadata}});
const runNode=r=>({id:`run:${r.id}`,canonicalId:String(r.id),type:'AUTOMATION_RUN',label:`${r.domain||'RUN'} · ${r.status||'unknown'}`,authority:DERIVED,status:r.status||'unknown',summary:r.execution_log||r.runtime_env||'',domain:r.domain||'',updatedAt:r.created_at||'',metadata:{action_id:r.action_id||'',runtime_env:r.runtime_env||'',artifact_hash:r.artifact_hash||'',readback_verified:!!r.readback_verified,...r.metadata}});
const eventNode=e=>({id:`event:${e.event_id}`,canonicalId:String(e.event_id),type:'RUNTIME_EVENT',label:e.component||e.event_type||e.event_id,authority:DERIVED,status:e.status||'unknown',summary:e.summary||'',domain:e.domain||'',updatedAt:e.occurred_at||'',metadata:{event_type:e.event_type||'',component:e.component||'',action_id:e.action_id||'',source_kind:e.source_kind||'',source_id:e.source_id||'',source_ref:e.source_ref||'',payload:e.payload||{}}});
function opsFingerprint(o){return fnv(JSON.stringify({a:o.actions.map(x=>[x.id,x.status,x.updated_at]),r:o.runs.map(x=>[x.id,x.status,x.created_at]),e:o.events.map(x=>[x.event_id,x.status,x.occurred_at])}))}
function sourceVersion(o){return[o.actions[0]?.updated_at,o.runs[0]?.created_at,o.events[0]?.occurred_at].filter(Boolean).sort().at(-1)||''}
function edge(source,target,type='CONTAINS'){return{id:`${source}:${type}:${target}`,source,target,type,authority:DERIVED}}

function opsGraph(o,focus,limit=120){
 const fp=opsFingerprint(o),version=sourceVersion(o),cap=Math.max(1,Math.min(Number(limit)||120,160));
 if(focus==='system:AUTOMATION'){
  const stages=OPS_STAGES.map(([id,label,source])=>stageNode(id,label,o[source==='actions'?'actions':source==='execution_runs'?'runs':'events'].length,source));
  return{focus,nodes:[OPS_SYSTEM,...stages],edges:stages.map(n=>edge(OPS_SYSTEM.id,n.id)),total:stages.length+1,hasMore:false,depth:1,fingerprint:fp,sourceVersion:version,source:'v1',freshness:'LIVE',cache:'HIT',issues:[]};
 }
 if(String(focus).startsWith('ops-stage:')){
  const sid=String(focus).slice(10),def=OPS_STAGES.find(x=>x[0]===sid);if(!def)return null;
  const [id,label,source]=def,rows=source==='actions'?o.actions:source==='execution_runs'?o.runs:o.events;
  const root=stageNode(id,label,rows.length,source),items=rows.slice(0,cap).map(source==='actions'?actionNode:source==='execution_runs'?runNode:eventNode);
  return{focus,nodes:[root,...items],edges:items.map(n=>edge(root.id,n.id)),total:rows.length+1,hasMore:rows.length>items.length,depth:1,fingerprint:fp,sourceVersion:version,source:'v1',freshness:'LIVE',cache:'HIT',issues:[]};
 }
 if(String(focus).startsWith('action:')){const id=String(focus).slice(7),a=o.actions.find(x=>String(x.id)===id);if(!a)return null;const root=actionNode(a),runs=o.runs.filter(r=>String(r.action_id||'')===id).slice(0,cap).map(runNode);return{focus,nodes:[root,...runs],edges:runs.map(n=>edge(root.id,n.id,'EXECUTED_AS')),total:runs.length+1,hasMore:false,depth:1,fingerprint:fp,sourceVersion:version,source:'v1',freshness:'LIVE',cache:'HIT',issues:[]}}
 if(String(focus).startsWith('run:')){const id=String(focus).slice(4),r=o.runs.find(x=>String(x.id)===id);if(!r)return null;const root=runNode(r),a=r.action_id?o.actions.find(x=>String(x.id)===String(r.action_id)):null,nodes=a?[root,actionNode(a)]:[root],edges=a?[edge(`action:${a.id}`,root.id,'EXECUTED_AS')]:[];return{focus,nodes,edges,total:nodes.length,hasMore:false,depth:1,fingerprint:fp,sourceVersion:version,source:'v1',freshness:'LIVE',cache:'HIT',issues:[]}}
 if(String(focus).startsWith('event:')){const id=String(focus).slice(6),e=o.events.find(x=>String(x.event_id)===id);if(!e)return null;const root=eventNode(e),a=e.action_id?o.actions.find(x=>String(x.id)===String(e.action_id)):null,nodes=a?[root,actionNode(a)]:[root],edges=a?[edge(`action:${a.id}`,root.id,'OBSERVED_AS')]:[];return{focus,nodes,edges,total:nodes.length,hasMore:false,depth:1,fingerprint:fp,sourceVersion:version,source:'v1',freshness:'LIVE',cache:'HIT',issues:[]}}
 return null;
}

function findOpsEntity(o,id){
 if(String(id).startsWith('ops-stage:')){const sid=String(id).slice(10),def=OPS_STAGES.find(x=>x[0]===sid);if(!def)return null;const [stage,label,source]=def,rows=source==='actions'?o.actions:source==='execution_runs'?o.runs:o.events;return stageNode(stage,label,rows.length,source)}
 if(String(id).startsWith('action:')){const x=o.actions.find(x=>String(x.id)===String(id).slice(7));return x?actionNode(x):null}
 if(String(id).startsWith('run:')){const x=o.runs.find(x=>String(x.id)===String(id).slice(4));return x?runNode(x):null}
 if(String(id).startsWith('event:')){const x=o.events.find(x=>String(x.event_id)===String(id).slice(6));return x?eventNode(x):null}
 return null;
}
function opsRelations(o,id){
 const rel=[];
 if(String(id).startsWith('ops-stage:'))return opsGraph(o,id,160)?.edges||[];
 if(String(id).startsWith('action:')){const aid=String(id).slice(7);for(const r of o.runs.filter(x=>String(x.action_id||'')===aid))rel.push(edge(id,`run:${r.id}`,'EXECUTED_AS'));for(const e of o.events.filter(x=>String(x.action_id||'')===aid))rel.push(edge(id,`event:${e.event_id}`,'OBSERVED_AS'))}
 if(String(id).startsWith('run:')){const r=o.runs.find(x=>`run:${x.id}`===id);if(r?.action_id)rel.push(edge(`action:${r.action_id}`,id,'EXECUTED_AS'))}
 if(String(id).startsWith('event:')){const e=o.events.find(x=>`event:${x.event_id}`===id);if(e?.action_id)rel.push(edge(`action:${e.action_id}`,id,'OBSERVED_AS'))}
 return rel;
}

function callBase(req,res){
 if(req.method==='GET'){
  const raw=res.setHeader.bind(res);
  res.setHeader=(k,v)=>raw(k,String(k).toLowerCase()==='cache-control'?READ_CACHE:v);
 }
 return baseHandler(req,res);
}

export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control',req.method==='GET'?READ_CACHE:'private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const u=new URL(req.url||'/','https://atlas.local'),q=Object.fromEntries(u.searchParams),route=q.route||u.pathname.split('/').pop(),send=(x,s=200)=>{res.statusCode=s;res.end(JSON.stringify(x))};
 try{
  if(route==='entity'&&q.view==='files'&&(isLearningId(q.id)||isOpsId(q.id)))return send([]);
  if(route==='graph'&&(q.focus==='system:AUTOMATION'||isOpsId(q.focus))){const o=await loadOps(req),g=opsGraph(o,q.focus||'system:AUTOMATION',q.limit);if(g)return send(g)}
  if(route==='entity'&&isOpsId(q.id)){
   const o=await loadOps(req);if(q.view==='lineage'){const g=opsGraph(o,q.id,q.limit);return send(g||{focus:q.id,nodes:[],edges:[],total:0,source:'v1',freshness:'LIVE'})}
   const entity=findOpsEntity(o,q.id);if(!entity)return send({error:'ENTITY_NOT_FOUND'},404);const relations=opsRelations(o,q.id);return send({entity,relations:relations.slice(0,200),relationCount:relations.length,source:'v1'});
  }
  if(route==='automation-runs'){const o=await loadOps(req);return send(o.runs.map(runNode))}
  if(route==='ops'){
   const o=await loadOps(req),blocked=o.actions.filter(x=>/BLOCK|FAIL|ERROR/i.test(x.status||'')).length,success=o.runs.filter(x=>/SUCCESS|PASS|COMPLETE/i.test(x.status||'')).length,readback=o.runs.filter(x=>x.readback_verified).length;
   return send({officialFrontend:true,source:'v1',freshness:'LIVE',truthFlow:['Drive','Neon','Atlas'],learningProjection:true,blackBoxProjection:true,fingerprint:opsFingerprint(o),sourceVersion:sourceVersion(o),counts:{actions:o.actions.length,runs:o.runs.length,events:o.events.length,blocked,success,readbackVerified:readback},actions:o.actions.slice(0,20).map(actionNode),runs:o.runs.slice(0,20).map(runNode),events:o.events.slice(0,30).map(eventNode)});
  }
  return callBase(req,res);
 }catch(e){console.error('[atlas:runtime-v2]',route,e?.message||e);return callBase(req,res)}
}
