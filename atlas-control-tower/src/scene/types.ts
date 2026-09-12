export type AtlasNode = {
  id: string;
  type?: string;
  label?: string;
  status?: string | null;
  domain?: string;
  parentId?: string | null;
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

function visualRank(node: AtlasNode) {
  const type = String(node.type || '').toUpperCase();
  if (typeof node.priority === 'number') return node.priority;
  if (type === 'ROOT') return 100;
  if (type === 'SYSTEM') return 92;
  if (type === 'DOMAIN') return 84;
  if (type === 'SUBGRAPH' || type === 'CAMPAIGN') return 72;
  if (type === 'CLAIM' || type === 'TEST') return 58;
  if (type === 'RESULT' || type === 'EVIDENCE') return 46;
  return 30;
}

function compareVisualRank(a: AtlasNode, b: AtlasNode) {
  const delta = visualRank(b) - visualRank(a);
  if (delta) return delta;
  return String(a.label || a.id).localeCompare(String(b.label || b.id));
}

function ringRadius(total: number, base: number, index = 0) {
  const density = Math.max(0, total - 8);
  return base + Math.min(2.35, density * 0.12) + index * 0.62;
}

function orbitalPoint(id: string, index: number, total: number, radius: number, flatten = 0.64): [number, number, number] {
  const safeTotal = Math.max(1, total);
  const phase = hash01(id) * Math.PI * 2;
  const angle = (index / safeTotal) * Math.PI * 2 - Math.PI / 2 + phase * 0.055;
  const shell = Math.floor(index / 14);
  const r = ringRadius(safeTotal, radius, shell);
  const x = Math.cos(angle) * r * 1.36;
  const y = Math.sin(angle) * r * flatten + Math.sin(angle * 2.1 + phase) * 0.26;
  const z = Math.sin(angle * 1.7 + phase) * Math.min(2.15, r * 0.22) + shell * 0.36;
  return [x, y, z];
}

function localClusterPoint(id: string, index: number, total: number, radius: number): [number, number, number] {
  const phase = hash01(id) * Math.PI * 2;
  const angle = (index / Math.max(1, total)) * Math.PI * 2 + phase * 0.09;
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.58,
    Math.sin(angle * 1.3 + phase) * radius * 0.28
  ];
}

export function buildOrbitalNodes(nodes: AtlasNode[], focusId?: string | null): PositionedNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const children = new Map<string, AtlasNode[]>();
  for (const node of nodes) {
    const parentId = typeof node.parentId === 'string' ? node.parentId : null;
    if (!parentId || !byId.has(parentId)) continue;
    const list = children.get(parentId) || [];
    list.push(node);
    children.set(parentId, list);
  }
  for (const list of children.values()) list.sort(compareVisualRank);

  const rootId = focusId && byId.has(focusId) ? focusId : nodes[0]?.id;
  const placed = new Map<string, [number, number, number]>();
  if (rootId) placed.set(rootId, [0, 0, 0]);

  const direct = rootId ? [...(children.get(rootId) || [])].sort(compareVisualRank) : [];
  const directRadius = direct.length > 9 ? 7.2 : 6.35;
  direct.forEach((node, index) => placed.set(node.id, orbitalPoint(node.id, index, direct.length, directRadius)));

  const queue = [...direct];
  const depth = new Map<string, number>(direct.map(node => [node.id, 1]));
  while (queue.length) {
    const parent = queue.shift()!;
    const parentPosition = placed.get(parent.id);
    if (!parentPosition) continue;
    const kids = [...(children.get(parent.id) || [])].sort(compareVisualRank);
    const parentDepth = depth.get(parent.id) || 1;
    const localRadius = Math.max(0.82, 1.56 - parentDepth * 0.18) + Math.min(0.86, Math.sqrt(kids.length) * 0.14);
    kids.forEach((child, index) => {
      if (placed.has(child.id)) return;
      const local = localClusterPoint(child.id, index, kids.length, localRadius);
      placed.set(child.id, [
        parentPosition[0] + local[0],
        parentPosition[1] + local[1],
        parentPosition[2] + local[2] + parentDepth * 0.18
      ]);
      depth.set(child.id, parentDepth + 1);
      queue.push(child);
    });
  }

  const unplaced = nodes.filter(node => !placed.has(node.id)).sort(compareVisualRank);
  unplaced.forEach((node, index) => placed.set(node.id, orbitalPoint(node.id, index, unplaced.length, 7.35, 0.68)));

  return nodes.map((node, index) => ({...node, position: placed.get(node.id) || [0, 0, 0], pickId: index + 1}));
}
