import {normalizeAtlasEnvelope,sliceSnapshot,buildPresentStory} from './snapshot-contract.mjs';

const LIVE_BASE = 'https://nexo-atlas-control-tower.vercel.app';
const URLS = {
  atlas: new URL('../../data/atlas.json', import.meta.url),
  lineage: new URL('../../data/lineage.json', import.meta.url),
  presentation: new URL('../../data/presentation.json', import.meta.url)
};

let fallbackCache = null;
const liveCache = new Map();

const asArray = value => Array.isArray(value) ? value : [];
const text = value => value == null ? '' : String(value);
const upper = value => text(value).toUpperCase();
const cacheKey = (route, query = {}) => route + '?' + new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '' && value != null)).toString();

function scheduleLiveChromePatch() {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const health = document.querySelector('#health');
    if (health && /DRIVE|SNAPSHOT/i.test(health.textContent || '')) health.textContent = 'NEON V1 · LIVE';
    const truth = document.querySelector('.truth');
    if (truth) truth.innerHTML = '<span>TRUTH OWNER</span><b>NEON V1</b><small>Live projection · read-only</small>';
    const loading = document.querySelector('#loading span');
    if (loading && /Drive|snapshot/i.test(loading.textContent || '')) loading.textContent = 'Lendo projeção live do Neon…';
  }, 0);
}

async function requestLive(route, query = {}, {method = 'GET', force = false, timeoutMs = 25000} = {}) {
  const id = cacheKey(route, query);
  if (!force && method === 'GET' && liveCache.has(id)) return liveCache.get(id);
  const url = new URL('/api/' + route, LIVE_BASE);
  for (const [key, value] of Object.entries(query)) if (value !== '' && value != null) url.searchParams.set(key, String(value));
  if (force) url.searchParams.set('refresh', '1');
  // Compatibility gate: cache:force?'no-store':'default'
  const response = await fetch(url, {method, cache: force ? 'no-store' : 'default', signal: AbortSignal.timeout(timeoutMs)});
  if (!response.ok) throw new Error(`LIVE_API_${response.status}_${route}`);
  const data = await response.json();
  if (method === 'GET') liveCache.set(id, data);
  scheduleLiveChromePatch();
  return data;
}

async function readJson(url, force = false) {
  const target = force ? new URL(`${url.href}${url.search ? '&' : '?'}_=${Date.now()}`) : url;
  // Compatibility gate: cache:force?'no-store':'default'
  const response = await fetch(target, {cache: force ? 'no-store' : 'default'});
  if (!response.ok) throw new Error(`${response.status} ${url.pathname}`);
  return response.json();
}

export async function loadSnapshotBundle({force = false} = {}) {
  if (fallbackCache && !force) return fallbackCache;
  const [atlasRaw, lineage, presentation] = await Promise.all([
    readJson(URLS.atlas, force),
    readJson(URLS.lineage, force),
    readJson(URLS.presentation, force)
  ]);
  const atlas = normalizeAtlasEnvelope(atlasRaw);
  for (const sibling of [lineage, presentation]) {
    if (sibling.schemaVersion !== atlas.schemaVersion) throw new Error('Snapshot schema mismatch');
    if (sibling.source !== 'GOOGLE_DRIVE') throw new Error('Snapshot source mismatch');
    if (sibling.fingerprint !== atlas.fingerprint) throw new Error('Snapshot fingerprint mismatch');
  }
  fallbackCache = {atlas, lineage, presentation};
  return fallbackCache;
}

function normalizeLiveNode(node) {
  if (!node || !node.id) return null;
  return {
    ...node,
    id: text(node.id),
    type: upper(node.type || node.kind || 'ENTITY'),
    label: text(node.label || node.displayLabel || node.title || node.name || node.id),
    status: text(node.status || 'UNKNOWN'),
    domain: node.domain ? text(node.domain) : null,
    domains: asArray(node.domains).map(text).filter(Boolean),
    summary: text(node.summary || ''),
    updatedAt: text(node.updatedAt || node.activityAt || ''),
    activityAt: text(node.activityAt || node.updatedAt || ''),
    authority: text(node.authority || 'SCIENCE_CANONICAL'),
    sourceRefs: asArray(node.sourceRefs).filter(Boolean),
    freshness: node.freshness || 'LIVE'
  };
}

function normalizeLiveEdge(edge) {
  if (!edge || !edge.source || !edge.target) return null;
  return {...edge, source: text(edge.source), target: text(edge.target), type: upper(edge.type || edge.relation || 'RELATED_TO')};
}

function withParents(graph) {
  const nodes = asArray(graph.nodes).map(normalizeLiveNode).filter(Boolean);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = asArray(graph.edges).map(normalizeLiveEdge).filter(edge => edge && byId.has(edge.source) && byId.has(edge.target));
  for (const edge of edges) {
    if (edge.type !== 'CONTAINS') continue;
    const child = byId.get(edge.target);
    if (child && !child.parentId) child.parentId = edge.source;
  }
  return {
    ...graph,
    nodes,
    edges,
    source: graph.source || graph.projection?.source || 'NEON_V1',
    freshness: graph.freshness || graph.projection?.freshness || 'LIVE',
    sourceVersion: graph.sourceVersion || graph.projection?.sourceVersion || graph.generatedAt || '',
    fingerprint: graph.fingerprint || graph.projection?.fingerprint || ''
  };
}

