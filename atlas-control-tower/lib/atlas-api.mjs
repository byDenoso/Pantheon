/** Graph Contract V1 client.
 *  The renderer only ever receives {nodes, edges}; provenance and cache metadata
 *  travel beside them. The frontend never learns the physical schema behind the
 *  API, so a projector change on the backend does not reach the Canvas. */
import {normalizeGraph, cacheKey, EMPTY_GRAPH, SOURCES, FRESHNESS, CACHE_STATES, provenanceLabel} from './graph-contract.mjs';

export {normalizeGraph, EMPTY_GRAPH, SOURCES, FRESHNESS, provenanceLabel};

const params = q => new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]));
const auxiliaryFocus = focus => /^(system:(LEARNING|AUTOMATION)|learning-stage:|observation:|pattern:|lesson:|strategy:|policy:|ops-stage:|action:|run:|event:)/.test(String(focus || ''));

export function createApi({fetchImpl, timeout = 65000, maxEntries = 64} = {}) {
 const doFetch = fetchImpl || ((...a) => fetch(...a));
 const cache = new Map();
 let version = '';
 let provenance = {source:SOURCES.LEGACY, freshness:FRESHNESS.SNAPSHOT, sourceVersion:'', cache:'', label:'LEGACY SNAPSHOT'};

 /** Science projection fingerprint is the global invalidation token.
  *  Learning and Black Box have independent fingerprints and must never evict
  *  the Science graph (nor each other) simply because the user navigated tabs. */
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

 async function request(route, q = {}, {method = 'GET', cacheable = true, key, versioned = true} = {}) {
  const id = key || (route + '?' + params(q).toString());
  if (method === 'GET' && cacheable) {
   const hit = cache.get(id);
   if (hit && hit.version === version) {provenance = {...provenance, cache:'HIT'}; return hit.data}
  }
  const r = await doFetch('/api/' + route + '?' + params(q), {method, signal: AbortSignal.timeout(timeout)});
  if (!r.ok) throw Error('HTTP ' + r.status);
  const data = await r.json();
  observe(data, {versioned});
  if (method === 'GET' && cacheable) {
   cache.set(id, {version, data});
   if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
  }
  return data;
 }

 return {
  request,
  setVersion,
  get version() {return version},
  get cached() {return cache.size},
  get provenance() {return provenance},
  clear: () => cache.clear(),
  cacheKeyFor(q = {}) {
   const {focus = '', depth = 1, mode, offset, limit, ...filters} = q;
   return cacheKey({fingerprint: version, focus, depth, source: provenance.source, filters: {...filters, mode, offset, limit}});
  },
  graph: async q => {
   const {focus = ''} = q || {};
   const data = await request('graph', q, {versioned: !auxiliaryFocus(focus)});
   return normalizeGraph(data, {focus});
  },
  state: q => request('state', q || {}, {versioned:true}),
  health: () => request('health', {}, {cacheable:false, versioned:false}),
  entity: (id, view) => request('entity', view ? {id, view} : {id}, {versioned:false}),
  lineage: id => request('entity', {id, view:'lineage'}, {versioned:false}).then(d => normalizeGraph(d, {focus:id})),
  files: id => request('entity', {id, view:'files'}, {versioned:false}),
  audit: () => request('audit', {}, {versioned:false}),
  learning: () => request('learning', {}, {versioned:false}),
  learningFor: id => request('learning', {id}, {versioned:false}),
  learningLineage: id => request('learning', {id, view:'lineage'}, {versioned:false}),
  automationRuns: () => request('automation-runs', {}, {versioned:false}),
  learningRelations: () => request('learning-relations', {}, {versioned:false}),
  sync: async () => {const d = await request('sync', {}, {method:'POST', cacheable:false, versioned:true}); cache.clear(); return d}
 };
}
