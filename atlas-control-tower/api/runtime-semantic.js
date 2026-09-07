import baseHandler from './runtime-v2.js';
import {isFastRootQuery,systemRootGraph,semanticIndexMode,contentRangeTotal} from '../lib/system-overview.mjs';

const BASE='https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const PROFILE='flight_api';
const TABLE='atlas_cockpit_index';
const TTL=60000;
let cockpitCache=null;

const tokenOf=req=>req.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN||'';
const escq=v=>encodeURIComponent(String(v));

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
