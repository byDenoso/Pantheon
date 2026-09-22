import type { GraphEdge, GraphNode, SystemState } from '../contracts/system.ts';
import {
  ATLAS_TOP_DOMAINS,
  atlasSubdomainNodeId,
  atlasSubdomainOf,
  atlasTopDomainOf,
  type AtlasTopDomain,
} from '../viewmodels/atlasTaxonomy.ts';

export type AtlasNodeKind = 'hub' | 'subdomain' | GraphNode['type'];

export interface AtlasTemporalPoint {
  label: 'observed' | 'checked' | 'projection';
  at: string;
}

export interface AtlasMetroNode {
  id: string;
  sourceId: string | null;
  name: string;
  domain: AtlasTopDomain;
  parentId: string | null;
  entityType: AtlasNodeKind;
  status: string;
  summary: string;
  depth: number;
  childCount: number;
  descendantCount: number;
  relationCount: number;
  mix: number;
  updatedAt: string | null;
  sourceRevision: string | null;
  fingerprint: string | null;
  authorityClass: string | null;
  temporal: AtlasTemporalPoint[];
  synthetic: boolean;
}

export interface AtlasCrossLink {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: string;
  weight: number;
  aggregated: boolean;
  isLearning: boolean;
  learningScope: 'INTRA_DOMAIN' | 'INTER_DOMAIN' | null;
  learningRef: string | null;
  learningKind: 'SEMANTIC' | 'PROCEDURAL' | 'SCIENTIFIC_LEARNING_PIPELINE' | null;
  learningGroup: string | null;
  bundleIndex: number;
  bundleCount: number;
}

export interface AtlasMetroModel {
  revision: string;
  generatedAt: string;
  roots: string[];
  nodes: AtlasMetroNode[];
  nodeMap: Map<string, AtlasMetroNode>;
  childrenMap: Map<string, string[]>;
  crossLinks: AtlasCrossLink[];
  sourceNodeIds: Set<string>;
}

const ROOT_IDS: Record<AtlasTopDomain, string> = {
  NEXO: 'atlas.domain.nexo',
  SCIENCE: 'atlas.domain.science',
  OLYMPUS: 'atlas.domain.olympus',
};

export const ATLAS_METRO_ROOTS = ATLAS_TOP_DOMAINS.map(domain => ROOT_IDS[domain]);

const ROOT_LABEL: Record<AtlasTopDomain, string> = {
  NEXO: 'Nexo',
  SCIENCE: 'Science',
  OLYMPUS: 'Olympus',
};

function updatedAt(node: GraphNode, state: SystemState): string | null {
  return node.freshness?.observed_at || node.checked_at || state.generated_at || null;
}

function temporalPoints(node: GraphNode, state: SystemState): AtlasTemporalPoint[] {
  const points: AtlasTemporalPoint[] = [];
  if (node.freshness?.observed_at) points.push({ label: 'observed', at: node.freshness.observed_at });
  if (node.checked_at && !points.some(point => point.at === node.checked_at)) {
    points.push({ label: 'checked', at: node.checked_at });
  }
  if (state.generated_at && !points.some(point => point.at === state.generated_at)) {
    points.push({ label: 'projection', at: state.generated_at });
  }
  return points;
}

function entitySummary(node: GraphNode): string {
  return node.summary || `${node.type} · ${node.label}`;
}

function aggregateStatus(nodes: GraphNode[]): string {
  const states = nodes.map(node => String(node.state || '').toUpperCase());
  if (states.some(state => /CONFLICT|FAILED|BLOCKED|MISSING/.test(state))) return 'WATCH';
  if (states.some(state => /STALE|DEGRADED|UNKNOWN|UNVERIFIED/.test(state))) return 'AGING';
  return 'LIVE';
}

function uniquePairs<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function atlasEndpointFor(
  rawId: string | undefined,
  sourceNodeIds: Set<string>,
): string | null {
  if (!rawId) return null;
  if (sourceNodeIds.has(rawId)) return rawId;
  const domainMatch = /^domain:(NEXO|SCIENCE|OLYMPUS|ENGINEERING)$/i.exec(rawId);
  if (!domainMatch) return null;
  const rawDomain = domainMatch[1]!.toUpperCase();
  const domain: AtlasTopDomain = rawDomain === 'ENGINEERING' ? 'NEXO' : rawDomain as AtlasTopDomain;
  return ROOT_IDS[domain] || null;
}

