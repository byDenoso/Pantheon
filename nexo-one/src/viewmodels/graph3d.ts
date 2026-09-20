import type { Domain, GraphEdge, GraphNode, GraphNodeType } from '../contracts/system.ts';

export interface Point3 { x: number; y: number; z: number }
export interface PlacedNode3D extends GraphNode, Point3 { radius: number }

export const PRIMARY_GALAXY_DOMAINS = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'] as const;
export type PrimaryGalaxyDomain = (typeof PRIMARY_GALAXY_DOMAINS)[number];

const ARM_PHASE: Record<PrimaryGalaxyDomain, number> = {
  SCIENCE: -0.52,
  ENGINEERING: 1.57,
  OLYMPUS: 3.66,
};

const ARM_Z_PHASE: Record<PrimaryGalaxyDomain, number> = {
  SCIENCE: 0.2,
  ENGINEERING: 2.15,
  OLYMPUS: 4.1,
};

const TYPE_PROGRESS: Record<GraphNodeType, number> = {
  DOMAIN: 0,
  PROVIDER: 0.1,
  CAPABILITY: 0.18,
  ACTION: 0.28,
  EFFECT: 0.38,
  PROJECTION: 0.48,
  CLAIM: 0.58,
  FILAMENT: 0.66,
  TEST: 0.76,
  MEMORY: 0.86,
  SIDE_QUEST: 0.94,
};

const NODE_RADIUS: Record<GraphNodeType, number> = {
  DOMAIN: 1.72,
  PROVIDER: 0.72,
  CAPABILITY: 0.64,
  ACTION: 0.52,
  SIDE_QUEST: 0.5,
  EFFECT: 0.48,
  PROJECTION: 0.5,
  CLAIM: 0.45,
  FILAMENT: 0.42,
  TEST: 0.4,
  MEMORY: 0.4,
};

const SECONDARY_DOMAIN_ANCHOR: Partial<Record<Domain, Point3>> = {
  ARTIFACT: { x: -9, y: 18, z: 13 },
};

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash32(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: number, shift = 0): number {
  return (((seed >>> shift) % 10000) / 10000);
}

