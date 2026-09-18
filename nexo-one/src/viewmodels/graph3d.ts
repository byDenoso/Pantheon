import type { Domain, GraphEdge, GraphNode, GraphNodeType } from '../contracts/system.ts';

export interface Point3 { x: number; y: number; z: number }
export interface PlacedNode3D extends GraphNode, Point3 { radius: number }

const DOMAIN_ANCHORS: Record<Domain, Point3> = {
  NEXO: { x: 0, y: 0, z: 0 },
  // Keep domain hubs outside the satellite shells so the clusters remain
  // separable after the perspective camera fits the whole graph into view.
  // The wide baselines are intentional: mobile scales this world down only
  // at render time, while desktop keeps the clusters visibly independent.
  SCIENCE: { x: 52, y: 15, z: -18 },
  ENGINEERING: { x: -49, y: -16, z: 38 },
  OLYMPUS: { x: 18, y: -46, z: -61 },
  ARTIFACT: { x: -17, y: 48, z: 59 },
};

const SHELL_RADIUS: Record<GraphNodeType, number> = {
  DOMAIN: 0,
  // Extra-wide nested shells keep satellites readable instead of stacking
  // into one compact ball around each domain hub.
  PROVIDER: 10,
  CAPABILITY: 14,
  ACTION: 18,
  SIDE_QUEST: 20,
  EFFECT: 24,
  PROJECTION: 26,
  CLAIM: 31,
  FILAMENT: 36,
  TEST: 42,
  MEMORY: 48,
};

