// Tower hierarchy as a graph: Tower > Domain > Subdomain > Campaign > Test, plus dependency/contest edges between tests.
// Built only from published test records; absent subdomain/campaign become an explicit "not published" bucket (never invented).
import {articulationPoints, betweenness, components, cyclicNodes, indexGraph, layering, quotientWeights, type Edge} from './graph.ts';

export type NodeKind = 'root' | 'domain' | 'subdomain' | 'campaign' | 'test';
export type EdgeKind = 'contains' | 'depends' | 'contests';

/** Structural subset of the lab TestEntity: any published test record fits. */
export interface TowerTest {
  id: string; name?: string | null; domain: string; subdomainId?: string | null; subdomain?: string | null;
  campaignId?: string | null; verdict?: string | null; parents?: readonly string[]; contestOf?: string | null;
  /** ISO timestamp of the test's creation, when published */
  createdAt?: string | null;
  /** optional published metadata, shown as-is in the inspector (never synthesised) */
  status?: string | null; review?: string | null; verdictRaw?: string | null; blocker?: string | null; readiness?: {eligible: boolean; reasons: string[]} | null; hypothesisId?: string | null; executedAt?: string | null; createdSource?: string | null;
  execution?: {at?: string; battery_id?: string; run_ref?: string; runner?: string} | null;
  datasets?: unknown; artifacts?: unknown; reviews?: ReadonlyArray<{kind: string; outcome?: string; at?: string; ref?: string}>;
}

export interface TowerNode {
  id: string; kind: NodeKind; label: string; domain: string; parent: string | null; children: string[];
  /** published verdict for tests; null when absent */
  verdict: string | null;
  /** true for the explicit "not published" buckets */
  unpublished: boolean;
  /** epoch ms of creation for tests with a published, parseable date; null otherwise (never guessed) */
  born: number | null;
  leaves: number;
}
export interface TowerEdge {id: string; kind: EdgeKind; source: string; target: string}

export interface TowerMetrics {
  degree: Map<string, number>; inDeg: Map<string, number>; outDeg: Map<string, number>;
  betweenness: Map<string, number>; layer: Map<string, number>;
  articulation: Set<string>; cyclic: Set<string>; criticalPath: string[]; depth: number;
  componentCount: number; largestComponent: number;
}

export interface TowerGraph {
  nodes: TowerNode[]; byId: Map<string, TowerNode>; edges: TowerEdge[];
  /** dependency + contest edges only (between tests) */
  links: TowerEdge[];
  domains: string[];
  /** cross-domain dependency counts, key = pairKey(domainA, domainB) */
  domainLinks: Map<string, number>;
  metrics: TowerMetrics;
  /** parents/contest targets that point to a test not present in the record set */
  unresolved: number;
  counts: {domains: number; subdomains: number; campaigns: number; tests: number; dependencies: number; contests: number};
}

const bare = (s: string) => s.replace(/^(?:test|hypothesis|campaign|roadmap):/i, '');
const tidy = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
export const TOWER_ID = 'tower';

