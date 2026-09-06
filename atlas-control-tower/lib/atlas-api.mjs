/** Graph Contract V1 client.
 * The renderer only ever receives {nodes, edges}; provenance and cache metadata
 * travel beside them. The frontend never learns the physical schema behind the API. */
import {normalizeGraph, cacheKey, EMPTY_GRAPH, SOURCES, FRESHNESS, CACHE_STATES, provenanceLabel} from './graph-contract.mjs';

export {normalizeGraph, EMPTY_GRAPH, SOURCES, FRESHNESS, provenanceLabel};
const params=q=>new URLSearchParams(Object.entries(q).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>[k,String(v)]));

export function createApi({fetchImpl,timeout=65000,maxEntries=48}={}){
 const doFetch=fetchImpl||((...a)=>fetch(...a));
 const cache=new Map();
 let version='',bypassNextGraph=false;
 let provenance={source:SOURCES.LEGACY,freshness:FRESHNESS.SNAPSHOT,sourceVersion:'',cache:'',label:'LEGACY SNAPSHOT'};
 function setVersion(next){if(!next||next===version)return;const had=version;version=next;if(had)cache.clear()}
 function observe(data){const fp=data?.fingerprint||data?.projection?.fingerprint;setVersion(fp||version);const source=data?.source||data?.projection?.source,freshness=data?.freshness||data?.projection?.freshness;if(!source&&!freshness)return;provenance={source:source||provenance.source,freshness:freshness||provenance.freshness,sourceVersion:data?.sourceVersion||data?.projection?.sourceVersion||provenance.sourceVersion,cache:CACHE_STATES.includes(data?.cache)?data.cache:'',label:provenanceLabel({source:source||provenance.source,freshness:freshness||provenance.freshness})}}
 async function request(route,q={}, {method='GET',cacheable=true,key}={}){const id=key||(route+'?'+params(q).toString());if(method==='GET'&&cacheable){const hit=cache.get(id);if(hit&&hit.version===version){provenance={...provenance,cache:'HIT'};return hit.data}}const r=await doFetch('/api/'+route+'?'+params(q),{method,signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();observe(data);if(method==='GET'&&cacheable){cache.set(id,{version,data});if(cache.size>maxEntries)cache.delete(cache.keys().next().value)}return data}
 return{request,setVersion,get version(){return version},get cached(){return cache.size},get provenance(){return provenance},clear:()=>cache.clear(),cacheKeyFor(q={}){const{focus='',depth=1,mode,offset,limit,...filters}=q;return cacheKey({fingerprint:version,focus,depth,source:provenance.source,filters:{...filters,mode,offset,limit}})},graph:async(q={})=>{const{focus=''}=q,bypass=bypassNextGraph,requestQ=bypass?{...q,refresh:1}:q,stableKey='graph?'+params(q).toString(),data=await request('graph',requestQ,{key:stableKey});if(bypass)bypassNextGraph=false;return normalizeGraph(data,{focus})},state:q=>request('state',q||{}),health:()=>request('health',{}, {cacheable:false}),entity:(id,view)=>request('entity',view?{id,view}:{id}),lineage:id=>request('entity',{id,view:'lineage'}).then(d=>normalizeGraph(d,{focus:id})),files:id=>request('entity',{id,view:'files'}),audit:()=>request('audit',{}),learning:()=>request('learning',{}),learningFor:id=>request('learning',{id}),learningLineage:id=>request('learning',{id,view:'lineage'}),automationRuns:()=>request('automation-runs',{}),learningRelations:()=>request('learning-relations',{}),sync:async()=>{const d=await request('sync',{}, {method:'POST',cacheable:false});cache.clear();bypassNextGraph=true;return d}};
}
