import type { Domain, GraphEdge, GraphNode, GraphNodeType } from '../contracts/system.ts';

export type LayeredLayerId = 'DOMAIN' | 'ENTITY' | 'CAPABILITY' | 'WORK' | 'INSIGHT';

export interface LayeredLayerDefinition {
  id: LayeredLayerId;
  index: number;
  title: string;
  subtitle: string;
  z: number;
}

export interface LayeredNode extends GraphNode {
  layer: LayeredLayerId;
  x: number;
  y: number;
  z: number;
  size: number;
  lane: number;
  rank: number;
}

export interface LayeredEdge extends GraphEdge {
  fromLayer: LayeredLayerId;
  toLayer: LayeredLayerId;
  crossLayer: boolean;
}

export interface LayeredGraph {
  nodes: LayeredNode[];
  edges: LayeredEdge[];
  layers: LayeredLayerDefinition[];
}

export const LAYERED_LAYERS: LayeredLayerDefinition[] = [
  { id: 'DOMAIN', index: 0, title: 'Domínios', subtitle: 'Áreas de conhecimento · fronteiras', z: 0 },
  { id: 'ENTITY', index: 1, title: 'Entidades', subtitle: 'Contexto · fontes · conhecimento', z: 1 },
  { id: 'CAPABILITY', index: 2, title: 'Capacidades', subtitle: 'Habilidades · sistemas · recursos', z: 2 },
  { id: 'WORK', index: 3, title: 'Ações / Testes', subtitle: 'Execução · experimentos · validação', z: 3 },
  { id: 'INSIGHT', index: 4, title: 'Resultados / Insights', subtitle: 'Impacto · aprendizado · evolução', z: 4 },
];

export const LAYER_BY_NODE_TYPE: Record<GraphNodeType, LayeredLayerId> = {
  DOMAIN: 'DOMAIN',
  CAMPAIGN: 'ENTITY',
  PROVIDER: 'ENTITY',
  PROJECTION: 'ENTITY',
  MEMORY: 'ENTITY',
  CAPABILITY: 'CAPABILITY',
  ACTION: 'WORK',
  TEST: 'WORK',
  SIDE_QUEST: 'WORK',
  EFFECT: 'INSIGHT',
  CLAIM: 'INSIGHT',
  FILAMENT: 'INSIGHT',
};

const DOMAIN_ORDER: Domain[] = ['SCIENCE', 'ENGINEERING', 'OLYMPUS', 'NEXO', 'ARTIFACT'];

const SIZE_BY_TYPE: Record<GraphNodeType, number> = {
  DOMAIN: 13,
  CAMPAIGN: 8,
  PROVIDER: 6.5,
  PROJECTION: 6,
  MEMORY: 5.5,
  CAPABILITY: 8.5,
  ACTION: 7,
  TEST: 7.5,
  SIDE_QUEST: 6,
  EFFECT: 8,
  CLAIM: 8,
  FILAMENT: 6.5,
};

const importanceOf = (node: GraphNode): number => {
  if (node.type === 'DOMAIN') return 100;
  if (node.human_gate) return 90;
  if (node.type === 'CLAIM' || node.type === 'EFFECT') return 80;
  if (node.type === 'TEST' || node.type === 'CAPABILITY') return 70;
  if (node.type === 'ACTION') return 65;
  if (node.type === 'CAMPAIGN') return 60;
  return 40;
};

function hexOffset(index: number, spacingX = 22, spacingY = 14): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  const ring = Math.floor((Math.sqrt(12 * index - 3) + 3) / 6);
  const start = 3 * ring * (ring - 1) + 1;
  const offset = index - start;
  const side = Math.floor(offset / ring);
  const step = offset % ring;
  const dirs = [
    [1, 0], [0.5, 1], [-0.5, 1], [-1, 0], [-0.5, -1], [0.5, -1],
  ] as const;
  let q = -ring;
  let r = 0;
  for (let s = 0; s < side; s += 1) {
    q += dirs[s]![0] * ring;
    r += dirs[s]![1] * ring;
  }
  q += dirs[side]![0] * step;
  r += dirs[side]![1] * step;
  return { x: q * spacingX, y: r * spacingY };
}

function domainLane(domain: Domain, domains: Domain[]): number {
  const index = Math.max(0, domains.indexOf(domain));
  if (domains.length <= 1) return 0;
  return (index - (domains.length - 1) / 2) * 112;
}

export function layoutLayeredGraph(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
): LayeredGraph {
  const presentDomains = DOMAIN_ORDER.filter(domain => graph.nodes.some(node => node.domain === domain));
  const domains = presentDomains.length ? presentDomains : DOMAIN_ORDER.slice(0, 4);
  const buckets = new Map<string, GraphNode[]>();

  for (const node of graph.nodes) {
    const layer = LAYER_BY_NODE_TYPE[node.type];
    const key = `${layer}:${node.domain}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(node);
    buckets.set(key, bucket);
  }

  const placed: LayeredNode[] = [];
  for (const layer of LAYERED_LAYERS) {
    for (const domain of domains) {
      const group = [...(buckets.get(`${layer.id}:${domain}`) ?? [])]
        .sort((a, b) => importanceOf(b) - importanceOf(a) || a.id.localeCompare(b.id));
      const lane = domainLane(domain, domains);
      group.forEach((node, index) => {
        const offset = hexOffset(index, layer.id === 'DOMAIN' ? 18 : 19, 12);
        placed.push({
          ...node,
          layer: layer.id,
          x: lane + offset.x,
          y: offset.y,
          z: layer.z,
          size: SIZE_BY_TYPE[node.type],
          lane: domains.indexOf(domain),
          rank: index,
        });
      });
    }
  }

  const byId = new Map(placed.map(node => [node.id, node]));
  const edges: LayeredEdge[] = graph.edges.flatMap(edge => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    return [{
      ...edge,
      fromLayer: from.layer,
      toLayer: to.layer,
      crossLayer: from.layer !== to.layer,
    }];
  });

  return {
    nodes: placed.sort((a, b) =>
      a.z - b.z || a.lane - b.lane || a.rank - b.rank || a.id.localeCompare(b.id)),
    edges,
    layers: LAYERED_LAYERS,
  };
}

export function resolveLayerSelection(
  nodes: Array<Pick<LayeredNode, 'id'>>,
  selectedId: string | null,
): string | null {
  if (!selectedId) return null;
  return nodes.some(node => node.id === selectedId) ? selectedId : null;
}

export function neighborhoodOf(
  graph: Pick<LayeredGraph, 'nodes' | 'edges'>,
  selectedId: string | null,
): Set<string> {
  const ids = new Set<string>();
  if (!selectedId) return ids;
  ids.add(selectedId);
  for (const edge of graph.edges) {
    if (edge.from === selectedId) ids.add(edge.to);
    if (edge.to === selectedId) ids.add(edge.from);
  }
  return ids;
}