function rounded(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function primaryDomain(domain: Domain): PrimaryGalaxyDomain | null {
  return (PRIMARY_GALAXY_DOMAINS as readonly string[]).includes(domain)
    ? domain as PrimaryGalaxyDomain
    : null;
}

function clusterSemanticType(node: GraphNode): GraphNodeType {
  const match = /^atlas\.cluster\.[^.]+\.([^.]+)$/.exec(node.id);
  const candidate = match?.[1]?.toUpperCase() as GraphNodeType | undefined;
  return candidate && candidate in TYPE_PROGRESS ? candidate : node.type;
}

/**
 * A stable point on one of NEXO ONE's three irregular spiral arms.
 *
 * t=0 is near the luminous bar/core and t=1 is the outer experimental edge.
 * The formula is deterministic and intentionally imperfect: a galaxy should
 * look spatially learnable, not like somebody drew three SVG spirals with a ruler.
 */
export function galaxyArmPoint(domain: PrimaryGalaxyDomain, t: number): Point3 {
  const clamped = Math.max(0, Math.min(1, t));
  const phase = ARM_PHASE[domain];
  const zPhase = ARM_Z_PHASE[domain];
  const radial = 24 + 112 * clamped;
  const irregularity = Math.sin(clamped * Math.PI * 5 + zPhase) * 0.055;
  const angle = phase + 0.1 + clamped * 1.42 + irregularity;
  const flatten = 0.76 + Math.sin(clamped * Math.PI * 2 + zPhase) * 0.035;
  return {
    x: rounded(Math.cos(angle) * radial * 1.06),
    y: rounded(Math.sin(angle) * radial * flatten),
    z: rounded(
      Math.sin(angle * 1.33 + zPhase) * (7 + clamped * 9)
      + Math.sin(clamped * Math.PI * 4 + zPhase) * 3.5,
    ),
  };
}

export function galaxyArmPath(domain: PrimaryGalaxyDomain, samples = 56): Point3[] {
  const count = Math.max(8, Math.min(160, Math.floor(samples)));
  return Array.from({ length: count }, (_, index) =>
    galaxyArmPoint(domain, index / Math.max(1, count - 1)));
}

export function domainAnchor(domain: Domain): Point3 {
  if (domain === 'NEXO') return { x: 0, y: 0, z: 0 };
  const primary = primaryDomain(domain);
  if (primary) return galaxyArmPoint(primary, 0.105);
  return { ...(SECONDARY_DOMAIN_ANCHOR[domain] ?? { x: 0, y: 0, z: 0 }) };
}


const MACRO_DOMAIN_ANCHOR: Partial<Record<Domain, Point3>> = {
  NEXO: { x: 0, y: 0, z: 0 },
  SCIENCE: { x: -96, y: -4, z: -8 },
  ENGINEERING: { x: 0, y: 76, z: 8 },
  OLYMPUS: { x: 96, y: -2, z: -6 },
  ARTIFACT: { x: 0, y: -78, z: 5 },
};

export function macroDomainAnchor(domain: Domain): Point3 {
  return { ...(MACRO_DOMAIN_ANCHOR[domain] ?? domainAnchor(domain)) };
}

export function layoutMacroDomains(nodes: GraphNode[]): PlacedNode3D[] {
  const occurrences = new Map<Domain, number>();
  return [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(node => {
      const anchor = macroDomainAnchor(node.domain);
      const occurrence = occurrences.get(node.domain) ?? 0;
      occurrences.set(node.domain, occurrence + 1);
      const offset = occurrence * 3;
      return {
        ...node,
        x: rounded(anchor.x + offset),
        y: rounded(anchor.y - offset * 0.25),
        z: rounded(anchor.z + offset * 0.2),
        radius: node.domain === 'NEXO' ? 3.2 : 2.2,
      };
    });
}

export function distance3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function resolveSelection3D(nodes: Array<Pick<GraphNode, 'id'>>, selectedId: string | null): string | null {
  if (!selectedId) return null;
  return nodes.some(node => node.id === selectedId) ? selectedId : null;
}

function localOffset(node: GraphNode, index: number, count: number, tangentAngle: number, spread: number): Point3 {
  const seed = hash32(node.id);
  const centeredIndex = count <= 1 ? 0 : (index / (count - 1)) - 0.5;
  const lane = (unit(seed, 4) - 0.5) * spread + centeredIndex * Math.min(spread * 0.34, 6);
  const depth = (unit(seed, 12) - 0.5) * spread * 0.8;
  const along = (unit(seed, 20) - 0.5) * spread * 0.5;
  const normalAngle = tangentAngle + Math.PI / 2;
  return {
    x: Math.cos(normalAngle) * lane + Math.cos(tangentAngle) * along,
    y: Math.sin(normalAngle) * lane * 0.78 + Math.sin(tangentAngle) * along * 0.78,
    z: depth,
  };
}

function armTangent(domain: PrimaryGalaxyDomain, t: number): number {
  const a = galaxyArmPoint(domain, Math.max(0, t - 0.008));
  const b = galaxyArmPoint(domain, Math.min(1, t + 0.008));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function layoutPrimaryDomainNodes(domain: PrimaryGalaxyDomain, nodes: GraphNode[]): PlacedNode3D[] {
  const byType = new Map<GraphNodeType, GraphNode[]>();
  for (const node of nodes) {
    const semanticType = clusterSemanticType(node);
    const group = byType.get(semanticType) ?? [];
    group.push(node);
    byType.set(semanticType, group);
  }

  const placed: PlacedNode3D[] = [];
  for (const [semanticType, group] of [...byType.entries()].sort((a, b) =>
    TYPE_PROGRESS[a[0]] - TYPE_PROGRESS[b[0]] || a[0].localeCompare(b[0]))) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const base = TYPE_PROGRESS[semanticType];
    sorted.forEach((node, index) => {
      const seed = hash32(node.id);
      const within = sorted.length <= 1 ? 0.5 : (index + 0.5) / sorted.length;
      const typeBand = 0.07;
      const t = Math.max(
        0.13,
        Math.min(0.985, 0.12 + base * 0.78 + (within - 0.5) * typeBand + (unit(seed) - 0.5) * 0.025),
      );
      const spine = galaxyArmPoint(domain, t);
      const tangent = armTangent(domain, t);
      const spread = 5.5 + t * 15;
      const offset = localOffset(node, index, sorted.length, tangent, spread);
      placed.push({
        ...node,
        x: rounded(spine.x + offset.x),
        y: rounded(spine.y + offset.y),
        z: rounded(spine.z + offset.z),
        radius: NODE_RADIUS[node.type],
      });
    });
  }
  return placed;
}

function layoutSecondaryDomainNodes(domain: Domain, nodes: GraphNode[]): PlacedNode3D[] {
  const anchor = domainAnchor(domain);
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((node, index) => {
    const seed = hash32(node.id);
    const theta = unit(seed) * TAU + index * GOLDEN_ANGLE;
    const ring = 8 + TYPE_PROGRESS[clusterSemanticType(node)] * 22 + (unit(seed, 10) - 0.5) * 4;
    return {
      ...node,
      x: rounded(anchor.x + Math.cos(theta) * ring),
      y: rounded(anchor.y + Math.sin(theta) * ring * 0.7),
      z: rounded(anchor.z + (unit(seed, 18) - 0.5) * 12),
      radius: NODE_RADIUS[node.type],
    };
  });
}

/**
 * Deterministic NEXO ONE galaxy layout.
 *
 * NEXO is fixed at the origin. SCIENCE, ENGINEERING and OLYMPUS own three
 * persistent irregular spiral sectors. Domain hubs stay near the core while
 * derived/local entities spread outward according to semantic type. No force
 * simulation runs at render time, which keeps 500-2000 entity views stable.
 */
export function layoutGalaxy3D(nodes: GraphNode[]): PlacedNode3D[] {
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const placed: PlacedNode3D[] = [];
  const buckets = new Map<Domain, GraphNode[]>();
  const domainOccurrences = new Map<Domain, number>();

  for (const node of ordered) {
    if (node.type === 'DOMAIN') {
      const occurrence = domainOccurrences.get(node.domain) ?? 0;
      domainOccurrences.set(node.domain, occurrence + 1);
      const anchor = domainAnchor(node.domain);
      const offset = occurrence === 0 ? 0 : occurrence * 2.4;
      placed.push({
        ...node,
        x: rounded(anchor.x + offset),
        y: rounded(anchor.y - offset * 0.35),
        z: rounded(anchor.z + offset * 0.22),
        radius: node.domain === 'NEXO' ? 2.7 : NODE_RADIUS.DOMAIN,
      });
      continue;
    }
    const group = buckets.get(node.domain) ?? [];
    group.push(node);
    buckets.set(node.domain, group);
  }

  for (const [domain, group] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const primary = primaryDomain(domain);
    placed.push(...(primary
      ? layoutPrimaryDomainNodes(primary, group)
      : layoutSecondaryDomainNodes(domain, group)));
  }

  return placed.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Compatibility alias for callers that previously requested a force layout.
 * The old O(n² × iterations) relaxation was a performance liability and made
 * spatial memory drift. Stage 2 deliberately routes it to the deterministic
 * galaxy layout while preserving the public function until downstream cleanup.
 */
export function forceLayoutGraph3D(nodes: GraphNode[], _edges: GraphEdge[], _iterations = 180): PlacedNode3D[] {
  return layoutGalaxy3D(nodes);
}

function fieldDomainNodes(domain: Domain, nodes: GraphNode[], anchor: Point3): PlacedNode3D[] {
  const byType = new Map<GraphNodeType, GraphNode[]>();
  for (const node of nodes) { const semanticType = clusterSemanticType(node); const group = byType.get(semanticType) ?? []; group.push(node); byType.set(semanticType, group); }
  const placed: PlacedNode3D[] = [];
  const orderedTypes = [...byType.entries()].sort((a, b) => TYPE_PROGRESS[a[0]] - TYPE_PROGRESS[b[0]] || a[0].localeCompare(b[0]));
  orderedTypes.forEach(([semanticType, group], bandIndex) => {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const baseRing = 18 + bandIndex * 11 + TYPE_PROGRESS[semanticType] * 12;
    sorted.forEach((node, index) => {
      const seed = hash32(node.id);
      const theta = (index / Math.max(1, sorted.length)) * TAU + unit(seed) * 0.72 + bandIndex * 0.42;
      const radial = baseRing + (unit(seed, 10) - 0.5) * 7;
      const lift = (unit(seed, 18) - 0.5) * 11;
      placed.push({ ...node, x: rounded(anchor.x + Math.cos(theta) * radial), y: rounded(anchor.y + Math.sin(theta) * radial * 0.68), z: rounded(anchor.z + lift), radius: NODE_RADIUS[node.type] });
    });
  });
  return placed;
}

export function layoutField3D(nodes: GraphNode[]): PlacedNode3D[] {
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const domains = [...new Set(ordered.map(node => node.domain))];
  const singleDomain = domains.length === 1;
  const placed: PlacedNode3D[] = [];
  const buckets = new Map<Domain, GraphNode[]>();
  const domainOccurrences = new Map<Domain, number>();
  for (const node of ordered) {
    const anchor = singleDomain ? { x: 0, y: 0, z: 0 } : macroDomainAnchor(node.domain);
    if (node.type === 'DOMAIN') {
      const occurrence = domainOccurrences.get(node.domain) ?? 0; domainOccurrences.set(node.domain, occurrence + 1);
      const offset = occurrence * 2.5;
      placed.push({ ...node, x: rounded(anchor.x + offset), y: rounded(anchor.y - offset * 0.25), z: rounded(anchor.z + offset * 0.18), radius: node.domain === 'NEXO' ? 3.2 : 2.35 });
      continue;
    }
    const group = buckets.get(node.domain) ?? []; group.push(node); buckets.set(node.domain, group);
  }
  for (const [domain, group] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const anchor = singleDomain ? { x: 0, y: 0, z: 0 } : macroDomainAnchor(domain);
    placed.push(...fieldDomainNodes(domain, group, anchor));
  }
  return placed.sort((a, b) => a.id.localeCompare(b.id));
}

export function layoutGraph3D(nodes: GraphNode[]): PlacedNode3D[] {
  return layoutField3D(nodes);
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
