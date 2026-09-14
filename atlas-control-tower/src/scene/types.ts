export type AtlasNode = {
  id: string;
  type?: string;
  label?: string;
  status?: string | null;
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

function hashSigned(value: string) {
  return hash01(value) * 2 - 1;
}

const HIERARCHY_EDGE_TYPES = new Set([
  'CONTAINS', 'PARENT_OF', 'HAS_CHILD', 'TESTS', 'PRODUCES', 'EXECUTED_AS',
  'DERIVED_FROM', 'IMPLEMENTS', 'REPORTS_ON'
]);

function legacyOrbitalPosition(node: AtlasNode, index: number, count: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - 2 * ((index + 0.5) / count);
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const jitter = hashSigned(node.id) * 0.16;
  const angle = index * golden + jitter;
  const type = String(node.type || '').toUpperCase();
  const shell = type === 'SYSTEM' ? 5.6 : type === 'DOMAIN' ? 6.7 : type === 'CAMPAIGN' ? 7.7 : 8.8;
  const depth = 0.72 + hash01(`${node.id}:depth`) * 0.5;
  return [
    Math.cos(angle) * radial * shell,
    y * shell * 0.72,
    Math.sin(angle) * radial * shell * depth
  ];
}

function hierarchyPositions(nodes: AtlasNode[], focusId: string, edges: AtlasEdge[]): Map<string, [number, number, number]> | null {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const parentByChild = new Map<string, string>();

  for (const node of nodes) {
    const explicitParent = typeof node.layoutParent === 'string' ? node.layoutParent : typeof node.parentId === 'string' ? node.parentId : '';
    if (explicitParent && explicitParent !== node.id && byId.has(explicitParent)) parentByChild.set(node.id, explicitParent);
  }

  for (const edge of edges) {
    const type = String(edge.type || '').toUpperCase();
    if (!HIERARCHY_EDGE_TYPES.has(type) || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (edge.target !== focusId && !parentByChild.has(edge.target)) parentByChild.set(edge.target, edge.source);
  }

  const directChildren = nodes
    .filter(node => node.id !== focusId && parentByChild.get(node.id) === focusId)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (directChildren.length === 0) return null;

  const rootFor = (id: string) => {
    let current = id;
    const seen = new Set<string>();
    while (current !== focusId && !seen.has(current)) {
      seen.add(current);
      const parent = parentByChild.get(current);
      if (!parent) return null;
      if (parent === focusId) return current;
      current = parent;
    }
    return current === focusId ? id : null;
  };

  const roots = new Set(directChildren.map(node => node.id));
  const members = new Map<string, AtlasNode[]>();
  for (const child of directChildren) members.set(child.id, []);
  for (const node of nodes) {
    if (node.id === focusId || roots.has(node.id)) continue;
    const root = rootFor(node.id);
    if (root && members.has(root)) members.get(root)!.push(node);
  }

  const positions = new Map<string, [number, number, number]>([[focusId, [0, 0, 0]]]);
  // Give the panorama enough physical volume that perspective can separate
  // sibling systems/domains instead of projecting them into a near-column.
  const ringRadius = directChildren.length === 1 ? 4.7 : directChildren.length < 5 ? 5.35 : 5.8;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = hash01(`${focusId}:phase`) * Math.PI * 2;

  directChildren.forEach((child, index) => {
    const angle = phase + index * golden;
    const center: [number, number, number] = [
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius * 0.66,
      // The graph is an illustrated spatial field, not a flat radial chart. A
      // wider deterministic front/back spread is what makes orbiting visible
      // while keeping the public node budget unchanged.
      hashSigned(`${child.id}:hub-depth`) * 4.2
    ];
    positions.set(child.id, center);
    const cluster = members.get(child.id) || [];
    cluster.forEach((node, memberIndex) => {
      const memberAngle = hash01(`${node.id}:angle`) * Math.PI * 2 + memberIndex * golden;
      const memberRadius = 0.92 + Math.sqrt((memberIndex + 0.5) / Math.max(1, cluster.length)) * 1.65;
      positions.set(node.id, [
        center[0] + Math.cos(memberAngle) * memberRadius,
        center[1] + Math.sin(memberAngle) * memberRadius * 0.72,
        center[2] + hashSigned(`${node.id}:depth`) * (2.4 + memberRadius * 0.85)
      ]);
    });
  });

  return positions;
}

export function buildOrbitalNodes(nodes: AtlasNode[], focusId?: string | null, edges: AtlasEdge[] = []): PositionedNode[] {
  // Resolve to the real node's own id (case-insensitively) before any comparison
  // below. A case-mismatched focusId (e.g. a URL-persisted "domain:d1" against a
  // real "domain:D1" node) previously matched nothing: the focus never centered at
  // the origin, hierarchyPositions() found no direct children, and every node fell
  // back to the generic golden-spiral layout at a much larger radius than the
  // camera framing expects -- confirmed via a real browser repro, not a guess.
  const focalId = focusId
    ? nodes.find(node => node.id === focusId)?.id
      ?? nodes.find(node => node.id.toLowerCase() === focusId.toLowerCase())?.id
      ?? focusId
    : undefined;
  const positions = focalId ? hierarchyPositions(nodes, focalId, edges) : null;
  const others = nodes.filter(node => node.id !== focalId);
  const fallbackCount = Math.max(1, others.length);
  let fallbackIndex = 0;

  if (positions) {
    for (const node of others) {
      if (!positions.has(node.id)) {
        positions.set(node.id, legacyOrbitalPosition(node, fallbackIndex, fallbackCount));
        fallbackIndex += 1;
      }
    }
  }

  return nodes.map((node, index) => {
    const position = node.id === focalId
      ? [0, 0, 0] as [number, number, number]
      : positions?.get(node.id) || legacyOrbitalPosition(node, fallbackIndex++, fallbackCount);
    return {...node, position, pickId:index + 1};
  });
}