function learningEndpointFromDomain(domain: string | undefined): string | null {
  if (!domain) return null;
  const normalized = domain.toUpperCase() === 'ENGINEERING' ? 'NEXO' : domain.toUpperCase();
  if (!ATLAS_TOP_DOMAINS.includes(normalized as AtlasTopDomain)) return null;
  return ROOT_IDS[normalized as AtlasTopDomain];
}

function safeRatio(structure: number, relations: number): number {
  const total = Math.max(1, structure + relations);
  return Math.max(10, Math.min(90, Math.round((structure / total) * 100)));
}

function depthOf(nodeMap: Map<string, AtlasMetroNode>, id: string): number {
  let depth = 0;
  let current = nodeMap.get(id);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = nodeMap.get(current.parentId);
  }
  return depth;
}

function descendantCount(childrenMap: Map<string, string[]>, id: string): number {
  const children = childrenMap.get(id) || [];
  return children.reduce((total, child) => total + 1 + descendantCount(childrenMap, child), 0);
}

export function buildAtlasMetroModel(state: SystemState): AtlasMetroModel {
  const sourceNodes = state.graph.nodes
    .filter(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT')
    .map(node => ({ ...node, domain: atlasTopDomainOf(node) as GraphNode['domain'] }));

  const sourceNodeIds = new Set(sourceNodes.map(node => node.id));
  const nodes: AtlasMetroNode[] = [];
  const sourceToParent = new Map<string, string>();

  for (const domain of ATLAS_TOP_DOMAINS) {
    const domainMembers = sourceNodes.filter(node => atlasTopDomainOf(node) === domain);
    nodes.push({
      id: ROOT_IDS[domain],
      sourceId: null,
      name: ROOT_LABEL[domain],
      domain,
      parentId: null,
      entityType: 'hub',
      status: aggregateStatus(domainMembers),
      summary: `${domainMembers.length} entidades publicadas neste domínio.`,
      depth: 0,
      childCount: 0,
      descendantCount: 0,
      relationCount: 0,
      mix: 50,
      updatedAt: state.generated_at,
      sourceRevision: state.bus.fingerprint,
      fingerprint: state.bus.fingerprint,
      authorityClass: 'DERIVED',
      temporal: state.generated_at ? [{ label: 'projection', at: state.generated_at }] : [],
      synthetic: true,
    });

    const groups = new Map<string, GraphNode[]>();
    for (const member of domainMembers) {
      const key = atlasSubdomainOf(member);
      groups.set(key, [...(groups.get(key) || []), member]);
    }

    const orderedGroups = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    if (orderedGroups.length === 0) {
      const lane = state.lanes.find(candidate => candidate.domain === domain);
      if (lane) {
        const id = atlasSubdomainNodeId(domain, 'Estado operacional');
        const observedAt = lane.freshness?.observed_at || lane.checked_at || state.generated_at;
        nodes.push({
          id,
          sourceId: null,
          name: 'Estado operacional',
          domain,
          parentId: ROOT_IDS[domain],
          entityType: 'subdomain',
          status: String(lane.state || 'SNAPSHOT'),
          summary: [lane.current_state, lane.next_action].filter(Boolean).join(' · '),
          depth: 1,
          childCount: 0,
          descendantCount: 0,
          relationCount: 0,
          mix: 50,
          updatedAt: observedAt,
          sourceRevision: state.bus.fingerprint,
          fingerprint: lane.fingerprint || null,
          authorityClass: 'DERIVED',
          temporal: observedAt ? [{ label: 'projection', at: observedAt }] : [],
          synthetic: true,
        });
      }
    }

    for (const [subdomain, members] of orderedGroups) {
      const id = atlasSubdomainNodeId(domain, subdomain);
      const latest = members
        .map(member => updatedAt(member, state))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) || state.generated_at;

      nodes.push({
        id,
        sourceId: null,
        name: subdomain,
        domain,
        parentId: ROOT_IDS[domain],
        entityType: 'subdomain',
        status: aggregateStatus(members),
        summary: `${members.length} entidades relacionadas neste subdomínio.`,
        depth: 1,
        childCount: 0,
        descendantCount: 0,
        relationCount: 0,
        mix: 50,
        updatedAt: latest,
        sourceRevision: state.bus.fingerprint,
        fingerprint: `${state.bus.fingerprint}:${id}`,
        authorityClass: 'DERIVED',
        temporal: latest ? [{ label: 'projection', at: latest }] : [],
        synthetic: true,
      });

      for (const member of members) {
        sourceToParent.set(member.id, id);
        nodes.push({
          id: member.id,
          sourceId: member.id,
          name: member.label,
          domain,
          parentId: id,
          entityType: member.type,
          status: String(member.state || 'UNKNOWN'),
          summary: entitySummary(member),
          depth: 2,
          childCount: 0,
          descendantCount: 0,
          relationCount: 0,
          mix: 50,
          updatedAt: updatedAt(member, state),
          sourceRevision: member.source_revision || null,
          fingerprint: member.fingerprint || null,
          authorityClass: member.authority_class || null,
          temporal: temporalPoints(member, state),
          synthetic: false,
        });
      }
    }
  }

  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const childrenMap = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const node of nodes) {
    if (node.parentId && childrenMap.has(node.parentId)) childrenMap.get(node.parentId)!.push(node.id);
  }

  for (const children of childrenMap.values()) {
    children.sort((a, b) => (nodeMap.get(a)?.name || a).localeCompare(nodeMap.get(b)?.name || b));
  }

  const crossLinks: AtlasCrossLink[] = [];
  const canonicalEntityEdges: GraphEdge[] = [];
  const renderedLearningRefs = new Set<string>();
  const filamentById = new Map((state.filaments || []).map(filament => [filament.id, filament]));

  for (const edge of state.graph.edges) {
    const source = atlasEndpointFor(edge.from, sourceNodeIds);
    const target = atlasEndpointFor(edge.to, sourceNodeIds);
    if (!source || !target || source === target) continue;

    // Ordinary graph structure only becomes a cross-link when both endpoints are
    // canonical visible entities. Domain-level projection edges are admitted only
    // when the source explicitly marks them as Learning.
    if (!edge.is_learning && !(sourceNodeIds.has(edge.from) && sourceNodeIds.has(edge.to))) continue;
    if (!edge.is_learning) canonicalEntityEdges.push(edge);

    const learningFilament = edge.learning_ref ? filamentById.get(edge.learning_ref) : undefined;
    crossLinks.push({
      id: `entity:${edge.id}`,
      source,
      target,
      label: learningFilament
        ? `Learning · ${learningFilament.label}`
        : edge.explanation || edge.kind,
      kind: edge.kind,
      weight: edge.weight,
      aggregated: false,
      isLearning: edge.is_learning === true,
      learningScope: edge.learning_scope || learningFilament?.scope || null,
      learningRef: edge.learning_ref || null,
      learningKind: learningFilament?.kind || null,
      learningGroup: String((learningFilament as any)?.peer_detection_group || '') || null,
      bundleIndex: 0,
      bundleCount: 1,
    });
    if (edge.is_learning && edge.learning_ref) renderedLearningRefs.add(edge.learning_ref);
  }

  // Filaments are presentation relationships, never stations. When a canonical
  // filament omits entity IDs but carries domain endpoints, anchor it to the
  // corresponding domain hubs instead of creating synthetic Learning nodes.
  for (const filament of state.filaments || []) {
    if (renderedLearningRefs.has(filament.id)) continue;
    const source = atlasEndpointFor(filament.from_id, sourceNodeIds)
      || learningEndpointFromDomain(filament.from_domain);
    const target = atlasEndpointFor(filament.to_id, sourceNodeIds)
      || learningEndpointFromDomain(filament.to_domain);
    if (!source || !target || source === target) continue;

    crossLinks.push({
      id: `filament:${filament.id}`,
      source,
      target,
      label: `Learning · ${filament.label}`,
      kind: 'LEARNING_FILAMENT',
      weight: filament.weight,
      aggregated: false,
      isLearning: true,
      learningScope: filament.scope || null,
      learningRef: filament.id,
      learningKind: filament.kind,
      learningGroup: String((filament as any)?.peer_detection_group || '') || null,
      bundleIndex: 0,
      bundleCount: 1,
    });
  }

  const aggregates = new Map<string, { source: string; target: string; kinds: string[]; weight: number; count: number }>();
  for (const edge of canonicalEntityEdges) {
    const source = sourceToParent.get(edge.from);
    const target = sourceToParent.get(edge.to);
    if (!source || !target || source === target) continue;
    const key = `${source}→${target}`;
    const current = aggregates.get(key) || { source, target, kinds: [], weight: 0, count: 0 };
    current.kinds.push(edge.kind);
    current.weight += edge.weight;
    current.count += 1;
    aggregates.set(key, current);
  }

  for (const [key, aggregate] of aggregates) {
    const kinds = uniquePairs(aggregate.kinds);
    crossLinks.push({
      id: `aggregate:${key}`,
      source: aggregate.source,
      target: aggregate.target,
      label: `${aggregate.count} relações · ${kinds.slice(0, 2).join(' / ')}`,
      kind: kinds.join('+') || 'RELATION',
      weight: aggregate.weight / Math.max(1, aggregate.count),
      aggregated: true,
      isLearning: false,
      learningScope: null,
      learningRef: null,
      learningKind: null,
      learningGroup: null,
      bundleIndex: 0,
      bundleCount: 1,
    });
  }

  const relationCounts = new Map(nodes.map(node => [node.id, 0]));
  for (const link of crossLinks) {
    relationCounts.set(link.source, (relationCounts.get(link.source) || 0) + 1);
    relationCounts.set(link.target, (relationCounts.get(link.target) || 0) + 1);
  }

  for (const node of nodes) {
    const childCount = childrenMap.get(node.id)?.length || 0;
    const descendants = descendantCount(childrenMap, node.id);
    const relations = relationCounts.get(node.id) || 0;
    node.depth = depthOf(nodeMap, node.id);
    node.childCount = childCount;
    node.descendantCount = descendants;
    node.relationCount = relations + childCount + (node.parentId ? 1 : 0);
    node.mix = safeRatio(childCount + (node.parentId ? 1 : 0), relations);
  }

  const learningBundles = new Map<string, AtlasCrossLink[]>();
  for (const link of crossLinks) {
    if (!link.isLearning) continue;
    const pair = [link.source, link.target].sort().join('↔');
    const bucket = learningBundles.get(pair) || [];
    bucket.push(link);
    learningBundles.set(pair, bucket);
  }
  for (const bucket of learningBundles.values()) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
    bucket.forEach((link, index) => {
      link.bundleIndex = index;
      link.bundleCount = bucket.length;
    });
  }

  return {
    revision: state.bus.fingerprint,
    generatedAt: state.generated_at,
    roots: [...ATLAS_METRO_ROOTS],
    nodes,
    nodeMap,
    childrenMap,
    crossLinks,
    sourceNodeIds,
  };
}

export function visibleAtlasIds(model: AtlasMetroModel, expanded: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (!model.nodeMap.has(id)) return;
    out.push(id);
    if (expanded.has(id)) {
      for (const child of model.childrenMap.get(id) || []) walk(child);
    }
  };
  model.roots.forEach(walk);
  return out;
}

export function atlasPathTo(model: AtlasMetroModel, id: string): AtlasMetroNode[] {
  const path: AtlasMetroNode[] = [];
  const seen = new Set<string>();
  let current = model.nodeMap.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? model.nodeMap.get(current.parentId) : undefined;
  }
  return path;
}

export function relatedAtlasNodes(model: AtlasMetroModel, id: string): AtlasMetroNode[] {
  const ids = new Set<string>();
  for (const link of model.crossLinks) {
    if (link.source === id) ids.add(link.target);
    if (link.target === id) ids.add(link.source);
  }
  return [...ids].map(candidate => model.nodeMap.get(candidate)).filter((node): node is AtlasMetroNode => Boolean(node));
}
