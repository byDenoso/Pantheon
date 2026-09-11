/** Graph Contract client. Default Atlas reads are served from the Drive-derived read-only projection. */
import {normalizeGraph,cacheKey,EMPTY_GRAPH,SOURCES,FRESHNESS,CACHE_STATES,provenanceLabel} from './graph-contract.mjs';
import {driveRoute} from './drive-ssot.mjs';
export {normalizeGraph,EMPTY_GRAPH,SOURCES,FRESHNESS,provenanceLabel};

const params=q=>new URLSearchParams(Object.entries(q).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>[k,String(v)]));
const auxiliaryFocus=focus=>/^(system:(LEARNING|AUTOMATION)|learning-stage:|observation:|pattern:|lesson:|strategy:|policy:|ops-stage:|action:|run:|event:)/.test(String(focus||''));

export function createApi({fetchImpl,timeout=20000,syncTimeout=65000,maxEntries=64}={}){
 const remote=typeof fetchImpl==='function';
 const doFetch=fetchImpl;
 const cache=new Map();let version='';
 let provenance={source:SOURCES.DRIVE,freshness:FRESHNESS.SNAPSHOT,sourceVersion:'',cache:'',label:'DRIVE · PROJEÇÃO CANÔNICA'};
 function setVersion(next){if(!next||next===version)return;const had=version;version=next;if(had)cache.clear()}
 function observe(data,{versioned=true}={}){
  const fp=data?.projection?.fingerprint||(versioned?data?.fingerprint:'');if(fp)setVersion(fp);
  const source=data?.source||data?.projection?.source;const freshness=data?.freshness||data?.projection?.freshness;if(!source&&!freshness)return;
  provenance={source:source||provenance.source,freshness:freshness||provenance.freshness,sourceVersion:data?.sourceVersion||data?.projection?.sourceVersion||provenance.sourceVersion,cache:CACHE_STATES.includes(data?.cache)?data.cache:'',label:provenanceLabel({source:source||provenance.source,freshness:freshness||provenance.freshness})};
 }
 async function request(route,q={}, {method='GET',cacheable=true,key,versioned=true,timeoutMs=timeout}={}){
  const id=key||(route+'?'+params(q));
  if(method==='GET'&&cacheable){const hit=cache.get(id);if(hit&&hit.version===version){provenance={...provenance,cache:'HIT'};return hit.data}}
  let data;
  if(!remote){data=await driveRoute(route,q,{method});}
  else{
   const r=await doFetch('/api/'+route+'?'+params(q),{method,signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();
  }
  observe(data,{versioned});
  if(method==='GET'&&cacheable){cache.set(id,{version,data});if(cache.size>maxEntries)cache.delete(cache.keys().next().value)}
  return data;
 }
 return {
  request,setVersion,get version(){return version},get cached(){return cache.size},get provenance(){return provenance},clear:()=>cache.clear(),
  cacheKeyFor(q={}){const {focus='',depth=1,mode,offset,limit,...filters}=q;return cacheKey({fingerprint:version,focus,depth,source:provenance.source,filters:{...filters,mode,offset,limit}})},
  graph:async q=>{const {focus=''}=q||{};const data=await request('graph',q,{versioned:!auxiliaryFocus(focus)});return normalizeGraph(data,{focus})},
  projection:q=>request('projection',q||{},{versioned:false}),projectionContract:()=>request('projection',{describe:1},{versioned:false}),
  state:q=>request('state',q||{},{versioned:true}),health:()=>request('health',{},{cacheable:false,versioned:false}),
  entity:(id,view)=>request('entity',view?{id,view}:{id},{versioned:false}),lineage:id=>request('entity',{id,view:'lineage'},{versioned:false}).then(d=>normalizeGraph(d,{focus:id})),files:id=>request('entity',{id,view:'files'},{versioned:false}),
  audit:()=>request('audit',{},{versioned:false}),learning:()=>request('learning',{},{versioned:false}),learningFor:id=>request('learning',{id},{versioned:false}),learningLineage:id=>request('learning',{id,view:'lineage'},{versioned:false}),
  ops:()=>request('ops',{},{versioned:false}),automationRuns:()=>request('automation-runs',{},{versioned:false}),learningRelations:()=>request('learning-relations',{},{versioned:false}),
  sync:async()=>{const d=await request('sync',{},{method:'POST',cacheable:false,versioned:true,timeoutMs:syncTimeout});cache.clear();return d}
 };
}
