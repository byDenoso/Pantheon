import {projectGraph} from '../nextgen/lib/projection.mjs';

const BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const DERIVED='DERIVED_NOT_EVIDENCE';
const CANON='SCIENCE_CANONICAL';
const SYSTEMS=[['SCIENCE','Ciência'],['ENGINEERING','Engineering'],['OLYMPUS','Olympus'],['AUTOMATION','Black Box'],['LEARNING','Learning']];
let cache=null;

const esc=v=>encodeURIComponent(String(v));
const fnv=text=>{let h=2166136261;for(let i=0;i<String(text).length;i++)h=Math.imul(h^String(text).charCodeAt(i),16777619);return(h>>>0).toString(16)};
const tokenFor=req=>req?.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';

async function select(token,schema,table,q={}){
  if(!token) throw new Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
  const response=await fetch(`${BASE}/${esc(table)}?${params}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':schema},signal:AbortSignal.timeout(15000)});
  if(!response.ok){const body=await response.text().catch(()=> '');throw new Error(`NEON_DATA_API_${response.status}:${body.slice(0,180)}`)}
  return response.json();
}

function relationMap(r){
  if(r.relation_type==='PART_OF_CAMPAIGN') return {source:r.to_entity_id,target:r.from_entity_id,type:'CONTAINS'};
  if(r.relation_type==='PRODUCES_RESULT') return {source:r.from_entity_id,target:r.to_entity_id,type:'PRODUCES'};
  return {source:r.from_entity_id,target:r.to_entity_id,type:r.relation_type};
}
function typeOf(type){return ['HYPOTHESIS','DECISION_HYPOTHESIS','CLAIM'].includes(type)?'CLAIM':type}

export async function loadCanonical(req,{force=false}={}){
  if(!force&&cache&&Date.now()-cache.at<60_000) return cache.graph;
  const token=tokenFor(req);
  const [entities,displays,domains,entityDomains,relations,provenance,revisions]=await Promise.all([
    select(token,'science_v1','entities',{select:'entity_id,entity_type,title,summary,status,current_revision_id,source_surface,source_row_key,updated_at',limit:10000}),
    select(token,'science_v1','entity_display',{select:'*',limit:10000}).catch(()=>[]),
    select(token,'science_v1','domains',{select:'*',limit:1000}),
    select(token,'science_v1','entity_domains',{select:'*',limit:10000}),
    select(token,'science_v1','relations',{select:'relation_id,from_entity_id,to_entity_id,relation_type,status,source_surface,source_ref,evidence_class',limit:10000}),
    select(token,'science_v1','provenance',{select:'owner_entity_id,source_kind,source_id,source_location,authority,observed_at',limit:10000}),
    select(token,'science_v1','revisions',{select:'revision_id,entity_id,observed_at,is_current',limit:20000}).catch(()=>[])
  ]);
  const revisionById=new Map(),revisionByEntity=new Map();
  for(const r of revisions){
    if(!r.observed_at) continue;
    if(r.revision_id) revisionById.set(r.revision_id,r.observed_at);
    const prev=revisionByEntity.get(r.entity_id);
    if(r.is_current||!prev||String(r.observed_at)>String(prev)) revisionByEntity.set(r.entity_id,r.observed_at);
  }
  const observedAt=e=>revisionById.get(e.current_revision_id)||revisionByEntity.get(e.entity_id)||e.updated_at||'';
  const display=new Map(displays.map(x=>[x.entity_id,x]));
  const domainById=new Map(domains.map(d=>[d.domain_id,d]));
  const assignments=new Map(),prov=new Map();
  for(const x of entityDomains){if(!assignments.has(x.entity_id))assignments.set(x.entity_id,[]);assignments.get(x.entity_id).push(x)}
  for(const p of provenance){if(!prov.has(p.owner_entity_id))prov.set(p.owner_entity_id,[]);prov.get(p.owner_entity_id).push(p)}

  const nodes=[{id:'system:NEXO',type:'SYSTEM',label:'NEXO',summary:'Unified Cognitive Infrastructure · projeção read-only do Neon.',authority:DERIVED,status:'ACTIVE'}],edges=[];
  for(const [id,label] of SYSTEMS){nodes.push({id:`system:${id}`,type:'SYSTEM',label,authority:DERIVED,status:'ACTIVE'});edges.push({id:`system:NEXO:CONTAINS:system:${id}`,source:'system:NEXO',target:`system:${id}`,type:'CONTAINS',authority:DERIVED})}
  for(const d of domains){const code=d.code||d.domain_id;nodes.push({id:`domain:${code}`,type:'DOMAIN',label:d.name||code,domain:code,summary:d.description||'',status:d.status||'ACTIVE',authority:DERIVED,metadata:{kind:d.kind,domain_id:d.domain_id}});edges.push({id:`system:SCIENCE:CONTAINS:domain:${code}`,source:'system:SCIENCE',target:`domain:${code}`,type:'CONTAINS',authority:DERIVED})}
  for(const e of entities){
    const a=assignments.get(e.entity_id)||[];
    const domainsAll=[...new Set(a.map(x=>domainById.get(x.domain_id)?.code||x.domain_id).filter(Boolean))];
    const primary=a.find(x=>x.role==='PRIMARY')||a[0];
    const domain=primary?(domainById.get(primary.domain_id)?.code||primary.domain_id):'';
    const d=display.get(e.entity_id);
    const refs=(prov.get(e.entity_id)||[]).map(p=>({source:p.source_kind,sourceId:p.source_id,sourceRef:p.source_location||p.source_id,url:/^https:\/\//.test(p.source_location||'')?p.source_location:undefined,observedAt:p.observed_at}));
    nodes.push({id:e.entity_id,canonicalId:e.entity_id,type:typeOf(e.entity_type),subtype:typeOf(e.entity_type)==='CLAIM'?e.entity_type:undefined,label:d?.display_label||e.title||e.entity_id,canonicalTitle:e.title||'',summary:e.summary||'',status:e.status||'',domain,domains:domainsAll,authority:CANON,updatedAt:observedAt(e),sourceRefs:refs,metadata:{entity_type:e.entity_type,source_surface:e.source_surface,source_row_key:e.source_row_key,current_revision_id:e.current_revision_id||''}});
    if(domain) edges.push({id:`domain:${domain}:CONTAINS:${e.entity_id}`,source:`domain:${domain}`,target:e.entity_id,type:'CONTAINS',authority:DERIVED});
  }
  const ids=new Set(nodes.map(n=>n.id));
  for(const r of relations){const m=relationMap(r);if(!ids.has(m.source)||!ids.has(m.target))continue;edges.push({id:r.relation_id||`${m.source}:${m.type}:${m.target}`,source:m.source,target:m.target,type:m.type,authority:CANON,status:r.status||'',evidenceClass:r.evidence_class||'',sourceRefs:r.source_ref?[{source:r.source_surface,sourceRef:r.source_ref}]:[]})}
  const sourceVersion=nodes.reduce((m,n)=>String(n.updatedAt||'')>m?String(n.updatedAt||''):m,'');
  const fingerprint=fnv(JSON.stringify({nodes:nodes.map(n=>[n.id,n.type,n.status,n.updatedAt]),edges:edges.map(e=>[e.id,e.source,e.target,e.type])}));
  const graph={nodes,edges,fingerprint,sourceVersion,source:'v1',freshness:'LIVE'};
  cache={at:Date.now(),graph};
  return graph;
}

function connectedSubgraph(graph,{focus='system:NEXO',depth=3,limit=240}={}){
  const maxDepth=Math.max(1,Math.min(3,Number(depth)||1));
  const cap=Math.max(10,Math.min(250,Number(limit)||240));
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));
  if(!byId.has(focus)) focus='system:NEXO';
  const adj=new Map();
  for(const e of graph.edges){for(const [a,b] of [[e.source,e.target],[e.target,e.source]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b)}}
  const chosen=new Set([focus]);let frontier=[focus];
  for(let d=0;d<maxDepth&&frontier.length&&chosen.size<cap;d++){
    const next=[];
    for(const id of frontier){
      const kids=[...new Set(adj.get(id)||[])].sort((a,b)=>String(a).localeCompare(String(b)));
      for(const kid of kids){if(chosen.has(kid))continue;chosen.add(kid);next.push(kid);if(chosen.size>=cap)break}
      if(chosen.size>=cap)break;
    }
    frontier=next;
  }
  let nodes=graph.nodes.filter(n=>chosen.has(n.id));
  if(focus.startsWith('domain:')){
    const code=focus.slice(7);const domainNodes=graph.nodes.filter(n=>n.id===focus||n.domain===code||n.domains?.includes(code));
    const merged=new Map([...nodes,...domainNodes].map(n=>[n.id,n]));nodes=[...merged.values()].slice(0,cap);
  }
  const ids=new Set(nodes.map(n=>n.id));
  return {...graph,focus,nodes,edges:graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),total:nodes.length,hasMore:nodes.length>=cap,depth:maxDepth};
}

export async function graphProjection(req,{view='macro',focus='system:NEXO',depth=3,limit=240,force=false}={}){
  const canonical=await loadCanonical(req,{force});
  const slice=connectedSubgraph(canonical,{focus,depth,limit});
  const projected=projectGraph(slice,{view});
  return {...projected,focus:projected.focus||slice.focus,fingerprint:canonical.fingerprint,sourceVersion:canonical.sourceVersion,source:'v1',freshness:'LIVE'};
}

export async function healthCheck(req){
  const token=tokenFor(req);const rows=await select(token,'science_v1','entities',{select:'entity_id',limit:1});
  return {ok:Array.isArray(rows),contract:'nextgen-3.5d',truthOwner:'NEON_V1',source:'v1',freshness:'LIVE'};
}

export async function forceSync(req){
  const before=cache?.graph?.fingerprint||null;const graph=await loadCanonical(req,{force:true});
  return {ok:true,outcome:before&&before===graph.fingerprint?'NO_CHANGE':'UPDATED',changes:before&&before!==graph.fingerprint?1:0,fingerprint:graph.fingerprint,sourceVersion:graph.sourceVersion,completedAt:new Date().toISOString(),truthOwner:'NEON_V1'};
}

export default async function handler(req,res){
  const url=new URL(req.url,'https://atlas.local');const route=req.query?.route||url.searchParams.get('route')||'health';
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(route==='health'){res.setHeader('Cache-Control','private, no-store');return res.status(200).json(await healthCheck(req));}
    if(route==='sync'){if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});res.setHeader('Cache-Control','private, no-store');return res.status(200).json(await forceSync(req));}
    if(route==='graph'){
      const q=req.query||Object.fromEntries(url.searchParams);
      const force=q.force==='1'||q.force==='true';
      if(force){
        res.setHeader('Cache-Control','private, no-store');
        res.setHeader('CDN-Cache-Control','no-store');
      }else{
        res.setHeader('Cache-Control','private, max-age=30');
        res.setHeader('CDN-Cache-Control','public, max-age=60, stale-while-revalidate=300');
      }
      return res.status(200).json(await graphProjection(req,{view:q.view||'macro',focus:q.focus||'system:NEXO',depth:q.depth||3,limit:q.limit||240,force}));
    }
    return res.status(404).json({error:'NOT_FOUND'});
  }catch(error){console.error('[nextgen]',route,error?.message||error);return res.status(503).json({ok:false,error:'NEXTGEN_UNAVAILABLE',route,detail:String(error?.message||error).slice(0,240)});}
}
