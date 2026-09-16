import type { Domain, GraphNode, GraphNodeType } from '../contracts/system.ts';

export interface Point3 { x: number; y: number; z: number }
export interface PlacedNode3D extends GraphNode, Point3 { radius: number }

const DOMAIN_ANCHORS: Record<Domain, Point3> = {
  NEXO: { x: 0, y: 0, z: 0 },
  SCIENCE: { x: 18, y: 4, z: -5 },
  ENGINEERING: { x: -14, y: -5, z: 12 },
  OLYMPUS: { x: 4, y: -12, z: -17 },
  ARTIFACT: { x: -4, y: 12, z: 17 },
};

const SHELL_RADIUS: Record<GraphNodeType, number> = {
  DOMAIN: 0,
  PROVIDER: 4.2,
  CAPABILITY: 5.1,
  ACTION: 6.8,
  SIDE_QUEST: 7.2,
  EFFECT: 8.2,
  PROJECTION: 8.6,
  CLAIM: 9.8,
  FILAMENT: 10.4,
  TEST: 11.8,
  MEMORY: 12.4,
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
