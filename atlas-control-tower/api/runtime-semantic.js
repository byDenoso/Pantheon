import baseHandler from './runtime-v2.js';
import {isFastRootQuery,systemRootGraph,semanticIndexMode,contentRangeTotal} from '../lib/system-overview.mjs';

const BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const PROFILE='flight_api';
const TABLE='atlas_cockpit_index';
const OLYMPUS_PROFILE='olympus';
const TTL=60000;
let cockpitCache=null,olympusCache=null;

const tokenOf=req=>req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
const escq=v=>encodeURIComponent(String(v));
const fnv=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)};

export async function loadCockpitIndex(req,force=false){
  if(!force&&cockpitCache&&Date.now()-cockpitCache.at<TTL)return cockpitCache;
  const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams({select:'entity_id,short_label_pt,acronym,what_pt,how_pt,why_pt,index_version,indexed_at',limit:'10000'});
  const response=await fetch(`${BASE}/${escq(TABLE)}?${params}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':PROFILE},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok){const body=await response.text().catch(()=> '');throw Error(`ATLAS_COCKPIT_INDEX_${response.status}:${body.slice(0,180)}`)}
  const rows=await response.json();
  const cockpitIndex=new Map(rows.map(row=>[String(row.entity_id),row]));
  const versions=[...new Set(rows.map(row=>row.index_version).filter(Boolean))];
  cockpitCache={at:Date.now(),rows,cockpitIndex,indexVersion:versions.length===1?versions[0]:versions.join(',')};
  return cockpitCache;
}

export function cockpitMeta(cockpitIndex,id){
  const row=cockpitIndex?.get(String(id));if(!row)return{};
  return{
    short_label_pt:row.short_label_pt||'',
    acronym:row.acronym||'',
    what_pt:row.what_pt||'',
    how_pt:row.how_pt||'',
    why_pt:row.why_pt||'',
    semantic_index_version:row.index_version||'',
    semantic_indexed_at:row.indexed_at||''
  };
}

function decorateEntity(entity,cockpitIndex){
  if(!entity||typeof entity!=='object')return entity;
  const cockpit=cockpitMeta(cockpitIndex,entity.id||entity.canonicalId);
  if(!Object.keys(cockpit).length)return entity;
  return{...entity,metadata:{...(entity.metadata||{}),...cockpit}};
}

function decorate(value,cockpitIndex){
  if(Array.isArray(value))return value.map(item=>decorate(item,cockpitIndex));
  if(!value||typeof value!=='object')return value;
  const direct=decorateEntity(value,cockpitIndex);
  const out={...direct};
  for(const [key,child] of Object.entries(out)){
    if(key==='metadata'||key==='sourceRefs')continue;
    if(key==='entity')out[key]=decorateEntity(child,cockpitIndex);
    else if(['nodes','actions','runs','events','items','ladder','emergent'].includes(key))out[key]=decorate(child,cockpitIndex);
  }
  return out;
}

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').pop()}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, max-age=60');res.setHeader('X-Content-Type-Options','nosniff');return res.end(JSON.stringify(value))}

function sourceRefsOf(ref,observedAt=''){
  const value=String(ref||'').trim();if(!value)return[];
  const url=/^https:\/\//i.test(value)?value:/^[A-Za-z0-9_-]{20,}$/.test(value)?`https://drive.google.com/open?id=${encodeURIComponent(value)}`:undefined;
  return[{source:'OLYMPUS_PROVENANCE',sourceRef:value,url,observedAt:observedAt||undefined}];
}

async function selectProfile(req,profile,table,q={}){
  const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
  const response=await fetch(`${BASE}/${escq(table)}?${params}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':profile},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok){const body=await response.text().catch(()=> '');throw Error(`${profile.toUpperCase()}_${table.toUpperCase()}_${response.status}:${body.slice(0,180)}`)}
  return response.json();
}

function olympusProjection({people,states,events,evidence,attention}){
  const authority='OPERATIONAL_CANONICAL',root='system:OLYMPUS',nodes=[],edges=[];
  const stateBy=new Map(states.map(x=>[String(x.person_id),x])),attentionBy=new Map(attention.map(x=>[String(x.person_id),x]));
  const eventsBy=new Map(),evidenceBy=new Map();
  for(const x of events){const id=String(x.person_id||x.subject_id||'');if(!id)continue;if(!eventsBy.has(id))eventsBy.set(id,[]);eventsBy.get(id).push(x)}
  for(const x of evidence){const id=String(x.person_id||'');if(!id)continue;if(!evidenceBy.has(id))evidenceBy.set(id,[]);evidenceBy.get(id).push(x)}
  const dates=[...people.map(x=>x.updated_at),...states.map(x=>x.updated_at||x.compiled_at),...events.map(x=>x.observed_at||x.recorded_at||x.created_at),...evidence.map(x=>x.observed_at||x.created_at)].filter(Boolean).map(String).sort();
  const sourceVersion=dates.at(-1)||'';
  nodes.push({id:root,type:'SYSTEM',label:'Olympus',status:'ACTIVE',authority,updatedAt:sourceVersion,summary:`${people.length} pessoas · ${states.length} estados · ${events.length} eventos`,metadata:{schema:'olympus',people:people.length,current_states:states.length,events:events.length,evidence:evidence.length,attention:attention.length}});
  for(const person of people){
    const personId=String(person.id||person.person_id||'');if(!personId)continue;
    const current=stateBy.get(personId),attn=attentionBy.get(personId),name=person.display_name||personId;
    const decision=current?.decision||attn?.decision||'',nextAction=current?.next_action||attn?.next_action||'',freshness=current?.freshness||attn?.freshness||person.status||'ACTIVE';
    const personNode=`olympus:person:${personId}`;
    nodes.push({id:personNode,canonicalId:personId,type:'PERSON',label:name,status:freshness,authority,updatedAt:current?.updated_at||person.updated_at||'',summary:[person.mode,decision,nextAction].filter(Boolean).join(' · '),sourceRefs:sourceRefsOf(current?.source_ref,current?.updated_at||current?.compiled_at||person.updated_at||''),metadata:{person_id:personId,mode:person.mode||'',person_status:person.status||'',state_revision:current?.state_revision??null,protocol_version:current?.protocol_version||'',freshness:current?.freshness||'',phase:current?.phase||'',decision,next_action:nextAction,blocking_data:current?.blocking_data||attn?.blocking_data||[],priority:attn?.priority??null,source_ref:current?.source_ref||''}});
    edges.push({id:`${root}:CONTAINS:${personNode}`,source:root,target:personNode,type:'CONTAINS',authority});
    if(current){
      const stateNode=`olympus:state:${personId}`;
      nodes.push({id:stateNode,type:'STATE',label:`Estado atual · ${name}`,status:current.freshness||current.decision||'CURRENT',authority,updatedAt:current.updated_at||current.compiled_at||'',summary:[current.decision,current.next_action].filter(Boolean).join(' · '),sourceRefs:sourceRefsOf(current.source_ref,current.updated_at||current.compiled_at||''),metadata:{person_id:personId,state_revision:current.state_revision,protocol_version:current.protocol_version||'',freshness:current.freshness||'',phase:current.phase||'',decision:current.decision||'',next_action:current.next_action||'',blocking_data:current.blocking_data||[],active_plan_ref:current.active_plan_ref||'',source_ref:current.source_ref||'',compiled_at:current.compiled_at||''}});
      edges.push({id:`${personNode}:CONTAINS:${stateNode}`,source:personNode,target:stateNode,type:'CONTAINS',authority});
    }
    for(const event of (eventsBy.get(personId)||[]).slice(0,12)){
      const eventId=String(event.id||event.legacy_event_id||`${personId}:${event.observed_at||event.created_at||'event'}`),nodeId=`olympus:event:${eventId}`;
      nodes.push({id:nodeId,type:'EVENT',label:event.event_type||'Evento',status:event.decision||'RECORDED',authority,updatedAt:event.observed_at||event.recorded_at||event.created_at||'',summary:event.summary||'',sourceRefs:sourceRefsOf(event.source_ref,event.observed_at||event.recorded_at||event.created_at||''),metadata:{person_id:personId,event_id:eventId,legacy_event_id:event.legacy_event_id||'',event_type:event.event_type||'',decision:event.decision||'',source_ref:event.source_ref||'',observed_at:event.observed_at||'',recorded_at:event.recorded_at||''}});
      edges.push({id:`${personNode}:CONTAINS:${nodeId}`,source:personNode,target:nodeId,type:'CONTAINS',authority});
    }
    for(const item of (evidenceBy.get(personId)||[]).slice(0,12)){
      const evidenceId=String(item.id||`${personId}:${item.observed_at||item.created_at||'evidence'}`),nodeId=`olympus:evidence:${evidenceId}`;
      nodes.push({id:nodeId,type:'EVIDENCE',label:item.evidence_type||'Evidência',status:'RECORDED',authority,updatedAt:item.observed_at||item.created_at||'',summary:item.source_ref||'',sourceRefs:sourceRefsOf(item.source_ref,item.observed_at||item.created_at||''),metadata:{person_id:personId,evidence_id:evidenceId,evidence_type:item.evidence_type||'',source_ref:item.source_ref||'',observed_at:item.observed_at||''}});
      edges.push({id:`${personNode}:CONTAINS:${nodeId}`,source:personNode,target:nodeId,type:'CONTAINS',authority});
    }
  }
  const fingerprint=fnv(JSON.stringify({people:people.map(x=>[x.id||x.person_id,x.updated_at]),states:states.map(x=>[x.person_id,x.state_revision,x.updated_at]),events:events.map(x=>[x.id,x.observed_at]),evidence:evidence.map(x=>[x.id,x.observed_at])}));
  return{nodes,edges,fingerprint,sourceVersion};
}

export async function loadOlympus(req,force=false){
  if(!force&&olympusCache&&Date.now()-olympusCache.at<TTL)return olympusCache;
  const [people,states,events,evidence,attention]=await Promise.all([
    selectProfile(req,OLYMPUS_PROFILE,'people',{select:'id,display_name,mode,status,updated_at',order:'display_name.asc',limit:1000}),
    selectProfile(req,OLYMPUS_PROFILE,'current_state',{select:'person_id,state_revision,protocol_version,freshness,phase,decision,next_action,blocking_data,active_plan_ref,source_ref,compiled_at,updated_at',limit:1000}),
    selectProfile(req,OLYMPUS_PROFILE,'events',{select:'id,legacy_event_id,person_id,subject_id,event_type,decision,observed_at,recorded_at,source_ref,summary,created_at',order:'observed_at.desc',limit:200}),
    selectProfile(req,OLYMPUS_PROFILE,'evidence',{select:'id,person_id,evidence_type,observed_at,source_ref,created_at',order:'observed_at.desc',limit:200}),
    selectProfile(req,OLYMPUS_PROFILE,'attention',{select:'person_id,display_name,mode,freshness,decision,next_action,blocking_data,priority',order:'priority.desc',limit:1000})
  ]);
  const graph=olympusProjection({people,states,events,evidence,attention});
  olympusCache={at:Date.now(),graph,people,states,events,evidence,attention};
  return olympusCache;
}

const isOlympusId=id=>String(id||'')==='system:OLYMPUS'||String(id||'').startsWith('olympus:');
function olympusMatches(n,q={}){
  if(q.type&&n.type!==q.type)return false;
  if(q.status&&String(n.status||'').toLowerCase()!==String(q.status).toLowerCase())return false;
  const words=String(q.query||'').toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w=>`${n.id} ${n.label||''} ${n.summary||''} ${JSON.stringify(n.metadata||{})}`.toLowerCase().includes(w));
}
function olympusTraverse(graph,focus,direction='children',depth=1){
  const seen=new Set([focus]),frontier=[focus],bySource=new Map(),byTarget=new Map();
  for(const e of graph.edges){if(!bySource.has(e.source))bySource.set(e.source,[]);bySource.get(e.source).push(e.target);if(!byTarget.has(e.target))byTarget.set(e.target,[]);byTarget.get(e.target).push(e.source)}
  for(let level=0;level<Math.max(1,Number(depth)||1)&&frontier.length;level++){
    const batch=frontier.splice(0);
    for(const id of batch){
      const next=direction==='ancestors'?(byTarget.get(id)||[]):direction==='descendants'||direction==='children'?(bySource.get(id)||[]):[...(bySource.get(id)||[]),...(byTarget.get(id)||[])];
      for(const x of next)if(!seen.has(x)){seen.add(x);frontier.push(x)}
    }
  }
  return seen;
}
function olympusGraphView(graph,q={}){
  const focus=q.focus||'system:OLYMPUS',mode=q.mode||'children',depth=Math.max(1,Math.min(3,Number(q.depth)||1));
  let ids;
  if(mode==='search')ids=new Set(graph.nodes.filter(n=>olympusMatches(n,q)).map(n=>n.id));
  else if(mode==='ancestors')ids=olympusTraverse(graph,focus,'ancestors',3);
  else if(mode==='descendants')ids=olympusTraverse(graph,focus,'descendants',3);
  else if(mode==='neighbors'||mode==='lineage')ids=olympusTraverse(graph,focus,'neighbors',mode==='lineage'?3:1);
  else ids=olympusTraverse(graph,focus,'children',depth);
  let all=graph.nodes.filter(n=>ids.has(n.id)&&olympusMatches(n,{...q,query:mode==='search'?q.query:''}));
  const total=all.length,offset=Math.max(0,Number(q.offset)||0),limit=Math.min(Math.max(1,Number(q.limit)||160),250);
  let nodes=all.slice(offset,offset+limit);const focal=graph.nodes.find(n=>n.id===focus);if(focal&&mode!=='search'&&!nodes.some(n=>n.id===focus))nodes.unshift(focal);
  const selected=new Set(nodes.map(n=>n.id));
  return{focus,nodes,edges:graph.edges.filter(e=>selected.has(e.source)&&selected.has(e.target)),total,hasMore:offset+nodes.length<total,depth,truncated:false};
}

async function probeScienceHealth(req){
  const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams({select:'entity_id',limit:'1'});
  const response=await fetch(`${BASE}/entities?${params}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':'science_v1'},
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const body=await response.text().catch(()=> '');throw Error(`SCIENCE_HEALTH_${response.status}:${body.slice(0,160)}`)}
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('SCIENCE_HEALTH_BAD_PAYLOAD');
  return{ok:true,checkedAt:Date.now(),detail:'OK',version:'science_v1'};
}

async function probeSemanticHealth(req){
  const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams({select:'index_version',limit:'1'});
  const response=await fetch(`${BASE}/${escq(TABLE)}?${params}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':PROFILE,Prefer:'count=exact'},
    signal:AbortSignal.timeout(8000)
  });
  if(!response.ok){const body=await response.text().catch(()=> '');throw Error(`SEMANTIC_HEALTH_${response.status}:${body.slice(0,160)}`)}
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('SEMANTIC_HEALTH_BAD_PAYLOAD');
  return{available:true,count:contentRangeTotal(response.headers?.get?.('content-range')),indexVersion:rows[0]?.index_version||''};
}

export default async function handler(req,res){
  const route=routeOf(req),query=queryOf(req),indexMode=semanticIndexMode(route,query);

  // The top-level graph is declared structure. Rendering it must not hydrate the
  // science corpus or the 5k+ semantic index merely to draw five child systems.
  if(req.method==='GET'&&route==='graph'&&indexMode==='skip')return sendJson(res,systemRootGraph());

  // Olympus is an operational Truth Owner in its own Neon schema. Once focused,
  // project it directly instead of pretending the declared system node is data.
  if(req.method==='GET'&&route==='graph'&&isOlympusId(query.focus)){
    try{
      const {graph}=await loadOlympus(req,false),view=olympusGraphView(graph,query);
      return sendJson(res,{...view,fingerprint:graph.fingerprint,sourceVersion:graph.sourceVersion,source:'olympus',freshness:'LIVE',cache:'HIT',issues:[]});
    }catch(error){console.warn('[atlas:olympus]',String(error?.message||error));return baseHandler(req,res)}
  }
  if(req.method==='GET'&&route==='entity'&&isOlympusId(query.id)){
    try{
      const {graph}=await loadOlympus(req,false);
      if(query.view==='lineage')return sendJson(res,{...olympusGraphView(graph,{focus:query.id,mode:'lineage',depth:3,limit:250}),fingerprint:graph.fingerprint,sourceVersion:graph.sourceVersion,source:'olympus',freshness:'LIVE'});
      if(query.view==='files'){
        const linked=new Set(graph.edges.filter(e=>e.source===query.id||e.target===query.id).flatMap(e=>[e.source,e.target]));
        return sendJson(res,graph.nodes.filter(n=>linked.has(n.id)&&n.type==='EVIDENCE'&&n.id!==query.id));
      }
      const entity=graph.nodes.find(n=>n.id===query.id);if(!entity)return sendJson(res,{error:'ENTITY_NOT_FOUND'},404);
      const relations=graph.edges.filter(e=>e.source===query.id||e.target===query.id);
      return sendJson(res,{entity,relations,relationCount:relations.length,source:'olympus'});
    }catch(error){console.warn('[atlas:olympus-entity]',String(error?.message||error));return baseHandler(req,res)}
  }

  // Health uses two independent one-row probes. `count=exact` supplies semantic
  // cardinality through Content-Range without transferring the whole index.
  if(req.method==='GET'&&route==='health'&&indexMode==='probe'){
    const [scienceResult,semanticResult]=await Promise.allSettled([probeScienceHealth(req),probeSemanticHealth(req)]);
    if(scienceResult.status==='fulfilled'){
      const v1Health=scienceResult.value;
      const payload={
        ok:true,contract:'v1',
        dataSource:{requested:'auto',effective:'v1',freshness:'LIVE',reason:'V1_HEALTHY',usedFallback:false,v1Configured:true,v1Transport:'VERCEL_OIDC_NEON_DATA_API',v1Health}
      };
      if(semanticResult.status==='fulfilled')payload.semanticIndex=semanticResult.value;
      else payload.semanticIndex={available:false,count:null,indexVersion:''};
      return sendJson(res,payload);
    }
    console.warn('[atlas:health-fastpath]',String(scienceResult.reason?.message||scienceResult.reason||'SCIENCE_PROBE_FAILED'));
    return baseHandler(req,res);
  }

  if(route==='sync')try{await loadOlympus(req,true)}catch(error){console.warn('[atlas:olympus-sync]',String(error?.message||error))}

  let index=null;
  try{
    index=route==='sync'?await loadCockpitIndex(req,true):await loadCockpitIndex(req,false);
  }catch(error){console.warn('[atlas:semantic-index]',String(error?.message||error))}
  if(!index)return baseHandler(req,res);

  const originalEnd=res.end.bind(res);
  let ended=false;
  res.end=(body,...args)=>{
    if(ended)return;ended=true;
    try{
      const text=Buffer.isBuffer(body)?body.toString('utf8'):String(body??'');
      const parsed=text?JSON.parse(text):{};
      const enriched=decorate(parsed,index.cockpitIndex);
      return originalEnd(JSON.stringify(enriched),...args);
    }catch{return originalEnd(body,...args)}
  };
  return baseHandler(req,res);
}
