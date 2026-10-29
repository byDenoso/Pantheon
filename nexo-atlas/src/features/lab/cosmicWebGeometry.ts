import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import type { ObservatoryLayout, SceneEntity, ScenePosition } from './sceneModel.ts';

export type CosmicQuality = 'high' | 'medium' | 'low';
export type CosmicRelation = 'membership' | 'domain-density';

export interface CosmicConnection {
  id: string;
  sourceKey: string;
  targetKey: string;
  relation: CosmicRelation;
}

export interface CosmicWebGeometry {
  filaments: BufferGeometry;
  particles: BufferGeometry;
  connections: CosmicConnection[];
  particleCount: number;
}

const QUALITY: Record<CosmicQuality, { samples: number; strands: number; lineSteps: number; haloScale: number }> = {
  high: { samples: 224, strands: 3, lineSteps: 34, haloScale: 1 },
  medium: { samples: 176, strands: 2, lineSteps: 25, haloScale: 0.72 },
  low: { samples: 88, strands: 2, lineSteps: 16, haloScale: 0.42 },
};
const CONNECTION_LIMIT = 2_048;
const KNOT_LIMIT = 512;
const DOMAIN_CANDIDATE_LIMIT = 256;
// Low quality is also used on software GPUs. Keep its overdraw bounded while
// retaining the same published connections and all selectable entities.
const PARTICLE_BUDGET: Record<CosmicQuality, number> = { high: 60_000, medium: 42_000, low: 6_000 };

const MEMBERSHIP_COLORS = ['#3979cc', '#578fd9', '#7186d7', '#937cce'].map(hex => new Color(hex));
const DOMAIN_COLORS = ['#356fba', '#4c78ca', '#529bc9', '#7a69bb'].map(hex => new Color(hex));
const HAZE_COLORS = ['#344d9c', '#435daf', '#315a7e', '#7357a3'].map(hex => new Color(hex));
const HUB_COLORS = ['#b9cce0', '#d2c29d'].map(hex => new Color(hex));

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  result ^= result >>> 16;
  return result >>> 0;
}

function unit(seed: string): number {
  return (hash(seed) + 0.5) / 4294967296;
}

function vector(position: ScenePosition): Vector3 {
  return new Vector3(position.x, position.y, position.z);
}

function stableBasis(a: Vector3, b: Vector3): [Vector3, Vector3] {
  const axis = b.clone().sub(a).normalize();
  const reference = Math.abs(axis.z) < 0.82 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const first = axis.clone().cross(reference).normalize();
  const second = axis.clone().cross(first).normalize();
  return [first, second];
}

