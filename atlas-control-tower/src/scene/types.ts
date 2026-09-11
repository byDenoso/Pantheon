export type AtlasNode = {
  id: string;
  type?: string;
  label?: string;
  status?: string;
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

function orbitalPoint(id: string, index: number, total: number, radius: number): [number, number, number] {
  const shellSize = 12;
  const shell = Math.floor(index / shellSize);
  const localIndex = index % shellSize;
  const localTotal = Math.max(1, Math.min(shellSize, total - shell * shellSize));
  const shellRadius = radius + shell * Math.max(0.42, radius * 0.2);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = hash01(id) * Math.PI * 2;
  const angle = localIndex * golden + phase * 0.14 + shell * 0.31;
  const vertical = localTotal <= 1 ? 0 : ((localIndex / Math.max(1, localTotal - 1)) - 0.5) * 2;
  const y = vertical * Math.min(2.5, shellRadius * 0.38);
  const depth = Math.sin(angle * 1.73 + phase) * Math.min(2.05, shellRadius * 0.34);
  return [Math.cos(angle) * shellRadius, y, Math.sin(angle) * shellRadius * 0.42 + depth * 0.55];
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
  for (const list of children.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const rootId = focusId && byId.has(focusId) ? focusId : nodes[0]?.id;
  const placed = new Map<string, [number, number, number]>();
  if (rootId) placed.set(rootId, [0, 0, 0]);

  const direct = rootId ? (children.get(rootId) || []) : [];
  direct.forEach((node, index) => placed.set(node.id, orbitalPoint(node.id, index, direct.length, 5.45)));

  const queue = [...direct];
  const depth = new Map<string, number>(direct.map(node => [node.id, 1]));
  while (queue.length) {
    const parent = queue.shift()!;
    const parentPosition = placed.get(parent.id);
    if (!parentPosition) continue;
    const kids = children.get(parent.id) || [];
    const parentDepth = depth.get(parent.id) || 1;
    const localRadius = Math.max(0.72, 1.38 - parentDepth * 0.16) + Math.min(0.72, Math.sqrt(kids.length) * 0.12);
    kids.forEach((child, index) => {
      if (placed.has(child.id)) return;
      const local = orbitalPoint(child.id, index, kids.length, localRadius);
      placed.set(child.id, [
        parentPosition[0] + local[0],
        parentPosition[1] + local[1] * 0.72,
        parentPosition[2] + local[2] * 0.84
      ]);
      depth.set(child.id, parentDepth + 1);
      queue.push(child);
    });
  }

  const unplaced = nodes.filter(node => !placed.has(node.id));
  unplaced.forEach((node, index) => placed.set(node.id, orbitalPoint(node.id, index, unplaced.length, 6.9)));

  return nodes.map((node, index) => ({...node, position: placed.get(node.id) || [0, 0, 0], pickId: index + 1}));
}
