// Synthetic private-runtime generator. Structure comes from the repo's existing deterministic
// state builder; every free-text field is replaced by neutral text. No real names, ids or data.
import {SCENARIOS} from '../../src/data/fixtures/scenarios.ts';

export const FP = `sha256:${'ab12'.repeat(16)}`;
export const FP2 = `sha256:${'cd34'.repeat(16)}`;
const TEXT_KEYS = new Set(['title', 'summary', 'label', 'name', 'description', 'detail', 'message', 'explanation', 'scenario_label']);

export function neutralize(value, counter = {n: 0}) {
  if (Array.isArray(value)) return value.map(v => neutralize(v, counter));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'string' && TEXT_KEYS.has(k) ? `Sintético ${k} ${++counter.n}` : neutralize(v, counter)]));
  }
  return value;
}

export function makeSystem(fp = FP) {
  const s = neutralize(SCENARIOS[0].build());
  s.bus = {...s.bus, fingerprint: fp};
  return s;
}

const iso = '2030-01-01T00:00:00.000Z';
export function makeWorld(fp = FP) {
  const fresh = {state: 'SNAPSHOT', observedAt: iso, expiresAt: '2030-01-02T00:00:00.000Z'};
  return {
    version: '1', fingerprint: fp, generatedAt: iso, access: 'PRIVATE',
    providers: [{id: 'nexo', label: 'Fonte sintética', status: 'AVAILABLE', lastSuccessAt: iso, checkedAt: iso, revision: 'opaque-1', message: '', partial: false, count: 2}],
    items: [
      {id: 'syn-item-1', kind: 'ENTITY', title: 'Item sintético 1', source: 'nexo', sourceRef: 'synthetic://1', authority: 'DERIVED', freshness: fresh, contextId: 'NEXO', attention: 'NOTICE', actions: [], observedAt: iso},
      {id: 'syn-item-2', kind: 'EVENT', title: 'Item sintético 2', source: 'nexo', sourceRef: 'synthetic://2', authority: 'DERIVED', freshness: fresh, contextId: 'NEXO', attention: 'ACT', actions: [], observedAt: iso},
    ],
    contexts: [{id: 'NEXO', title: 'Contexto sintético', description: '', itemIds: ['syn-item-1', 'syn-item-2'], attentionCount: 1, coverage: 'AVAILABLE'}],
    issues: [], truthGraph: {fingerprint: fp, checked_at: iso, results: [], material_conflicts: []},
    diff: {previous: null, current: fp, added: [], updated: [], removed: [], providerChanges: []},
  };
}

export function makeGalaxy(fp = FP, rev = 'opaque-rev-7') {
  return {
    contract: 'NEXO_ONE_GALAXY_V1', snapshot_id: 'syn-snapshot-1', generated_at: iso, tower_revision: rev, access: 'PRIVATE',
    fingerprint: fp, provenance: {source_contract: 'NEXO_ATLAS_PRIVATE_RUNTIME_V1', source_fingerprint: fp},
    entities: [{id: 'syn-entity-1', kind: 'ENTITY', layout: {x: 0, y: 0, z: 0}, source: {projection_fingerprint: fp}}],
    events: [], needs_you: [], relations: [], stats: {entities: 1, relations: 0, needs_you: 0},
  };
}

export function makeTopology(fp = FP) {
  const node = (id, kind, group) => ({id, label: `Sintético ${id}`, kind, group, status: 'LIVE', summary: 'Resumo sintético'});
  return {
    contract: 'NEXO_MCP_TOPOLOGY_V1', access: 'PRIVATE', generated_at: iso,
    source: {authority: 'synthetic', repository: 'synthetic', commit: 'opaque', manifest: 'synthetic', mcp_server: 'synthetic', remote_mcp: 'synthetic', projection_fingerprint: fp},
    stats: {tools: 1, remote_tools: 0, internal_tools: 1, capabilities: 1, backends: 1, roles: 1, families: 1, status_counts: {LIVE: 5}, backend_counts: {synthetic: 1}},
    nodes: [node('root', 'ROOT', 'g'), node('tool-1', 'TOOL', 'g'), node('cap-1', 'CAPABILITY', 'g'), node('be-1', 'BACKEND', 'g'), node('role-1', 'ROLE', 'g')],
    links: [{id: 'l1', source: 'root', target: 'tool-1', kind: 'CONTAINS', weight: 1}, {id: 'l2', source: 'tool-1', target: 'cap-1', kind: 'PROVIDES', weight: 1}],
  };
}

export function makeRuntime(over = {}, fp = FP) {
  return {
    contract: 'NEXO_ATLAS_PRIVATE_RUNTIME_V1', access: 'PRIVATE', generated_at: iso, source_revision: 'opaque-rev-7', fingerprint: fp,
    system: makeSystem(fp), world: makeWorld(fp),
    topology: makeTopology(fp),
    publication: {contract: 'NEXO_PRIVATE_PROJECTION_PUBLICATION_V1', access: 'PRIVATE', build_meta: {projection_fingerprint: fp}, manifest: {access: 'PRIVATE', projection_fingerprint: fp}},
    galaxy: makeGalaxy(fp),
    ...over,
  };
}

/** Larger synthetic Tower: 3 domains x subdomains x campaigns, tests with in-domain and a few cross-domain dependencies. Deterministic, no real names. */
export function makeTowerSystem(n = 240, fp = FP) {
  const s = makeSystem(fp);
  const doms = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'], verdicts = ['CONFIRMED', 'REFUTED', 'REVIEW', 'PROVISIONAL', 'READY'];
  const tests = [], nodes = [], campaigns = new Map();
  for (let i = 0; i < n; i += 1) {
    const d = doms[i % 3], sub = `${d.toLowerCase()}-sub${(i >> 2) % 4}`, camp = `camp-${d.toLowerCase()}-${(i >> 3) % 5}`;
    const id = `syn-t${String(i).padStart(4, '0')}`;
    const parents = i < 3 ? [] : [`syn-t${String(i - 3 - ((i * 7) % 3) * 3 >= 0 ? i - 3 - ((i * 7) % 3) * 3 : 0).padStart(4, '0')}`].filter(p => p !== id);
    if (i % 29 === 0 && i > 30) parents.push(`syn-t${String(i - 1).padStart(4, '0')}`); // occasional cross-domain link
    const verdict = verdicts[(i * 7 + (i >> 2)) % verdicts.length];
    tests.push({id: `test:${id}`, domain: d, campaign_id: `campaign:${camp}`, parents: parents.map(p => `test:${p}`), ...(i % 25 === 0 ? {} : {created_at: new Date(Date.UTC(2030, 0, 1 + (i >> 2))).toISOString()}), status: verdict === 'READY' ? 'READY' : verdict === 'PROVISIONAL' ? 'DONE' : 'DONE', review_state: ['CONFIRMED', 'REFUTED'].includes(verdict) ? verdict : verdict === 'REVIEW' ? 'PENDING_REVIEW' : null, verdict});
    nodes.push({...s.graph.nodes.find(x => x.type === 'TEST'), id: `test:${id}`, label: `Teste ${i}`, domain: d, semantic_domain: d, semantic_subdomain_id: `subdomain:${sub}`, semantic_subdomain: `Sub ${sub}`, campaign_id: `campaign:${camp}`});
    campaigns.set(camp, {id: `campaign:${camp}`, title: `Campanha ${camp}`});
  }
  return {...s, graph: {...s.graph, nodes: [...s.graph.nodes.filter(x => x.type !== 'TEST'), ...nodes]}, science_projection_v1: {tests, campaigns: [...campaigns.values()]}};
}