function sharedDomainConnections(layout: ObservatoryLayout, connectionLimit: number): CosmicConnection[] {
  if (connectionLimit <= 0) return [];
  const groups = new Map<string, SceneEntity[]>();
  const candidates = layout.entities.filter(entity => entity.kind === 'project' || entity.kind === 'region').sort((a, b) => a.key.localeCompare(b.key));
  const boundedCandidates = candidates.length <= DOMAIN_CANDIDATE_LIMIT
    ? candidates
    : Array.from({ length: DOMAIN_CANDIDATE_LIMIT }, (_, index) => candidates[Math.floor(index * (candidates.length - 1) / (DOMAIN_CANDIDATE_LIMIT - 1))]!);
  for (const entity of boundedCandidates) {
    const group = groups.get(entity.domain) || [];
    group.push(entity);
    groups.set(entity.domain, group);
  }

  const connections: CosmicConnection[] = [];
  for (const [domain, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (connections.length >= connectionLimit) break;
    const sorted = entries.slice().sort((a, b) => a.key.localeCompare(b.key));
    // Prevent pathological O(n^3) tree construction for very large domains.
    const nodes = sorted.length <= 96
      ? sorted
      : Array.from({ length: 96 }, (_, index) => sorted[Math.floor(index * (sorted.length - 1) / 95)]!);
    if (nodes.length < 2) continue;

    // The undirected minimum tree is only a static same-domain density scaffold.
    // It is never exposed as a dependency, and carries no arrow or run state.
    const connected = new Set([nodes[0]!.key]);
    while (connected.size < nodes.length) {
      if (connections.length >= connectionLimit) break;
      let best: { from: SceneEntity; to: SceneEntity; distance: number; id: string } | null = null;
      for (const from of nodes) {
        if (!connected.has(from.key)) continue;
        for (const to of nodes) {
          if (connected.has(to.key)) continue;
          const distance = vector(from.position).distanceTo(vector(to.position));
          const pair = [from.key, to.key].sort();
          const id = `domain:${domain}:${pair[0]}~${pair[1]}`;
          if (!best || distance < best.distance - 1e-7 || (Math.abs(distance - best.distance) <= 1e-7 && id < best.id)) {
            best = { from, to, distance, id };
          }
        }
      }
      if (!best) break;
      connected.add(best.to.key);
      connections.push({ id: best.id, sourceKey: best.from.key, targetKey: best.to.key, relation: 'domain-density' });
    }
  }
  return connections;
}

/** Stable signature of only the layout inputs used by this visual density layer. */
export function cosmicWebSignature(layout: ObservatoryLayout): string {
  const positions = layout.entities.map(entity => `${entity.key}:${entity.domain}:${entity.position.x.toFixed(3)},${entity.position.y.toFixed(3)},${entity.position.z.toFixed(3)}`).sort();
  const memberships = layout.memberships.map(link => link.id).sort();
  return positions.join('|') + '//' + memberships.join('|');
}

/**
 * Allocate a fixed particle budget by path length, with a minimum density for
 * every published relation. Longer inter-region filaments therefore receive
 * more samples per path, instead of looking like sparse bridges between knots.
 */
export function allocateConnectionSamples(
  layout: ObservatoryLayout,
  connections: CosmicConnection[],
  quality: CosmicQuality,
): number[] {
  if (!connections.length) return [];
  const budget = Math.floor(PARTICLE_BUDGET[quality] * 0.84);
  const maxPerConnection = QUALITY[quality].samples * QUALITY[quality].strands;
  const minimum = Math.min(10, Math.max(2, Math.floor(budget / connections.length)));
  const allocation = connections.map(() => minimum);
  let remaining = Math.max(0, budget - minimum * connections.length);
  const weights = connections.map(connection => {
    const source = layout.entityByKey.get(connection.sourceKey);
    const target = layout.entityByKey.get(connection.targetKey);
    const span = source && target ? vector(source.position).distanceTo(vector(target.position)) : 0;
    return Math.max(0.25, span) * (connection.relation === 'domain-density' ? 1.35 : 1);
  });
  const active = new Set(connections.map((_, index) => index).filter(index => allocation[index]! < maxPerConnection));
  while (remaining > 0 && active.size > 0) {
    const activeIndices = [...active];
    const totalWeight = activeIndices.reduce((sum, index) => sum + weights[index]!, 0);
    if (totalWeight <= 0) break;
    const roundBudget = remaining;
    const fractions: { index: number; fraction: number; id: string }[] = [];
    let assigned = 0;
    for (const index of activeIndices) {
      const share = roundBudget * weights[index]! / totalWeight;
      const room = maxPerConnection - allocation[index]!;
      const whole = Math.min(room, Math.floor(share));
      allocation[index] = allocation[index]! + whole;
      remaining -= whole;
      assigned += whole;
      fractions.push({ index, fraction: share - Math.floor(share), id: connections[index]!.id });
      if (allocation[index]! >= maxPerConnection) active.delete(index);
    }
    fractions.sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id));
    for (const { index } of fractions) {
      if (remaining <= 0) break;
      if (!active.has(index)) continue;
      allocation[index] = allocation[index]! + 1;
      remaining -= 1;
      assigned += 1;
      if (allocation[index]! >= maxPerConnection) active.delete(index);
    }
    if (assigned === 0) break;
  }
  return allocation;
}

