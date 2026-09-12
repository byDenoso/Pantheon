/** Graph Contract client. Default Atlas reads are served from the Drive-derived read-only projection. */
import {normalizeGraph,cacheKey,EMPTY_GRAPH,SOURCES,FRESHNESS,CACHE_STATES,provenanceLabel} from './graph-contract.mjs';
import {driveRoute} from './drive-ssot.mjs';
import {subgraph} from './model.mjs';
export {normalizeGraph,EMPTY_GRAPH,SOURCES,FRESHNESS,provenanceLabel};

const params=q=>new URLSearchParams(Object.entries(q).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>[k,String(v)]));
const auxiliaryFocus=focus=>/^(system:(LEARNING|AUTOMATION)|learning-stage:|observation:|pattern:|lesson:|strategy:|policy:|ops-stage:|action:|run:|event:)/.test(String(focus||''));

export function createApi({fetchImpl, timeout = 20000, syncTimeout = 65000, maxEntries = 64, baseUrl = '/api'} = {}) {
 const apiBase = String(baseUrl || '/api').replace(/\/+$/, '');
 const configuredRemote = apiBase !== '/api' && typeof fetchImpl !== 'function';
 const remote = typeof fetchImpl === 'function' || configuredRemote;
 const doFetch = fetchImpl || ((...a) => fetch(...a));
 const cache = new Map();
 let version = '';
 let provenance = {source:remote ? SOURCES.LEGACY : SOURCES.DRIVE, freshness:FRESHNESS.SNAPSHOT, sourceVersion:'', cache:'', label:remote ? 'LEGACY SNAPSHOT' : 'DRIVE · PROJEÇÃO CANÔNICA'};

 function researchPayload(value) {
  const root = value && typeof value === 'object' ? value : {};
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root;
  return {
   ...data,
   source: data.source || SOURCES.DRIVE,
   freshness: root.freshness || data.freshness,
   sourceVersion: root.sourceModifiedAt || root.generatedAt || data.sourceVersion,
   fingerprint: data.fingerprint || root.fingerprint || '',
   provenance: root.provenance || data.provenance,
   access: root.access || data.access,
   privacyGate: root.privacyGate || data.privacyGate
  };
 }

 function researchGraph(value, query = {}) {
  const payload = researchPayload(value);
  const graph = normalizeGraph({
   ...payload,
   edges: Array.isArray(payload.edges) ? payload.edges.map(edge => ({...edge, type: edge.type || edge.relation})) : payload.edges
  }, {focus: query.focus || 'system:NEXO'});
  const view = subgraph(graph, {
   ...query,
   focus: query.focus || 'system:NEXO',
   mode: query.mode || 'children',
   depth: query.depth || 1
  });
  return {...graph, ...view, source: SOURCES.DRIVE, sourceVersion: payload.sourceVersion, freshness: payload.freshness || FRESHNESS.SNAPSHOT, fingerprint: payload.fingerprint};
 }

 function setVersion(next) {
  if (!next || next === version) return;
  const had = version;
  version = next;
  if (had) cache.clear();
 }
 function observe(data, {versioned = true} = {}) {
  const fp = data?.projection?.fingerprint || (versioned ? data?.fingerprint : '');
  if (fp) setVersion(fp);
  const source = data?.source || data?.projection?.source;
  const freshness = data?.freshness || data?.projection?.freshness;
  if (!source && !freshness) return;
  provenance = {
   source: source || provenance.source,
   freshness: freshness || provenance.freshness,
   sourceVersion: data?.sourceVersion || data?.projection?.sourceVersion || provenance.sourceVersion,
   cache: CACHE_STATES.includes(data?.cache) ? data.cache : '',
   label: provenanceLabel({source: source || provenance.source, freshness: freshness || provenance.freshness})
  };
 }

  async function request(route, q = {}, {method = 'GET', cacheable = true, key, versioned = true, timeoutMs = timeout} = {}) {
  const id = key || (route + '?' + params(q).toString());
  if (method === 'GET' && cacheable) {
   const hit = cache.get(id);
   if (hit && hit.version === version) {provenance = {...provenance, cache:'HIT'}; return hit.data}
  }
  let data;
  if (!remote) {
   data = await driveRoute(route, q, {method});
  } else {
   const r = await doFetch(apiBase + '/' + route + '?' + params(q).toString(), {method, signal: AbortSignal.timeout(timeoutMs)});
   if (!r.ok) throw Error('HTTP ' + r.status);
   data = await r.json();
  }
  const observed = data?.contract === 'NEXO_ATLAS_RESEARCH_API_V1' ? {...data, source: SOURCES.DRIVE, sourceVersion: data.sourceModifiedAt || data.generatedAt} : data;
  observe(observed, {versioned});
  if (method === 'GET' && cacheable) {
   cache.set(id, {version, data});
   if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }
  return data;
 }
 return {
  request,setVersion,get version(){return version},get cached(){return cache.size},get provenance(){return provenance},get remote(){return remote},clear:()=>cache.clear(),
  cacheKeyFor(q={}){const {focus='',depth=1,mode,offset,limit,...filters}=q;return cacheKey({fingerprint:version,focus,depth,source:provenance.source,filters:{...filters,mode,offset,limit}})},
  graph:async q=>{const {focus=''}=q||{};const data=await request(configuredRemote?'atlas/graph':'graph',q,{versioned:!auxiliaryFocus(focus)});return configuredRemote?researchGraph(data,q):normalizeGraph(data,{focus})},
  projection:q=>request('projection',q||{},{versioned:false}),projectionContract:()=>request('projection',{describe:1},{versioned:false}),
  state:q=>configuredRemote?request('universe/snapshot',q||{},{versioned:true}).then(researchPayload):request('state',q||{},{versioned:true}),
  research:(route,q={})=>request(route,q,{versioned:true}),
  health:()=>request('health',{},{cacheable:false,versioned:false}),
  entity:(id,view)=>configuredRemote?request('atlas/graph',{focus:id,mode:'children',depth:1},{versioned:false}).then(data=>{const graph=researchGraph(data,{focus:id,mode:'children',depth:1});return {entity:graph.nodes.find(node=>node.id===id)||null,relations:graph.edges.filter(edge=>edge.source===id||edge.target===id),source:SOURCES.DRIVE,provenance:researchPayload(data).provenance||[]};}):request('entity',view?{id,view}:{id},{versioned:false}),
  lineage:id=>configuredRemote?request('atlas/graph',{focus:id,mode:'lineage',depth:3},{versioned:false}).then(data=>researchGraph(data,{focus:id,mode:'lineage',depth:3})):request('entity',{id,view:'lineage'},{versioned:false}).then(d=>normalizeGraph(d,{focus:id})),
  files:id=>configuredRemote?Promise.resolve({id,files:[],source:SOURCES.DRIVE,reason:'FILES_ROUTE_NOT_PUBLISHED'}):request('entity',{id,view:'files'},{versioned:false}),
  audit:()=>request('audit',{},{versioned:false}),learning:()=>request('learning',{},{versioned:false}),learningFor:id=>request('learning',{id},{versioned:false}),learningLineage:id=>request('learning',{id,view:'lineage'},{versioned:false}),
  ops:()=>request('ops',{},{versioned:false}),automationRuns:()=>request('automation-runs',{},{versioned:false}),learningRelations:()=>request('learning-relations',{},{versioned:false}),
  sync:async()=>{if(configuredRemote){cache.clear();return {outcome:'READ_ONLY',source:'research-api'}}const d=await request('sync',{},{method:'POST',cacheable:false,versioned:true,timeoutMs:syncTimeout});cache.clear();return d}
 };
}
