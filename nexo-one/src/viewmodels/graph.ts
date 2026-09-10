// View model do Atlas: filtros semânticos, vizinhança e layout determinístico.
// O layout não usa simulação física: a mesma entrada produz sempre o mesmo desenho,
// o que torna o grafo testável e estável entre leituras.
import type {
  AuthorityClass, Domain, EntityState, FreshnessState, GraphEdge, GraphNode, GraphNodeType,
  RelationKind, Runtime, Severity,
} from '../contracts/system.ts';
import { DOMAINS } from '../contracts/system.ts';

export interface GraphFilters {
  domains: Domain[];
  types: GraphNodeType[];
  states: EntityState[];
  severities: Severity[];
  freshness: FreshnessState[];
  authorities: AuthorityClass[];
  capabilities: string[];
  runtimes: Runtime[];
  relations: RelationKind[];
  search: string;
}

export const EMPTY_FILTERS: GraphFilters = {
  domains: [], types: [], states: [], severities: [], freshness: [],
  authorities: [], capabilities: [], runtimes: [], relations: [], search: '',
};

export const filterCount = (filters: GraphFilters): number =>
  filters.domains.length + filters.types.length + filters.states.length + filters.severities.length
  + filters.freshness.length + filters.authorities.length + filters.capabilities.length
  + filters.runtimes.length + filters.relations.length + (filters.search.trim() ? 1 : 0);

const matches = <T>(selected: T[], value: T | undefined): boolean =>
  selected.length === 0 || (value !== undefined && selected.includes(value));

export function filterGraph(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  filters: GraphFilters,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const search = filters.search.trim().toLocaleLowerCase();
  const nodes = graph.nodes.filter(node =>
    matches(filters.domains, node.domain)
    && matches(filters.types, node.type)
    && matches(filters.states, node.state)
    && matches(filters.severities, node.severity)
    && matches(filters.freshness, node.freshness.state)
    && matches(filters.authorities, node.authority_class)
    && matches(filters.capabilities, node.capability_id)
    && matches(filters.runtimes, node.runtime)
    && (!search || `${node.label} ${node.summary} ${node.id}`.toLocaleLowerCase().includes(search)));
  const ids = new Set(nodes.map(n => n.id));
  const edges = graph.edges.filter(edge =>
    ids.has(edge.from) && ids.has(edge.to) && matches(filters.relations, edge.kind));
  return { nodes, edges };
}

export interface Relation {
  edge: GraphEdge;
  node: GraphNode;
  direction: 'upstream' | 'downstream';
}

/** Upstream = aponta para este nó. Downstream = parte deste nó. */
export function relationsOf(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  nodeId: string,
): { upstream: Relation[]; downstream: Relation[] } {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const upstream: Relation[] = [];
  const downstream: Relation[] = [];
  for (const edge of graph.edges) {
    if (edge.to === nodeId) {
      const node = byId.get(edge.from);
      if (node) upstream.push({ edge, node, direction: 'upstream' });
    } else if (edge.from === nodeId) {
      const node = byId.get(edge.to);
      if (node) downstream.push({ edge, node, direction: 'downstream' });
    }
  }
  return { upstream, downstream };
}

export interface PlacedNode extends GraphNode { x: number; y: number; radius: number }

/** Anel por tipo: domínios no centro, providers e capabilities em volta, evidência na borda. */
const RING: Record<GraphNodeType, number> = {
  DOMAIN: 0, PROVIDER: 1, CAPABILITY: 2, ACTION: 3, SIDE_QUEST: 3,
  EFFECT: 4, PROJECTION: 4, CLAIM: 5, FILAMENT: 5, TEST: 6, MEMORY: 6,
};

const RADIUS: Record<number, number> = { 0: 0, 1: 130, 2: 225, 3: 320, 4: 405, 5: 480, 6: 545 };

export const VIEWBOX = 1240;

/**
 * Layout radial determinístico: o setor angular vem do domínio, o anel vem do tipo
 * e a posição dentro do setor vem da ordem estável do id.
 */
export function layoutGraph(nodes: GraphNode[]): PlacedNode[] {
  const center = VIEWBOX / 2;
  // O setor vem dos domínios PRESENTES, não dos quatro fixos: ao filtrar por um
  // domínio o mapa se redistribui em vez de ficar espremido num arco.
  const present = DOMAINS.filter(domain => nodes.some(node => node.domain === domain));
  const domains = present.length ? present : DOMAINS;
  const sector = (Math.PI * 2) / domains.length;
  const buckets = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = `${node.domain}:${RING[node.type]}`;
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }
  const placed: PlacedNode[] = [];
  for (const [key, group] of buckets) {
    const [domain, ringValue] = key.split(':');
    const ring = Number(ringValue);
    const domainIndex = domains.indexOf(domain as Domain);
    const radius = RADIUS[ring];
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    ordered.forEach((node, index) => {
      if (ring === 0) {
        const angle = domainIndex * sector - Math.PI / 2;
        placed.push({ ...node, x: center + Math.cos(angle) * 70, y: center + Math.sin(angle) * 70, radius: 26 });
        return;
      }
      // Espalha o grupo dentro do setor do domínio, com margem para não colar nas bordas.
      const span = domains.length === 1 ? Math.PI * 1.7 : sector * 0.82;
      const step = ordered.length === 1 ? 0.5 : index / (ordered.length - 1);
      const angle = domainIndex * sector - Math.PI / 2 - span / 2 + span * step;
      placed.push({
        ...node,
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
        radius: node.type === 'PROVIDER' ? 17 : node.type === 'CAPABILITY' ? 14 : 12,
      });
    });
  }
  return placed.sort((a, b) => a.id.localeCompare(b.id));
}

export interface GraphLegendEntry { type: GraphNodeType; count: number }

export const legendOf = (nodes: GraphNode[]): GraphLegendEntry[] => {
  const counts = new Map<GraphNodeType, number>();
  for (const node of nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
};
