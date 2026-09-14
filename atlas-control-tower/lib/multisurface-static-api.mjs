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
 let publicManifestV3Promise=null;
 const surfaceCache=new Map();
 const artifactCache=new Map();
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
 async function publicManifestV3(){
  if(!publicManifestV3Promise)publicManifestV3Promise=fetchTextJson(join(base,'current/public-manifest-v3.json')).then(({value})=>{
   if(value?.contract!=='NEXO_ATLAS_PUBLIC_MANIFEST_V3')throw new Error('PUBLIC_MANIFEST_V3_INVALID');
   if(value?.artifacts?.srm?.state!=='READY')throw new Error('PUBLIC_MANIFEST_V3_SRM_REQUIRED');
   return value;
  }).catch(error=>{publicManifestV3Promise=null;throw error});
  return publicManifestV3Promise;
 }
 async function verifiedArtifact(descriptor,name,manifestFingerprint){
  if(!descriptor||descriptor.state==='DATA_UNAVAILABLE')return {state:'DATA_UNAVAILABLE',items:[],freshness:'SNAPSHOT'};
  if(descriptor.state!=='READY'||!descriptor.path||!descriptor.sha256)throw new Error(`PUBLIC_ARTIFACT_DESCRIPTOR_INVALID:${name}`);
  const key=`${manifestFingerprint}:${name}`;
  if(artifactCache.has(key))return artifactCache.get(key);
  const pending=(async()=>{
   const legacyManifest=await legacy.manifest();
   const url=join(base,legacyManifest.snapshotPath,descriptor.path);
   const {body,value}=await fetchTextJson(url);
   const actual=await sha256Hex(body);
   if(actual&&actual!==descriptor.sha256)throw new Error(`PUBLIC_ARTIFACT_HASH_MISMATCH:${name}`);
   return value;
  })();
  artifactCache.set(key,pending);
  try{return await pending}catch(error){artifactCache.delete(key);throw error}
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
 async function scienceReadModel(){
  const manifest=await publicManifestV3();
  const value=await verifiedArtifact(manifest.artifacts?.srm,'srm',manifest.fingerprint);
  if(value?.contract!=='NEXO_SCIENCE_READ_MODEL_V2')throw new Error('SCIENCE_READ_MODEL_V2_INVALID');
  return value;
 }
 async function projectionLedger(){
  const manifest=await publicManifestV3();
  return verifiedArtifact(manifest.artifacts?.projectionLedger,'projectionLedger',manifest.fingerprint);
 }
 async function activityLedger(){
  const manifest=await publicManifestV3();
  return verifiedArtifact(manifest.artifacts?.activityLedger,'activityLedger',manifest.fingerprint);
 }
 async function shardCatalog(){
  const manifest=await publicManifestV3();
  return verifiedArtifact(manifest.artifacts?.shards,'shards',manifest.fingerprint);
 }
 const envelope=value=>({contract:value.contract,status:value.state==='DATA_UNAVAILABLE'?'DATA_UNAVAILABLE':'OK',freshness:value.freshness||'SNAPSHOT',sourceModifiedAt:value.sourceVersion,data:value,provenance:value.provenance||[]});
 const labRouteType={'lab-hypotheses':'HYPOTHESIS','lab-claims':'CLAIM','lab-tests':'TEST','lab-runs':'RUN','lab-results':'RESULT','lab-evidence':'EVIDENCE','lab-decisions':'DECISION','lab-knowledge':'KNOWLEDGE','lab-pipelines':'PIPELINE'};
 const directSurfaceRoute={activity:'activity',operations:'operations',cockpit:'operations',audit:'audit',learning:'learning',search:'search'};
 async function research(route,query={}){
  if(route==='science-read-model')return envelope(await scienceReadModel());
  if(route==='science-changes'){
   const value=await activityLedger();
   return envelope({...value,state:'READY',freshness:'SNAPSHOT',items:arr(value.items)});
  }
  if(route==='science-observations'){
   const value=await scienceReadModel();
   return envelope({...value,items:arr(value.observations)});
  }
  if(route==='science-comparisons'){
   const value=await scienceReadModel();
   return envelope({...value,items:arr(value.comparisons)});
  }
  if(route==='science-syntheses'){
   const value=await scienceReadModel();
   return envelope({...value,items:arr(value.syntheses)});
  }
  const direct=directSurfaceRoute[route];
  if(direct)return envelope(await surface(direct));
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
 async function learning(){
  const value=await surface('learning');
  return {...value,ladder:Array.isArray(value.ladder)?value.ladder:[{id:'structural',items:arr(value.items)}],emergent:arr(value.emergent)};
 }
 async function ops(){
  const value=await surface('operations');
  return {...value,actions:arr(value.actions),runs:arr(value.runs)};
 }
 async function audit(){
  const value=await surface('audit');
  return {...value,issues:Array.isArray(value.issues)?value.issues:arr(value.items)};
 }
 return {
  ...legacy,
  get remote(){return false},
  publicManifest,
  publicManifestV3,
  scienceReadModel,
  projectionLedger,
  activityLedger,
  shardCatalog,
  surface,
  learning,
  learningFor:async id=>{const value=await learning();const items=arr(value.ladder).flatMap(stage=>arr(stage.items));return {...value,item:items.find(item=>item.id===id)||null}},
  ops,
  automationRuns:async()=>arr((await ops()).runs),
  audit,
  searchIndex:()=>surface('search'),
  research,
  clear(){legacy.clear?.();publicManifestPromise=null;publicManifestV3Promise=null;surfaceCache.clear();artifactCache.clear()}
 };
}