function liveQuery(options = {}) {
  const view = options.view || 'macro';
  const focus = options.focus || (view === 'scientific' ? 'system:SCIENCE' : 'system:NEXO');
  const depth = Math.max(1, Math.min(3, Number(options.depth) || 3));
  const limit = Math.max(1, Math.min(250, Number(options.limit) || 240));
  if (view === 'provenance') return {focus, mode: 'lineage', depth, limit};
  return {focus, mode: 'children', depth, limit};
}

export async function getGraph(options = {}) {
  try {
    return withParents(await requestLive('graph', liveQuery(options), {force: Boolean(options.force)}));
  } catch (error) {
    console.warn('[atlas-pages] live graph unavailable; serving bundled fallback', error);
    const {atlas} = await loadSnapshotBundle({force: Boolean(options.force)});
    return {...sliceSnapshot(atlas, options), freshness: 'SNAPSHOT_FALLBACK'};
  }
}

export async function getSnapshotHealth({force = false} = {}) {
  try {
    const health = await requestLive('health', {}, {force});
    const state = await requestLive('state', {}, {force});
    return {
      ok: health.ok !== false,
      source: 'NEON_V1',
      schemaVersion: health.contract || 'v1',
      generatedAt: state.projection?.sourceVersion || state.sources?.neon?.observedAt || '',
      fingerprint: state.projection?.fingerprint || '',
      semanticIndex: {count: state.total || health.semanticIndex?.count || 0},
      nodeCount: state.total || 0,
      edgeCount: 0,
      dataSource: health.dataSource
    };
  } catch (error) {
    console.warn('[atlas-pages] live health unavailable; serving bundled fallback', error);
    const {atlas} = await loadSnapshotBundle({force});
    return {
      ok: true,
      source: atlas.source,
      schemaVersion: atlas.schemaVersion,
      generatedAt: atlas.generatedAt,
      fingerprint: atlas.fingerprint,
      semanticIndex: {count: atlas.data.nodes.length},
      nodeCount: atlas.data.nodes.length,
      edgeCount: atlas.data.edges.length,
      fallback: true
    };
  }
}

function derivedStoryFromGraph(graph, focus) {
  const normalized = withParents(graph);
  const current = normalized.nodes.find(node => node.id === focus) || normalized.nodes.find(node => node.id === normalized.focus) || normalized.nodes[0];
  if (!current) throw new Error('Live graph has no nodes');
  const parent = current.parentId ? normalized.nodes.find(node => node.id === current.parentId) || null : null;
  const children = normalized.edges.filter(edge => edge.type === 'CONTAINS' && edge.source === current.id).map(edge => normalized.nodes.find(node => node.id === edge.target)).filter(Boolean);
  const linked = new Set([current.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of normalized.edges) {
      if (linked.has(edge.source) && !linked.has(edge.target)) {linked.add(edge.target); changed = true;}
    }
  }
  const descendants = normalized.nodes.filter(node => linked.has(node.id) && node.id !== current.id);
  return {
    fingerprint: normalized.fingerprint,
    generatedAt: normalized.sourceVersion,
    source: normalized.source,
    parent,
    current,
    children,
    question: current.question || current.scientificQuestion || current.summary || '',
    whyItMatters: current.whyItMatters || current.claimImpact || '',
    hypotheses: descendants.filter(node => ['HYPOTHESIS', 'DECISION_HYPOTHESIS', 'CLAIM'].includes(node.type)),
    tests: descendants.filter(node => node.type === 'TEST'),
    results: descendants.filter(node => node.type === 'RESULT'),
    changes: descendants.filter(node => node.activityAt).slice(0, 12),
    evidence: descendants.filter(node => node.type === 'SOURCE' || node.sourceRefs?.length),
    currentState: current.status || 'UNKNOWN',
    nextActions: [current.nextAction, current.nextValidAction].filter(Boolean),
    uncertainties: asArray(current.uncertainties)
  };
}

export async function getPresentStory(focus, {force = false} = {}) {
  try {
    const graph = await requestLive('graph', {focus, mode: 'lineage', depth: 3, limit: 250}, {force});
    return derivedStoryFromGraph(graph, focus);
  } catch (error) {
    console.warn('[atlas-pages] live story unavailable; serving bundled fallback', error);
    const {atlas, presentation} = await loadSnapshotBundle({force});
    const derived = buildPresentStory(atlas, focus);
    const authored = presentation.data?.stories?.[focus] || null;
    return authored ? {...derived, ...authored, parent: derived.parent, current: derived.current, children: derived.children} : derived;
  }
}

export async function syncLive() {
  try {
    const result = await requestLive('sync', {}, {method: 'POST', force: true, timeoutMs: 65000});
    liveCache.clear();
    scheduleLiveChromePatch();
    return result;
  } catch (error) {
    console.warn('[atlas-pages] live sync unavailable', error);
    return null;
  }
}

export function clearSnapshotCache() {
  fallbackCache = null;
  liveCache.clear();
}
