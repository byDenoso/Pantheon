import semanticHandler,{loadOlympus} from './runtime-semantic.js';
import {scienceSourceRefs,opsSourceRefs,learningSourceRefs,mergeSourceRefs} from '../lib/source-links.mjs';

const BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const DERIVED='DERIVED_NOT_EVIDENCE';
const tokenOf=req=>req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
const escq=v=>encodeURIComponent(String(v));
const fnv=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)};

function urlOf(req){return new URL(req.url||'/','https://atlas.local')}
function routeOf(req){const u=urlOf(req);return u.searchParams.get('route')||u.pathname.split('/').pop()}
function queryOf(req){const u=urlOf(req),q=Object.fromEntries(u.searchParams);delete q.route;return q}
function sendJson(res,value,status=200){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, max-age=60');res.setHeader('X-Content-Type-Options','nosniff');return res.end(JSON.stringify(value))}
const isLearningDomainId=id=>String(id||'').startsWith('learning-domain:');
const isLearningId=id=>['observation:','pattern:','lesson:','strategy:','policy:'].some(p=>String(id||'').startsWith(p));
const isOpsId=id=>String(id||'').startsWith('ops-stage:')||['action:','run:','event:'].some(p=>String(id||'').startsWith(p));
const isOlympusId=id=>String(id||'')==='system:OLYMPUS'||String(id||'').startsWith('olympus:');
const isDriveId=id=>String(id||'').startsWith('drive:');
const domainOf=id=>String(id||'').slice('learning-domain:'.length);
function labelOf(domain){return String(domain||'').replace(/^NEXO_/,'').replaceAll('_',' ').toLowerCase().replace(/(^|\s)\S/g,x=>x.toUpperCase())}

async function select(req,profile,table,q={}){
  const token=tokenOf(req);if(!token)throw Error('OIDC_NOT_AVAILABLE');
  const params=new URLSearchParams(Object.entries(q).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
  const r=await fetch(`${BASE}/${escq(table)}?${params}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Profile':profile},signal:AbortSignal.timeout(12000)});
  if(!r.ok){const body=await r.text().catch(()=> '');throw Error(`${profile.toUpperCase()}_${table.toUpperCase()}_${r.status}:${body.slice(0,160)}`)}
  return r.json();
}

async function semanticMeta(req,id){
  const rows=await select(req,'flight_api','atlas_cockpit_index',{select:'short_label_pt,acronym,what_pt,how_pt,why_pt,index_version,indexed_at',entity_id:`eq.${id}`,limit:1}).catch(()=>[]);
  const row=rows[0];if(!row)return{};
  return{short_label_pt:row.short_label_pt||'',acronym:row.acronym||'',what_pt:row.what_pt||'',how_pt:row.how_pt||'',why_pt:row.why_pt||'',semantic_index_version:row.index_version||'',semantic_indexed_at:row.indexed_at||''};
}

async function semanticDriveEntity(req,id){
  const rows=await select(req,'flight_api','atlas_cockpit_index',{select:'entity_id,source_system,source_entity_type,short_label_pt,what_pt,how_pt,why_pt,source_updated_at,index_version,indexed_at',entity_id:`eq.${id}`,limit:1}).catch(()=>[]);
  const row=rows[0];if(!row)return null;
  const driveId=String(id).slice('drive:'.length),url=`https://drive.google.com/open?id=${encodeURIComponent(driveId)}`;
  return{entity:{id,type:row.source_entity_type||'FILE',label:row.short_label_pt||driveId,status:'INDEXED',authority:DERIVED,updatedAt:row.source_updated_at||row.indexed_at||'',summary:row.what_pt||'',sourceRefs:[{source:'GOOGLE_DRIVE',sourceId:driveId,sourceRef:driveId,url,observedAt:row.source_updated_at||undefined}],metadata:{source_system:row.source_system||'',what_pt:row.what_pt||'',how_pt:row.how_pt||'',why_pt:row.why_pt||'',semantic_index_version:row.index_version||'',semantic_indexed_at:row.indexed_at||''}},relations:[],relationCount:0,source:'semantic_index'};
}

async function domainProjection(req,id){
  const domain=domainOf(id);
  const rows=await select(req,'learning_v1','observations',{select:'observation_id,event_type,summary,outcome,domain,observed_at',domain:`eq.${domain}`,order:'observed_at.desc',limit:1000});
  const meta=await semanticMeta(req,id);
  const root={id,type:'DOMAIN',label:meta.short_label_pt||labelOf(domain),status:'ACTIVE',authority:DERIVED,domain,summary:`${rows.length} observações de learning_v1 declaram este domínio.`,metadata:{source:'learning_v1.observations',declaredBy:rows.length,...meta}};
  const nodes=rows.map(row=>({id:`observation:${row.observation_id}`,canonicalId:row.observation_id,type:'LEARNING_RELATION',label:row.event_type||row.summary||row.observation_id,status:row.outcome||'OBSERVED',authority:DERIVED,domain,summary:row.summary||'',updatedAt:row.observed_at||'',metadata:{domain,source:'learning_v1.observations'}}));
  const edges=nodes.map(n=>({id:`${id}:CONTAINS:${n.id}`,source:id,target:n.id,type:'CONTAINS',authority:DERIVED}));
  const sourceVersion=rows.map(x=>String(x.observed_at||'')).filter(Boolean).sort().at(-1)||'';
  return{root,nodes,edges,sourceVersion};
}

async function olympusEntity(req,id){
  const {graph}=await loadOlympus(req,false);
  const base=graph.nodes.find(n=>n.id===id);if(!base)return null;
  const meta=await semanticMeta(req,id);
  const entity={...base,metadata:{...(base.metadata||{}),...meta}};
  const relations=graph.edges.filter(e=>e.source===id||e.target===id);
  return{entity,relations,relationCount:relations.length,source:'olympus'};
}

function learningLookup(id){
  const maps=[['observation:','observations','observation_id'],['pattern:','patterns','pattern_id'],['lesson:','lessons','lesson_id'],['strategy:','strategies','strategy_id'],['policy:','policies','policy_id']];
  const found=maps.find(([prefix])=>String(id).startsWith(prefix));
  return found?{table:found[1],key:found[2],value:String(id).slice(found[0].length)}:null;
}
async function learningRefs(req,id){
  const lookup=learningLookup(id);if(!lookup)return[];
  const rows=await select(req,'learning_v1',lookup.table,{select:'*',[lookup.key]:`eq.${lookup.value}`,limit:1}).catch(()=>[]);
  return learningSourceRefs(rows[0]||{});
}

function captureResponse(){
  const headers=new Map();
  return{statusCode:200,body:'',setHeader(k,v){headers.set(String(k).toLowerCase(),v);return this},getHeader(k){return headers.get(String(k).toLowerCase())},end(value=''){this.body=Buffer.isBuffer(value)?value.toString('utf8'):String(value??'');return this.body},_headers:headers};
}
function relayCaptured(res,cap,payload){
  res.statusCode=cap.statusCode||200;
  for(const[k,v]of cap._headers)res.setHeader(k,v);
  return res.end(payload===undefined?cap.body:JSON.stringify(payload));
}
async function entityWithSourceOverlay(req,res,id){
  const cap=captureResponse();
  await semanticHandler(req,cap);
  if(cap.statusCode<200||cap.statusCode>=300)return relayCaptured(res,cap);
  let payload;try{payload=JSON.parse(cap.body)}catch{return relayCaptured(res,cap)}
  const entity=payload?.entity;if(!entity)return relayCaptured(res,cap,payload);
  let refs=[];
  if(isOpsId(id))refs=opsSourceRefs({...entity.metadata,observed_at:entity.updatedAt});
  else if(isLearningId(id))refs=await learningRefs(req,id);
  else refs=scienceSourceRefs({...entity.metadata,observed_at:entity.updatedAt});
  entity.sourceRefs=mergeSourceRefs(entity.sourceRefs||[],refs);
  return relayCaptured(res,cap,payload);
}

export default async function handler(req,res){
  if(req.method!=='GET')return semanticHandler(req,res);
  const route=routeOf(req),q=queryOf(req),id=route==='graph'?q.focus:q.id;

  if(route==='entity'&&isOlympusId(q.id)&&!q.view){
    try{const payload=await olympusEntity(req,q.id);return payload?sendJson(res,payload):sendJson(res,{error:'ENTITY_NOT_FOUND'},404)}
    catch(error){console.warn('[atlas:olympus-index-overlay]',String(error?.message||error));return semanticHandler(req,res)}
  }

  if(route==='entity'&&isDriveId(q.id)&&!q.view){
    try{const payload=await semanticDriveEntity(req,q.id);return payload?sendJson(res,payload):sendJson(res,{error:'ENTITY_NOT_FOUND'},404)}
    catch(error){console.warn('[atlas:drive-index-overlay]',String(error?.message||error));return semanticHandler(req,res)}
  }

  if(isLearningDomainId(id)){
    try{
      if(route==='entity'&&q.view==='files')return sendJson(res,[]);
      const p=await domainProjection(req,id);
      if(route==='graph'||(route==='entity'&&q.view==='lineage'))return sendJson(res,{focus:id,nodes:[p.root,...p.nodes],edges:p.edges,total:p.nodes.length+1,hasMore:false,depth:1,fingerprint:fnv(JSON.stringify([id,...p.nodes.map(n=>n.id)])),sourceVersion:p.sourceVersion,source:'learning_v1',freshness:'LIVE',cache:'MISS',issues:[]});
      if(route==='entity')return sendJson(res,{entity:p.root,relations:p.edges.slice(0,100),relationCount:p.edges.length,source:'learning_v1'});
    }catch(error){console.warn('[atlas:learning-domain]',String(error?.message||error))}
    return semanticHandler(req,res);
  }

  if(route==='entity'&&!q.view){
    try{return await entityWithSourceOverlay(req,res,q.id)}
    catch(error){console.warn('[atlas:source-link-overlay]',String(error?.message||error));return semanticHandler(req,res)}
  }
  return semanticHandler(req,res);
}
