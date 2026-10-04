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
  high: { samples: 224, strands: 4, lineSteps: 34, haloScale: 1 },
  medium: { samples: 176, strands: 3, lineSteps: 25, haloScale: 0.72 },
  low: { samples: 88, strands: 2, lineSteps: 16, haloScale: 0.42 },
};
const CONNECTION_LIMIT = 2_048;
const KNOT_LIMIT = 512;
const DOMAIN_CANDIDATE_LIMIT = 256;
const PARTICLE_BUDGET: Record<CosmicQuality, number> = { high: 60_000, medium: 42_000, low: 20_000 };

const MEMBERSHIP_COLORS = ['#3979cc', '#578fd9', '#7186d7', '#937cce'].map(hex => new Color(hex));
const DOMAIN_COLORS = ['#356fba', '#4c78ca', '#529bc9', '#7a69bb'].map(hex => new Color(hex));
const HAZE_COLORS = ['#344d9c', '#435daf', '#315a7e', '#7357a3'].map(hex => new Color(hex));

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
  const pointSizes: number[] = [];
  const pointOpacities: number[] = [];
  const entityDegree = new Map<string, number>();
  const entityByKey = layout.entityByKey;
  let particleBudget = PARTICLE_BUDGET[quality];
  const connectionSampleBudget = Math.floor(PARTICLE_BUDGET[quality] * 0.7);
  const samplesPerConnection = Math.max(4, Math.min(config.samples, Math.floor(connectionSampleBudget / Math.max(1, connections.length))));

  const pushParticle = (point: Vector3, color: Color, size: number, opacity: number) => {
    pointPositions.push(point.x, point.y, point.z);
    pointColors.push(color.r, color.g, color.b);
    pointSizes.push(size);
    pointOpacities.push(opacity);
  };

  for (const connection of connections) {
    const source = entityByKey.get(connection.sourceKey);
    const target = entityByKey.get(connection.targetKey);
    if (!source || !target) continue;
    entityDegree.set(source.key, (entityDegree.get(source.key) || 0) + 1);
    entityDegree.set(target.key, (entityDegree.get(target.key) || 0) + 1);

    const a = vector(source.position);
    const b = vector(target.position);
    const span = a.distanceTo(b);
    if (span < 0.03) continue;
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
      const weave = envelope * (Math.sin(t * Math.PI * 2.2 + phase) * 0.22 + Math.sin(t * Math.PI * 5.1 - phase * 0.7) * 0.11) * Math.min(1.25, span * 0.2);
      curve.addScaledVector(sideA, weave);
      curve.addScaledVector(sideB, Math.sin(t * Math.PI * 3.3 + phase * 1.4) * weave * 0.58);
      if (lane !== 0) curve.addScaledVector(sideB, envelope * laneOffset * 0.62);
      return curve;
    };

    const connectionSamples = samplesPerConnection;
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

    const particleStrands = connection.relation === 'membership' ? 1 : strandCount;
    const particlesPerStrand = Math.max(2, Math.round(connectionSamples / particleStrands));
    for (let strand = 0; strand < particleStrands; strand += 1) {
      const lane = strand - (particleStrands - 1) / 2;
      for (let sample = 0; sample < particlesPerStrand; sample += 1) {
        if (particleBudget <= 0) break;
        const seed = `${connection.id}:${strand}:${sample}`;
        const t = (sample + 0.25 + unit(seed + ':t') * 0.5) / particlesPerStrand;
        const point = centerAt(t, lane);
        const phi = unit(seed + ':phi') * Math.PI * 2;
        const filamentWidth = connection.relation === 'membership' ? 0.46 : 0.72;
        const radius = (0.11 + filamentWidth * Math.sin(Math.PI * t)) * Math.sqrt(unit(seed + ':radius'));
        point.addScaledVector(sideA, Math.cos(phi) * radius);
        point.addScaledVector(sideB, Math.sin(phi) * radius);
        const colorIndex = Math.floor(unit(seed + ':color') * colorSet.length);
        const color = colorSet[colorIndex]!.clone();
        const opacity = connection.relation === 'membership'
          ? 0.12 + unit(seed + ':alpha') * 0.23
          : 0.09 + unit(seed + ':alpha') * 0.17;
        pushParticle(point, color, 3.2 + unit(seed + ':size') * 4.8, opacity);
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
    const baseCount = entity.kind === 'region' ? 62 : entity.kind === 'project' ? 92 : 54;
    const countPerKnot = Math.max(0, Math.floor(particleBudget / Math.max(1, sampledKnots.length - knotIndex)));
    const count = Math.min(countPerKnot, Math.round((baseCount + Math.min(110, degree * 9)) * config.haloScale));
    const center = vector(entity.position);
    const radius = entity.kind === 'project' ? 2.15 : entity.kind === 'region' ? 2.55 : 0.95;
    for (let sample = 0; sample < count; sample += 1) {
      const seed = `knot:${entity.key}:${sample}`;
      const z = unit(seed + ':z') * 2 - 1;
      const angle = unit(seed + ':angle') * Math.PI * 2;
      const shell = Math.pow(unit(seed + ':shell'), entity.kind === 'region' ? 0.68 : 1.15);
      const planar = Math.sqrt(Math.max(0, 1 - z * z));
      const point = center.clone().add(new Vector3(
        Math.cos(angle) * planar * shell * radius,
        z * shell * radius * (entity.kind === 'region' ? 0.55 : 0.78),
        Math.sin(angle) * planar * shell * radius,
      ));
      const color = HAZE_COLORS[Math.floor(unit(seed + ':color') * HAZE_COLORS.length)]!;
      const opacity = 0.026 + unit(seed + ':alpha') * (entity.kind === 'project' ? 0.12 : 0.075);
      pushParticle(point, color, 16 + unit(seed + ':size') * 44, opacity);
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
  particles.setAttribute('size', new BufferAttribute(new Float32Array(pointSizes), 1));
  particles.setAttribute('opacity', new BufferAttribute(new Float32Array(pointOpacities), 1));
  if (pointPositions.length) particles.computeBoundingSphere();

  return { filaments, particles, connections, particleCount: pointSizes.length };
}
