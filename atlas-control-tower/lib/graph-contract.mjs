/** Graph Contract V1 — the only shape the presentation layer knows.
 *
 *  Shared by the API (producer) and the browser (consumer) so both agree without
 *  the frontend ever learning the physical schema behind it. Unknown fields are
 *  carried through untouched; absent optional fields fall back instead of
 *  breaking the UI. A V1 backend may add keys freely. */

export const CONTRACT_VERSION = 'v1';

/** Where a payload came from. Never inferred silently — the producer declares it. */
export const SOURCES = Object.freeze({LEGACY:'legacy', V1:'v1'});
/** How fresh the answer is. Surfaced in the UI; a fallback is never silent. */
export const FRESHNESS = Object.freeze({LIVE:'LIVE', STAGING:'STAGING', SNAPSHOT:'SNAPSHOT', STALE:'STALE', FALLBACK:'FALLBACK'});
/** Cache disposition, when the producer reports one. */
export const CACHE_STATES = Object.freeze(['HIT', 'MISS', 'STALE', 'REVALIDATED']);

export const EMPTY_GRAPH = Object.freeze({
 focus:'', nodes:[], edges:[], total:0, hasMore:false, truncated:false, depth:1,
 fingerprint:'', sourceVersion:'', source:SOURCES.LEGACY, freshness:FRESHNESS.SNAPSHOT,
 cache:'', issues:[]
});

const str = (v, fallback = '') => (v == null ? fallback : String(v));
const arr = v => (Array.isArray(v) ? v : []);

/** Normalises any compatible payload. Extra keys survive under `extra`. */
export function normalizeGraph(payload, {focus = ''} = {}) {
 const p = payload && typeof payload === 'object' ? payload : {};
 const nodes = arr(p.nodes);
 const edges = arr(p.edges);
 const ids = new Set(nodes.map(n => n.id));
 const known = new Set(['focus','nodes','edges','total','hasMore','truncated','depth','fingerprint','sourceVersion','source','freshness','cache','issues']);
 const extra = Object.fromEntries(Object.entries(p).filter(([k]) => !known.has(k)));
 return {
  focus: str(p.focus, focus),
  nodes,
  // A renderer must never receive an edge it cannot place.
  edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)),
  total: Number.isFinite(p.total) ? p.total : nodes.length,
  hasMore: !!p.hasMore,
  truncated: !!p.truncated,
  depth: Number(p.depth) || 1,
  fingerprint: str(p.fingerprint),
  sourceVersion: str(p.sourceVersion),
  source: p.source === SOURCES.V1 ? SOURCES.V1 : SOURCES.LEGACY,
  freshness: Object.values(FRESHNESS).includes(p.freshness) ? p.freshness : FRESHNESS.SNAPSHOT,
  cache: CACHE_STATES.includes(p.cache) ? p.cache : '',
  issues: arr(p.issues),
  extra
 };
}

/** Reports contract drift instead of throwing, so a partial V1 still renders. */
export function contractIssues(payload) {
 const p = payload && typeof payload === 'object' ? payload : {};
 const missing = ['nodes', 'edges'].filter(k => !Array.isArray(p[k]));
 const soft = ['total', 'fingerprint', 'sourceVersion', 'depth'].filter(k => p[k] == null);
 const badEdges = arr(p.edges).filter(e => !e || !e.source || !e.target).length;
 return [
  ...missing.map(k => ({level:'ERROR', field:k, reason:'MISSING_REQUIRED_ARRAY'})),
  ...soft.map(k => ({level:'WARN', field:k, reason:'MISSING_OPTIONAL_FIELD'})),
  ...(badEdges ? [{level:'WARN', field:'edges', reason:'EDGE_WITHOUT_ENDPOINTS', count:badEdges}] : [])
 ];
}

/** Deterministic, order-independent cache key: graph:v1:<fingerprint>:<focus>:<depth>:<filters> */
export function cacheKey({fingerprint = '', focus = '', depth = 1, filters = {}, source = SOURCES.LEGACY} = {}) {
 const f = Object.entries(filters)
  .filter(([, v]) => v !== '' && v != null)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join(',');
 return `graph:${CONTRACT_VERSION}:${source}:${fingerprint || 'nofp'}:${focus || 'root'}:${depth}:${f || 'none'}`;
}

/** Short, human-facing description of where the data came from and how fresh it is. */
export function provenanceLabel({source, freshness, sourceVersion} = {}) {
 const base = source === SOURCES.V1
  ? (freshness === FRESHNESS.STAGING ? 'STAGING V1' : 'NEON V1')
  : 'LEGACY SNAPSHOT';
 if (freshness === FRESHNESS.FALLBACK) return 'FALLBACK · ' + base;
 if (freshness === FRESHNESS.STALE) return 'STALE · ' + base;
 if (freshness === FRESHNESS.LIVE) return 'LIVE · ' + base;
 return base + (sourceVersion ? '' : '');
}