/**
 * Build the static cosmic substrate from published membership and same-domain
 * clustering. These lines are deliberately undirected; dependency arrows are
 * rendered separately from the explicit parent/child records.
 */
export function buildCosmicWebGeometry(layout: ObservatoryLayout, quality: CosmicQuality): CosmicWebGeometry {
  const config = QUALITY[quality];
  const memberships = layout.memberships.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, CONNECTION_LIMIT)
    .map(link => ({ ...link, relation: 'membership' as const }));
  const connections: CosmicConnection[] = [
    ...memberships,
    ...sharedDomainConnections(layout, CONNECTION_LIMIT - memberships.length),
  ];

  const linePositions: number[] = [];
  const lineColors: number[] = [];
  const pointPositions: number[] = [];
  const pointColors: number[] = [];
  const pointAxes: number[] = [];
  const pointSizes: number[] = [];
  const pointAspects: number[] = [];
  const pointOpacities: number[] = [];
  const entityDegree = new Map<string, number>();
  const entityNeighbors = new Map<string, { position: Vector3; distance: number; tie: string }[]>();
  const entityByKey = layout.entityByKey;
  let particleBudget = PARTICLE_BUDGET[quality];
  const sampleAllocation = allocateConnectionSamples(layout, connections, quality);

  const pushParticle = (point: Vector3, color: Color, size: number, opacity: number, axis = new Vector3(0, 1, 0), aspect = 1) => {
    pointPositions.push(point.x, point.y, point.z);
    pointColors.push(color.r, color.g, color.b);
    pointAxes.push(axis.x, axis.y, axis.z);
    pointSizes.push(size);
    pointAspects.push(aspect);
    pointOpacities.push(opacity);
  };

  for (let connectionIndex = 0; connectionIndex < connections.length; connectionIndex += 1) {
    const connection = connections[connectionIndex]!;
    const source = entityByKey.get(connection.sourceKey);
    const target = entityByKey.get(connection.targetKey);
    if (!source || !target) continue;
    entityDegree.set(source.key, (entityDegree.get(source.key) || 0) + 1);
    entityDegree.set(target.key, (entityDegree.get(target.key) || 0) + 1);

    const a = vector(source.position);
    const b = vector(target.position);
    const span = a.distanceTo(b);
    if (span < 0.03) continue;
    const sourceNeighbors = entityNeighbors.get(source.key) || [];
    sourceNeighbors.push({ position: b, distance: span, tie: connection.id });
    entityNeighbors.set(source.key, sourceNeighbors);
    const targetNeighbors = entityNeighbors.get(target.key) || [];
    targetNeighbors.push({ position: a, distance: span, tie: connection.id });
    entityNeighbors.set(target.key, targetNeighbors);
    const [sideA, sideB] = stableBasis(a, b);
    const colorSet = connection.relation === 'membership' ? MEMBERSHIP_COLORS : DOMAIN_COLORS;
    const strandCount = config.strands;
    const bendSign = unit(connection.id + ':bend') > 0.5 ? 1 : -1;
    const phase = unit(connection.id + ':phase') * Math.PI * 2;
    const bend = Math.min(2.1, Math.max(0.22, span * 0.34)) * bendSign;

    const centerAt = (t: number, lane: number) => {
      const u = 1 - t;
      const laneOffset = lane * (connection.relation === 'membership' ? 0.095 : 0.16);
      const c1 = a.clone().lerp(b, 0.31).addScaledVector(sideA, bend + laneOffset).addScaledVector(sideB, bend * 0.23);
      const c2 = a.clone().lerp(b, 0.69).addScaledVector(sideA, bend * 0.54 - laneOffset).addScaledVector(sideB, -bend * 0.32);
      const curve = a.clone().multiplyScalar(u * u * u)
        .addScaledVector(c1, 3 * u * u * t)
        .addScaledVector(c2, 3 * u * t * t)
        .addScaledVector(b, t * t * t);
      const envelope = Math.sin(Math.PI * t);
      const weave = envelope * (Math.sin(t * Math.PI * 2.2 + phase) * 0.3 + Math.sin(t * Math.PI * 5.1 - phase * 0.7) * 0.14) * Math.min(1.55, span * 0.22);
      curve.addScaledVector(sideA, weave);
      curve.addScaledVector(sideB, Math.sin(t * Math.PI * 3.3 + phase * 1.4) * weave * 0.72);
      if (lane !== 0) curve.addScaledVector(sideB, envelope * laneOffset * 0.62);
      return curve;
    };

    const connectionSamples = Math.min(config.samples * config.strands, sampleAllocation[connectionIndex] || 0);
    if (connection.relation === 'domain-density') {
      for (let strand = 0; strand < strandCount; strand += 1) {
        const lane = strand - (strandCount - 1) / 2;
        for (let step = 0; step < config.lineSteps; step += 1) {
          const t0 = step / config.lineSteps;
          const t1 = (step + 1) / config.lineSteps;
          const start = centerAt(t0, lane);
          const end = centerAt(t1, lane);
          linePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
          const colorIndex = Math.floor(unit(connection.id + ':hue') * colorSet.length);
          const color = colorSet[colorIndex]!.clone().multiplyScalar(lane === 0 ? 0.74 : 0.42);
          lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
      }
    }

    const particleStrands = connection.relation === 'membership' ? (quality === 'low' ? 1 : 2) : strandCount;
    const particlesPerStrand = Math.floor(connectionSamples / particleStrands);
    const extraParticles = connectionSamples % particleStrands;
    for (let strand = 0; strand < particleStrands; strand += 1) {
      const strandSamples = particlesPerStrand + (strand < extraParticles ? 1 : 0);
      const lane = strand - (particleStrands - 1) / 2;
      for (let sample = 0; sample < strandSamples; sample += 1) {
        if (particleBudget <= 0) break;
        const seed = `${connection.id}:${strand}:${sample}`;
        const t = (sample + 0.18 + unit(seed + ':t') * 0.64) / Math.max(1, strandSamples);
        const point = centerAt(t, lane);
        const phi = unit(seed + ':phi') * Math.PI * 2;
        const filamentWidth = connection.relation === 'membership' ? 0.2 : 0.32;
        const radius = (0.11 + filamentWidth * Math.sin(Math.PI * t)) * Math.sqrt(unit(seed + ':radius'));
        point.addScaledVector(sideA, Math.cos(phi) * radius);
        point.addScaledVector(sideB, Math.sin(phi) * radius);
        const t0 = Math.max(0, t - 0.012);
        const t1 = Math.min(1, t + 0.012);
        const tangent = centerAt(t1, lane).sub(centerAt(t0, lane)).normalize();
        const colorIndex = Math.floor(unit(seed + ':color') * colorSet.length);
        const color = colorSet[colorIndex]!.clone();
        const opacity = connection.relation === 'membership'
          ? 0.2 + unit(seed + ':alpha') * 0.24
          : 0.15 + unit(seed + ':alpha') * 0.2;
        pushParticle(point, color, 4.0 + unit(seed + ':size') * 4.0, opacity, tangent, 2.1 + unit(seed + ':aspect') * 2.1);
        particleBudget -= 1;
      }
    }
  }

  // Dim static haze gathers around semantic knots. Its weight comes from the
  // number of published structural memberships, never from status or recency.
  const knots = layout.entities.filter(entity => entity.kind !== 'test').sort((a, b) => a.key.localeCompare(b.key));
  const sampledKnots = knots.length <= KNOT_LIMIT
    ? knots
    : Array.from({ length: KNOT_LIMIT }, (_, index) => knots[Math.floor(index * (knots.length - 1) / (KNOT_LIMIT - 1))]!);
  for (let knotIndex = 0; knotIndex < sampledKnots.length && particleBudget > 0; knotIndex += 1) {
    const entity = sampledKnots[knotIndex]!;
    const degree = entityDegree.get(entity.key) || 0;
    const baseCount = entity.kind === 'region' ? 32 : entity.kind === 'project' ? 42 : 28;
    const countPerKnot = Math.max(0, Math.floor(particleBudget / Math.max(1, sampledKnots.length - knotIndex)));
    const count = Math.min(countPerKnot, Math.round((baseCount + Math.min(110, degree * 9)) * config.haloScale));
    const center = vector(entity.position);
    const radius = entity.kind === 'project' ? 1.75 : entity.kind === 'region' ? 2.05 : 0.72;
    const mainNeighbor = (entityNeighbors.get(entity.key) || []).slice().sort((a, b) => b.distance - a.distance || a.tie.localeCompare(b.tie))[0];
    const axis = mainNeighbor
      ? mainNeighbor.position.clone().sub(center).normalize()
      : new Vector3(0.6, 0.35, 0.72).normalize();
    const [axisA, axisB] = stableBasis(center, center.clone().add(axis));
    for (let sample = 0; sample < count; sample += 1) {
      const seed = `knot:${entity.key}:${sample}`;
      const angle = unit(seed + ':angle') * Math.PI * 2;
      const shell = Math.sqrt(unit(seed + ':shell'));
      const along = (unit(seed + ':along') - 0.5) * radius * 2.4;
      const crossRadius = shell * radius * 0.34;
      const point = center.clone().addScaledVector(axis, along)
        .addScaledVector(axisA, Math.cos(angle) * crossRadius)
        .addScaledVector(axisB, Math.sin(angle) * crossRadius);
      const color = HAZE_COLORS[Math.floor(unit(seed + ':color') * HAZE_COLORS.length)]!;
      const opacity = 0.04 + unit(seed + ':alpha') * (entity.kind === 'project' ? 0.07 : 0.05);
      pushParticle(point, color, 10.0 + unit(seed + ':size') * 16.0, opacity, axis, 1.8 + unit(seed + ':aspect') * 1.2);
      particleBudget -= 1;
    }
    const hubLightCount = degree >= 5 ? Math.min(12, 3 + degree) : degree >= 3 ? 2 : 0;
    for (let sample = 0; sample < hubLightCount && particleBudget > 0; sample += 1) {
      const seed = `hub:${entity.key}:${sample}`;
      const angle = unit(seed + ':angle') * Math.PI * 2;
      const radiusOffset = Math.sqrt(unit(seed + ':radius')) * 0.22;
      const point = center.clone().addScaledVector(axisA, Math.cos(angle) * radiusOffset).addScaledVector(axisB, Math.sin(angle) * radiusOffset);
      const color = HUB_COLORS[Math.floor(unit(seed + ':color') * HUB_COLORS.length)]!;
      pushParticle(point, color, 8.0 + unit(seed + ':size') * 6.0, 0.5 + unit(seed + ':alpha') * 0.25, axis, 1.4);
      particleBudget -= 1;
    }
  }

  const filaments = new BufferGeometry();
  filaments.setAttribute('position', new BufferAttribute(new Float32Array(linePositions), 3));
  filaments.setAttribute('color', new BufferAttribute(new Float32Array(lineColors), 3));
  if (linePositions.length) filaments.computeBoundingSphere();

  const particles = new BufferGeometry();
  particles.setAttribute('position', new BufferAttribute(new Float32Array(pointPositions), 3));
  particles.setAttribute('tint', new BufferAttribute(new Float32Array(pointColors), 3));
  particles.setAttribute('axis', new BufferAttribute(new Float32Array(pointAxes), 3));
  particles.setAttribute('size', new BufferAttribute(new Float32Array(pointSizes), 1));
  particles.setAttribute('aspect', new BufferAttribute(new Float32Array(pointAspects), 1));
  particles.setAttribute('opacity', new BufferAttribute(new Float32Array(pointOpacities), 1));
  if (pointPositions.length) particles.computeBoundingSphere();

  return { filaments, particles, connections, particleCount: pointSizes.length };
}
