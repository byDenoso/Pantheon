import baseHandler from './runtime-v2.js';

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

function routeOf(req){const u=new URL(req.url||'/','https://atlas.local');return u.searchParams.get('route')||u.pathname.split('/').pop()}

export default async function handler(req,res){
  const route=routeOf(req);
  let index=null;
  try{index=await loadCockpitIndex(req,route==='sync')}catch(error){console.warn('[atlas:semantic-index]',String(error?.message||error))}
  if(!index)return baseHandler(req,res);

  const originalEnd=res.end.bind(res);
  let ended=false;
  res.end=(body,...args)=>{
    if(ended)return;ended=true;
    try{
      const text=Buffer.isBuffer(body)?body.toString('utf8'):String(body??'');
      const parsed=text?JSON.parse(text):{};
      const enriched=decorate(parsed,index.cockpitIndex);
      if(route==='health'&&enriched&&typeof enriched==='object')enriched.semanticIndex={available:true,count:index.rows.length,indexVersion:index.indexVersion};
      return originalEnd(JSON.stringify(enriched),...args);
    }catch{return originalEnd(body,...args)}
  };
  return baseHandler(req,res);
}