export function buildTowerGraph(tests: readonly TowerTest[], opts: {normDomain?: (d: string) => string; campaignLabel?: (id: string) => string | null} = {}): TowerGraph {
  const norm = opts.normDomain ?? ((d: string) => (d || 'SCIENCE').toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
  const nodes: TowerNode[] = []; const byId = new Map<string, TowerNode>(); const edges: TowerEdge[] = [];
  const add = (n: Omit<TowerNode, 'children' | 'leaves' | 'born'> & {born?: number | null}) => { const node: TowerNode = {...n, born: n.born ?? null, children: [], leaves: 0}; nodes.push(node); byId.set(node.id, node); if (n.parent) byId.get(n.parent)?.children.push(n.id); return node; };
  add({id: TOWER_ID, kind: 'root', label: 'Tower', domain: '', parent: null, verdict: null, unpublished: false});
  const contain = (p: string, c: string) => edges.push({id: `c:${p}>${c}`, kind: 'contains', source: p, target: c});

  const sorted = [...tests].sort((a, b) => bare(a.id).localeCompare(bare(b.id)));
  const testIds = new Set(sorted.map(t => `test:${bare(t.id)}`));
  for (const t of sorted) {
    const dom = norm(t.domain);
    const dId = `domain:${dom}`;
    if (!byId.has(dId)) { add({id: dId, kind: 'domain', label: tidy(dom), domain: dom, parent: TOWER_ID, verdict: null, unpublished: false}); contain(TOWER_ID, dId); }
    const sub = t.subdomainId ? bare(t.subdomainId) : null;
    const sId = `subdomain:${dom}/${sub ?? '∅'}`;
    if (!byId.has(sId)) { add({id: sId, kind: 'subdomain', label: sub ? (t.subdomain || sub) : 'Subdomínio não publicado', domain: dom, parent: dId, verdict: null, unpublished: !sub}); contain(dId, sId); }
    const camp = t.campaignId ? bare(t.campaignId) : null;
    const cId = `campaign:${dom}/${sub ?? '∅'}/${camp ?? '∅'}`;
    if (!byId.has(cId)) { add({id: cId, kind: 'campaign', label: camp ? (opts.campaignLabel?.(camp) || camp) : 'Campanha não publicada', domain: dom, parent: sId, verdict: null, unpublished: !camp}); contain(sId, cId); }
    const tId = `test:${bare(t.id)}`;
    if (byId.has(tId)) continue; // duplicate record: first wins
    add({id: tId, kind: 'test', label: t.name || bare(t.id), domain: dom, parent: cId, verdict: t.verdict ?? null, unpublished: false, born: (() => { const ms = t.createdAt ? Date.parse(t.createdAt) : NaN; return Number.isFinite(ms) ? ms : null; })()}); contain(cId, tId);
  }

  const links: TowerEdge[] = []; let unresolved = 0;
  for (const t of sorted) {
    const to = `test:${bare(t.id)}`;
    if (!byId.has(to)) continue;
    for (const p of t.parents ?? []) {
      const from = `test:${bare(p)}`;
      if (!testIds.has(from)) { unresolved += 1; continue; }
      if (from !== to) links.push({id: `d:${from}>${to}`, kind: 'depends', source: from, target: to});
    }
    if (t.contestOf) {
      const target = `test:${bare(t.contestOf)}`;
      if (!testIds.has(target)) unresolved += 1; else if (target !== to) links.push({id: `x:${to}>${target}`, kind: 'contests', source: to, target});
    }
  }
  const seen = new Set<string>(); const uniq = links.filter(l => (seen.has(l.id) ? false : (seen.add(l.id), true)));

  // leaf counts bottom-up (children are always created after their parent, so a reverse sweep is a post-order)
  for (let i = nodes.length - 1; i >= 0; i -= 1) { const n = nodes[i]!; n.leaves = n.kind === 'test' ? 1 : n.children.reduce((s, c) => s + byId.get(c)!.leaves, 0); }

  const testNodes = nodes.filter(n => n.kind === 'test').map(n => n.id);
  const depEdges: Edge[] = uniq.map(l => [l.source, l.target]);
  const g = indexGraph(testNodes, depEdges);
  const lay = layering(indexGraph(testNodes, uniq.filter(l => l.kind === 'depends').map(l => [l.source, l.target] as Edge)));
  const comps = components(g);
  const degree = new Map<string, number>(), inDeg = new Map<string, number>(), outDeg = new Map<string, number>();
  g.ids.forEach((id, i) => { degree.set(id, g.und[i]!.length); inDeg.set(id, g.inn[i]!.length); outDeg.set(id, g.out[i]!.length); });
  const domainOf = (id: string) => byId.get(id)?.domain;
  const domainLinks = quotientWeights(depEdges, domainOf);
  const domains = nodes.filter(n => n.kind === 'domain').map(n => n.domain);
  return {
    nodes, byId, edges, links: uniq, domains, domainLinks, unresolved,
    counts: {domains: domains.length, subdomains: nodes.filter(n => n.kind === 'subdomain').length, campaigns: nodes.filter(n => n.kind === 'campaign').length,
      tests: testNodes.length, dependencies: uniq.filter(l => l.kind === 'depends').length, contests: uniq.filter(l => l.kind === 'contests').length},
    metrics: {degree, inDeg, outDeg, betweenness: betweenness(g), layer: lay.layer, articulation: articulationPoints(g),
      cyclic: cyclicNodes(indexGraph(testNodes, uniq.filter(l => l.kind === 'depends').map(l => [l.source, l.target] as Edge))),
      criticalPath: lay.criticalPath.length > 1 ? lay.criticalPath : [], depth: lay.depth,
      componentCount: comps.length, largestComponent: comps[0]?.length ?? 0},
  };
}
