/** Graph Contract V1 client.
 *  The renderer only ever receives {nodes, edges}; provenance and cache metadata
 *  travel beside them. The frontend never learns the physical schema behind the
 *  API, so a projector change on the backend does not reach the Canvas. */

export const EMPTY_GRAPH = Object.freeze({
 nodes:[], edges:[], total:0, hasMore:false, truncated:false,
 depth:1, fingerprint:'', sourceVersion:'', issues:[]
});

/** Tolerates older or newer payloads: missing contract fields fall back, never throw. */
export function normalizeGraph(payload) {
 const p = payload && typeof payload === 'object' ? payload : {};
 const nodes = Array.isArray(p.nodes) ? p.nodes : [];
 const edges = Array.isArray(p.edges) ? p.edges : [];
 const ids = new Set(nodes.map(n => n.id));
 return {
  nodes,
  // A renderer must never receive an edge whose endpoint it cannot place.
  edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)),
  total: Number.isFinite(p.total) ? p.total : nodes.length,
  hasMore: !!p.hasMore,
  truncated: !!p.truncated,
  depth: Number(p.depth) || 1,
  fingerprint: String(p.fingerprint || ''),
  sourceVersion: String(p.sourceVersion || ''),
  issues: Array.isArray(p.issues) ? p.issues : []
 };
}

const keyOf = (route, q) => route + '?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null).sort()).toString();

export function createApi({fetchImpl, timeout = 65000, maxEntries = 48} = {}) {
 const doFetch = fetchImpl || ((...a) => fetch(...a));
 const cache = new Map();
 let version = '';

 /** A new projection fingerprint invalidates everything: the cache is never an authority. */
 function setVersion(next) {
  if (!next || next === version) return;
  version = next;
  cache.clear();
 }
 function remember(key, data) {
  cache.set(key, {version, data});
  if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
 }

 async function request(route, q = {}, {method = 'GET', cacheable = true} = {}) {
  const key = keyOf(route, q);
  if (method === 'GET' && cacheable) {
   const hit = cache.get(key);
   if (hit && hit.version === version) return hit.data;
  }
  const r = await doFetch('/api/' + route + '?' + new URLSearchParams(q), {method, signal: AbortSignal.timeout(timeout)});
  if (!r.ok) throw Error('HTTP ' + r.status);
  const data = await r.json();
  setVersion(data?.fingerprint || data?.projection?.fingerprint || version);
  if (method === 'GET' && cacheable) remember(key, data);
  return data;
 }

 return {
  request,
  setVersion,
  get version() {return version},
  get cached() {return cache.size},
  clear: () => cache.clear(),
  graph: q => request('graph', q).then(normalizeGraph),
  state: q => request('state', q),
  entity: (id, view) => request('entity', view ? {id, view} : {id}),
  lineage: id => request('entity', {id, view:'lineage'}).then(normalizeGraph),
  files: id => request('entity', {id, view:'files'}),
  audit: () => request('audit', {}),
  learning: () => request('learning', {}),
  learningFor: id => request('learning', {id}),
  automationRuns: () => request('automation-runs', {}),
  learningRelations: () => request('learning-relations', {}),
  // A refresh mutates the server read model, so it is never served or stored from cache.
  sync: async () => {const d = await request('sync', {}, {method:'POST', cacheable:false}); cache.clear(); return d}
 };
}
