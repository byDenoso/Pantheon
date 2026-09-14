import {createStaticArtifactApi as createLegacyStaticArtifactApi} from './static-artifact-api.mjs';

const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
const trim=v=>text(v).replace(/\/+$/,'');
const join=(base,...parts)=>[trim(base),...parts.map(p=>text(p).replace(/^\/+|\/+$/g,''))].filter(Boolean).join('/');

async function sha256Hex(value){
 if(!globalThis.crypto?.subtle)return null;
 const bytes=new TextEncoder().encode(value);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function createStaticArtifactApi({baseUrl='/data',fetchImpl=globalThis.fetch}={}){
 const legacy=createLegacyStaticArtifactApi({baseUrl,fetchImpl});
 const base=trim(baseUrl)||'/data';
 let publicManifestPromise=null;
 const surfaceCache=new Map();
 async function fetchTextJson(url){
  const response=await fetchImpl(url,{headers:{Accept:'application/json'}});
  if(!response?.ok)throw new Error(`PUBLIC_SURFACE_HTTP_${response?.status||0}:${url}`);
  const body=await response.text();
  let value;try{value=JSON.parse(body)}catch(error){throw new Error(`PUBLIC_SURFACE_INVALID_JSON:${url}:${String(error?.message||error)}`)}
  return {body,value};
 }
 async function publicManifest(){
  if(!publicManifestPromise)publicManifestPromise=fetchTextJson(join(base,'current/public-manifest-v2.json')).then(({value})=>{
   if(value?.contract!=='NEXO_ATLAS_PUBLIC_MANIFEST_V2')throw new Error('PUBLIC_MANIFEST_V2_INVALID');
   return value;
  }).catch(error=>{publicManifestPromise=null;throw error});
  return publicManifestPromise;
 }
 async function surface(name){
  const manifest=await publicManifest();
  const descriptor=manifest.surfaces?.[name];
  if(!descriptor||descriptor.state==='DATA_UNAVAILABLE')return {state:'DATA_UNAVAILABLE',items:[],sourceVersion:manifest.sourceVersion||'',freshness:'SNAPSHOT'};
  if(descriptor.state!=='READY'||!descriptor.path)throw new Error(`PUBLIC_SURFACE_DESCRIPTOR_INVALID:${name}`);
  const key=`${manifest.fingerprint}:${name}`;
  if(surfaceCache.has(key))return surfaceCache.get(key);
  const pending=(async()=>{
   const legacyManifest=await legacy.manifest();
   const url=join(base,legacyManifest.snapshotPath,descriptor.path);
   const {body,value}=await fetchTextJson(url);
   const actual=await sha256Hex(body);
   if(actual&&descriptor.sha256&&actual!==descriptor.sha256)throw new Error(`PUBLIC_SURFACE_HASH_MISMATCH:${name}`);
   return {...value,freshness:value.freshness||'SNAPSHOT'};
  })();
  surfaceCache.set(key,pending);
  try{return await pending}catch(error){surfaceCache.delete(key);throw error}
 }
 const envelope=(value)=>({contract:value.contract,status:value.state==='DATA_UNAVAILABLE'?'DATA_UNAVAILABLE':'OK',freshness:value.freshness||'SNAPSHOT',sourceModifiedAt:value.sourceVersion,data:value,provenance:value.provenance||[]});
 const labRouteType={
  'lab-hypotheses':'HYPOTHESIS','lab-claims':'CLAIM','lab-tests':'TEST','lab-runs':'RUN','lab-results':'RESULT','lab-evidence':'EVIDENCE','lab-decisions':'DECISION','lab-knowledge':'KNOWLEDGE','lab-pipelines':'PIPELINE'
 };
 async function research(route,query={}){
  if(route.startsWith('observatory-')||route==='universe-snapshot'){
   const value=await surface('observatory');
   if(route==='observatory-questions')return envelope({...value,items:value.questions||[],surfaces:value.surfaces});
   return envelope(value);
  }
  const type=labRouteType[route];
  if(type){
   const value=await surface('laboratory');
   const domain=text(query.domain).toUpperCase();
   const items=arr(value.items).filter(item=>String(item.type||'').toUpperCase()===type&&(!domain||String(item.domain||'').toUpperCase()===domain));
   return envelope({...value,items});
  }
  throw new Error(`STATIC_RESEARCH_ROUTE_NOT_MATERIALIZED:${route}`);
 }
 return {
  ...legacy,
  get remote(){return false},
  publicManifest,
  surface,
  learning:()=>surface('learning'),
  learningFor:async id=>{const value=await surface('learning');return {...value,item:arr(value.items).find(item=>item.id===id)||null}},
  ops:()=>surface('operations'),
  automationRuns:async()=>arr((await surface('operations')).runs),
  audit:()=>surface('audit'),
  searchIndex:()=>surface('search'),
  research,
  clear(){legacy.clear?.();publicManifestPromise=null;surfaceCache.clear()}
 };
}
