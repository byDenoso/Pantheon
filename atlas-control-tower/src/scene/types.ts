export type AtlasNode = {
  id: string;
  type?: string;
  label?: string;
  status?: string;
  domain?: string;
  priority?: number;
  [key: string]: unknown;
};

export type AtlasEdge = {
  id?: string;
  source: string;
  target: string;
  type?: string;
  authority?: string;
  [key: string]: unknown;
};

export type AtlasGraph = {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  total?: number;
  visualTotal?: number;
  truncated?: boolean;
  hasMore?: boolean;
  [key: string]: unknown;
};

export type PositionedNode = AtlasNode & {
  position: [number, number, number];
  pickId: number;
};

function hash01(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xFFFFFFFF;
}

export function buildOrbitalNodes(nodes: AtlasNode[], focusId?: string | null): PositionedNode[] {
  const others = nodes.filter(node => node.id !== focusId);
  const count = Math.max(1, others.length);
  let cursor = 0;
  return nodes.map((node, index) => {
    if (node.id === focusId) return {...node, position:[0,0,0], pickId:index + 1};
    const i = cursor++;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - 2 * ((i + 0.5) / count);
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const jitter = (hash01(node.id) - 0.5) * 0.32;
    const angle = i * golden + jitter;
    const type = String(node.type || '').toUpperCase();
    const shell = type === 'SYSTEM' ? 5.6 : type === 'DOMAIN' ? 6.7 : type === 'CAMPAIGN' ? 7.7 : 8.8;
    const depth = 0.72 + hash01(`${node.id}:depth`) * 0.5;
    return {
      ...node,
      position:[Math.cos(angle) * radial * shell, y * shell * 0.72, Math.sin(angle) * radial * shell * depth],
      pickId:index + 1
    };
  });
}