const NODE_RADIUS: Record<GraphNodeType, number> = {
  DOMAIN: 1.65,
  PROVIDER: 0.72,
  CAPABILITY: 0.62,
  ACTION: 0.5,
  SIDE_QUEST: 0.5,
  EFFECT: 0.46,
  PROJECTION: 0.48,
  CLAIM: 0.42,
  FILAMENT: 0.4,
  TEST: 0.38,
  MEMORY: 0.38,
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rounded(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function domainAnchor(domain: Domain): Point3 {
  return { ...DOMAIN_ANCHORS[domain] };
}

export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function resolveSelection3D(nodes: Array<Pick<GraphNode, 'id'>>, selectedId: string | null): string | null {
  if (!selectedId) return null;
  return nodes.some(node => node.id === selectedId) ? selectedId : null;
}

function localDirection(key: string, index: number, count: number): Point3 {
  const seed = hash32(key);
  const phase = ((seed % 10000) / 10000) * Math.PI * 2;
  const tilt = ((((seed >>> 8) % 1000) / 1000) - 0.5) * 0.38;
  const t = count <= 1 ? 0.5 : (index + 0.5) / count;
  const y = Math.max(-0.82, Math.min(0.82, 1 - 2 * t + tilt));
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = phase + index * GOLDEN_ANGLE;
  return { x: Math.cos(theta) * radial, y, z: Math.sin(theta) * radial };
}

/**
 * Deterministic semantic 3D layout.
 *
 * NEXO is the origin. Other domains are stable orbital hubs. Every non-domain
 * entity is placed on a type-specific shell around its own domain. There is no
 * runtime force simulation, so the same graph remains spatially learnable.
 */
export function layoutGraph3D(nodes: GraphNode[]): PlacedNode3D[] {
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const buckets = new Map<string, GraphNode[]>();

  for (const node of ordered) {
    if (node.type === 'DOMAIN') continue;
    const key = `${node.domain}:${node.type}`;
    const group = buckets.get(key) ?? [];
    group.push(node);
    buckets.set(key, group);
  }

  const placed: PlacedNode3D[] = [];
  const domainCounts = new Map<Domain, number>();
  for (const node of ordered) {
    if (node.type !== 'DOMAIN') continue;
    const occurrence = domainCounts.get(node.domain) ?? 0;
    domainCounts.set(node.domain, occurrence + 1);
    const anchor = domainAnchor(node.domain);
    const offset = occurrence === 0 ? { x: 0, y: 0, z: 0 } : localDirection(`${node.domain}:domain`, occurrence, occurrence + 1);
    placed.push({
      ...node,
      x: rounded(anchor.x + offset.x * occurrence * 1.5),
      y: rounded(anchor.y + offset.y * occurrence * 1.5),
      z: rounded(anchor.z + offset.z * occurrence * 1.5),
      radius: node.domain === 'NEXO' ? 2.25 : NODE_RADIUS.DOMAIN,
    });
  }

  for (const [key, group] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((node, index) => {
      const anchor = domainAnchor(node.domain);
      const direction = localDirection(key, index, sorted.length);
      const shell = SHELL_RADIUS[node.type];
      const jitter = ((hash32(node.id) % 1000) / 1000 - 0.5) * 0.55;
      const radiusFromHub = shell + jitter;
      placed.push({
        ...node,
        x: rounded(anchor.x + direction.x * radiusFromHub),
        y: rounded(anchor.y + direction.y * radiusFromHub),
        z: rounded(anchor.z + direction.z * radiusFromHub),
        radius: NODE_RADIUS[node.type],
      });
    });
  }

  return placed.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Deterministic 3D force relaxation for the WebGL renderer.
 *
 * The graph remains backend-shaped: only canonical nodes and edges participate.
 * Domain hubs are pinned, satellites repel one another, and canonical relations
 * act as springs. No cross-cluster relation is synthesized here.
 */
export function forceLayoutGraph3D(nodes: GraphNode[], edges: GraphEdge[], iterations = 180): PlacedNode3D[] {
  const placed = layoutGraph3D(nodes).map(node => ({ ...node, x: node.x * 1.04, y: node.y * 1.04, z: node.z * 1.04 }));
  const byId = new Map(placed.map(node => [node.id, node]));
  const velocity = new Map(placed.map(node => [node.id, { x: 0, y: 0, z: 0 }]));
  const domainIds = new Set(placed.filter(node => node.type === 'DOMAIN').map(node => node.id));
  const clampStep = (value: number): number => Math.max(-0.65, Math.min(0.65, value));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const force = new Map(placed.map(node => [node.id, { x: 0, y: 0, z: 0 }]));
    for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
      const left = placed[leftIndex];
      if (domainIds.has(left.id)) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
        const right = placed[rightIndex];
        if (domainIds.has(right.id)) continue;
        const dx = left.x - right.x, dy = left.y - right.y, dz = left.z - right.z;
        const distance = Math.max(1.5, Math.hypot(dx, dy, dz));
        const repulsion = 0.75 / (distance * distance);
        const fx = (dx / distance) * repulsion, fy = (dy / distance) * repulsion, fz = (dz / distance) * repulsion;
        const leftForce = force.get(left.id)!; const rightForce = force.get(right.id)!;
        leftForce.x += fx; leftForce.y += fy; leftForce.z += fz;
        rightForce.x -= fx; rightForce.y -= fy; rightForce.z -= fz;
      }
    }
    for (const edge of edges) {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to || from.id === to.id) continue;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const distance = Math.max(1.5, Math.hypot(dx, dy, dz));
      const target = edge.is_learning ? 18 : 13 + Math.min(8, Number(edge.weight ?? 0) * 5);
      const spring = (distance - target) * (edge.is_learning ? 0.0048 : 0.0025);
      const fx = (dx / distance) * spring, fy = (dy / distance) * spring, fz = (dz / distance) * spring;
      const fromForce = force.get(from.id); const toForce = force.get(to.id);
      if (fromForce && !domainIds.has(from.id)) { fromForce.x += fx; fromForce.y += fy; fromForce.z += fz; }
      if (toForce && !domainIds.has(to.id)) { toForce.x -= fx; toForce.y -= fy; toForce.z -= fz; }
    }
    for (const node of placed) {
      if (domainIds.has(node.id)) { const anchor = domainAnchor(node.domain); node.x = anchor.x; node.y = anchor.y; node.z = anchor.z; continue; }
      const anchor = domainAnchor(node.domain), nodeForce = force.get(node.id)!;
      nodeForce.x += (anchor.x - node.x) * 0.0014;
      nodeForce.y += (anchor.y - node.y) * 0.0014;
      nodeForce.z += (anchor.z - node.z) * 0.0014;
      const nodeVelocity = velocity.get(node.id)!;
      nodeVelocity.x = (nodeVelocity.x + nodeForce.x) * 0.86;
      nodeVelocity.y = (nodeVelocity.y + nodeForce.y) * 0.86;
      nodeVelocity.z = (nodeVelocity.z + nodeForce.z) * 0.86;
      node.x += clampStep(nodeVelocity.x); node.y += clampStep(nodeVelocity.y); node.z += clampStep(nodeVelocity.z);
    }
  }
  // The springs preserve canonical relations, then this final radial opening
  // gives every cluster breathing room without inventing nodes or edges.
  const spacingScale = 1.34;
  return placed.map(node => {
    if (domainIds.has(node.id)) return { ...node, x: rounded(node.x), y: rounded(node.y), z: rounded(node.z) };
    const anchor = domainAnchor(node.domain);
    return {
      ...node,
      x: rounded(anchor.x + (node.x - anchor.x) * spacingScale),
      y: rounded(anchor.y + (node.y - anchor.y) * spacingScale),
      z: rounded(anchor.z + (node.z - anchor.z) * spacingScale),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function graphBounds3D(nodes: PlacedNode3D[]): { center: Point3; radius: number } {
  if (!nodes.length) return { center: { x: 0, y: 0, z: 0 }, radius: 20 };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const node of nodes) {
    min.x = Math.min(min.x, node.x); min.y = Math.min(min.y, node.y); min.z = Math.min(min.z, node.z);
    max.x = Math.max(max.x, node.x); max.y = Math.max(max.y, node.y); max.z = Math.max(max.z, node.z);
  }
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const radius = Math.max(12, ...nodes.map(node => distance3(node, center) + node.radius));
  return { center, radius };
}
