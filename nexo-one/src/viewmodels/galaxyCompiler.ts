// The NEXO ONE Visual Compiler.
//
// TOWER_V06 -> GET /api/system (server/compiler/system-state.mjs) -> SystemState
//   -> compileGalaxySnapshot() -> GalaxySnapshot (NEXO_ONE_GALAXY_V1) -> frontend.
//
// This module only derives presentation: position, grouping, visual layer, weight
// and diffs between snapshots. It never invents status, domain, relation, hypothesis,
// test, capability or blocker data — every GalaxyEntity/GalaxyRelation/GalaxyNeedsYou
// field is copied or computed from a field SystemState already carries. Positions come
// from layoutGraph3D (graph3d.ts), which is hash-derived and therefore deterministic:
// the same SystemState always compiles to the same macro-layout.

import type { Domain, GraphNode, GraphNodeType, SystemState } from '../contracts/system.ts';
import {
  GALAXY_CONTRACT, GALAXY_DOMAINS,
  type GalaxyChange, type GalaxyEntity, type GalaxyKind, type GalaxyLayer,
  type GalaxyLayoutHint, type GalaxyNeedsYou, type GalaxyPreset, type GalaxyRelation,
  type GalaxySnapshot, type GalaxyStats, type GalaxySubdomain,
} from '../contracts/galaxy.ts';
import { layoutGraph3D, type PlacedNode3D } from './graph3d.ts';

/** Projection of the canonical GraphNodeType onto the galaxy's visual taxonomy.
 * Adding a Tower type here never changes what the type canonically means. */
const KIND_BY_TYPE: Record<GraphNodeType, GalaxyKind> = {
  DOMAIN: 'DOMAIN',
  CAPABILITY: 'CAPABILITY',
  PROVIDER: 'AUTOMATION',
  TEST: 'TEST',
  FILAMENT: 'HYPOTHESIS',
  ACTION: 'WORK',
  EFFECT: 'RESULT',
  CLAIM: 'RESULT',
  MEMORY: 'OTHER',
  PROJECTION: 'OTHER',
  SIDE_QUEST: 'OTHER',
};

/** Types that read as less consolidated / more experimental sit in the outer periphery. */
const PERIPHERY_TYPES: readonly GraphNodeType[] = ['SIDE_QUEST', 'FILAMENT'];

const WEIGHT_BY_LAYER: Record<GalaxyLayer, number> = { CORE: 5, DOMAIN: 4, SUBDOMAIN: 3, ENTITY: 2, PERIPHERY: 1 };

const GALAXY_PRESETS: GalaxyPreset[] = [
  { id: 'RESEARCH', label: 'Research', kinds: ['DOMAIN', 'HYPOTHESIS', 'TEST'] },
  { id: 'EXECUTION', label: 'Execution', kinds: ['DOMAIN', 'TEST', 'CAPABILITY', 'AUTOMATION', 'WORK'] },
  { id: 'LEARNING', label: 'Learning', kinds: ['DOMAIN', 'HYPOTHESIS', 'RESULT'] },
  { id: 'ATTENTION', label: 'Attention', kinds: ['DOMAIN', 'WORK', 'OTHER'] },
  { id: 'FULL_SYSTEM', label: 'Full system', kinds: ['DOMAIN', 'SUBDOMAIN', 'TEST', 'HYPOTHESIS', 'CAPABILITY', 'AUTOMATION', 'WORK', 'RESULT', 'OTHER'] },
];

function layerFor(node: GraphNode): GalaxyLayer {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 'CORE' : 'DOMAIN';
  if (PERIPHERY_TYPES.includes(node.type)) return 'PERIPHERY';
  return 'ENTITY';
}

function subdomainId(domain: Domain, type: GraphNodeType): string {
  return `galaxy.subdomain.${domain.toLowerCase()}.${type.toLowerCase()}`;
}

/** FNV-1a — the same small stable hash already used in graph3d.ts / McpAtlasApp.tsx. */
function fingerprintOf(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

function toLayoutHint(placed: PlacedNode3D | null, layer: GalaxyLayer): GalaxyLayoutHint {
  return {
    layer,
    position: placed ? { x: placed.x, y: placed.y, z: placed.z } : { x: 0, y: 0, z: 0 },
    weight: WEIGHT_BY_LAYER[layer],
    derived: true,
  };
}

/**
 * TOWER_V06 -> GalaxySnapshot. Pure and deterministic: the same SystemState always
 * produces the same snapshot except for snapshot_id/generated_at, which track the
 * source projection bus fingerprint/timestamp.
 */
export function compileGalaxySnapshot(
  state: SystemState,
  options: { previous?: GalaxySnapshot | null } = {},
): GalaxySnapshot {
  const nodes = state.graph?.nodes ?? [];
  const edges = state.graph?.edges ?? [];
  const inbox = state.inbox ?? [];

  const placed = layoutGraph3D(nodes);
  const placedById = new Map(placed.map(node => [node.id, node]));

  const entities: GalaxyEntity[] = nodes.map(node => {
    const layer = layerFor(node);
    const layout = toLayoutHint(placedById.get(node.id) ?? null, layer);
    return {
      id: node.id,
      kind: KIND_BY_TYPE[node.type] ?? 'OTHER',
      canonical_type: node.type,
      domain: node.domain,
      subdomain_id: node.type === 'DOMAIN' ? null : subdomainId(node.domain, node.type),
      status: node.state,
      title: node.label,
      summary: node.summary,
      importance: layout.weight,
      provenance: {
        source_ref: node.source_ref,
        source_revision: node.source_revision,
        fingerprint: node.fingerprint,
        authority_class: node.authority_class,
      },
      layout,
    };
  });

  // Subdomains are a conservative, explicit derivation: one bucket per (domain, canonical
  // type) among non-domain entities, mirroring the domain -> cluster -> entity grouping
  // Atlas.tsx already uses for drill-down. The canonical Tower has no separate subdomain
  // tier; this grouping is presentation-only (every subdomain carries `derived: true`).
  const buckets = new Map<string, GalaxyEntity[]>();
  for (const entity of entities) {
    if (entity.canonical_type === 'DOMAIN') continue;
    const key = entity.subdomain_id!;
    const list = buckets.get(key) ?? [];
    list.push(entity);
    buckets.set(key, list);
  }

  const subdomains: GalaxySubdomain[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, members]) => {
      const sum = members.reduce((acc, member) => ({
        x: acc.x + member.layout.position.x,
        y: acc.y + member.layout.position.y,
        z: acc.z + member.layout.position.z,
      }), { x: 0, y: 0, z: 0 });
      const count = members.length || 1;
      return {
        id,
        domain: members[0].domain,
        kind: members[0].canonical_type,
        title: `${members[0].domain} · ${members[0].canonical_type}`,
        entity_count: members.length,
        layout: {
          layer: 'SUBDOMAIN' as const,
          position: { x: sum.x / count, y: sum.y / count, z: sum.z / count },
          weight: WEIGHT_BY_LAYER.SUBDOMAIN,
          derived: true as const,
        },
      };
    });

  const domainEntityIdByDomain = new Map(
    entities.filter(entity => entity.canonical_type === 'DOMAIN').map(entity => [entity.domain, entity.id]),
  );
  const entityIds = new Set(entities.map(entity => entity.id));

  const relations: GalaxyRelation[] = [
    ...edges
      .filter(edge => entityIds.has(edge.from) && entityIds.has(edge.to))
      .map(edge => ({ id: edge.id, from: edge.from, to: edge.to, kind: edge.kind, weight: edge.weight, derived: false })),
    ...subdomains
      .filter(sub => domainEntityIdByDomain.has(sub.domain))
      .map(sub => ({
        id: `galaxy.relation.domain.${sub.id}`,
        from: domainEntityIdByDomain.get(sub.domain)!,
        to: sub.id,
        kind: 'OWNS' as const,
        weight: 0.4,
        derived: true,
      })),
    ...subdomains.flatMap(sub => (buckets.get(sub.id) ?? []).map(entity => ({
      id: `galaxy.relation.subdomain.${sub.id}.${entity.id}`,
      from: sub.id,
      to: entity.id,
      kind: 'OWNS' as const,
      weight: 0.6,
      derived: true,
    }))),
  ];

  // Needs You is exactly state.inbox, untouched: InboxItem already models only the
  // explicit human-gate kinds (DECIDIR/APROVAR/RESPONDER/ESCOLHER/FORNECER_DADO). A
  // queued test, a busy runtime or a recoverable capability never reaches this list
  // because they never reach the inbox in the first place.
  const needsYou: GalaxyNeedsYou[] = inbox.map(item => ({
    id: item.id,
    domain: item.domain,
    title: item.title,
    question: item.question,
    why: item.why,
    entity_id: item.action_id,
    severity: item.severity,
    due_at: item.due_at,
    source_ref: item.source_ref,
  }));

  const generatedAt = state.bus?.generated_at || state.generated_at;
  const fingerprint = state.bus?.fingerprint || fingerprintOf(`empty:${generatedAt}`);
  const snapshotId = `galaxy-${fingerprintOf(`${fingerprint}:${generatedAt}`)}`;

  const stats: GalaxyStats = {
    domains: GALAXY_DOMAINS.length,
    subdomains: subdomains.length,
    entities: entities.length,
    relations: relations.length,
    needs_you: needsYou.length,
  };

  const snapshot: GalaxySnapshot = {
    contract: GALAXY_CONTRACT,
    snapshot_id: snapshotId,
    generated_at: generatedAt,
    tower_revision: fingerprint,
    fingerprint,
    domains: GALAXY_DOMAINS,
    subdomains,
    entities,
    relations,
    needs_you: needsYou,
    changes: [],
    presets: GALAXY_PRESETS,
    stats,
  };
  snapshot.changes = diffGalaxySnapshots(options.previous ?? null, snapshot);
  return snapshot;
}

/**
 * Derives Changes by diffing two real GalaxySnapshots. Never fabricated from a single
 * snapshot: with no previous snapshot, there is no history to report yet.
 */
export function diffGalaxySnapshots(previous: GalaxySnapshot | null, current: GalaxySnapshot): GalaxyChange[] {
  if (!previous) return [];
  const priorById = new Map(previous.entities.map(entity => [entity.id, entity]));
  const currentIds = new Set(current.entities.map(entity => entity.id));
  const changes: GalaxyChange[] = [];

  for (const entity of current.entities) {
    const prior = priorById.get(entity.id);
    if (!prior) {
      changes.push({
        id: `change.added.${entity.id}.${current.snapshot_id}`,
        timestamp: current.generated_at,
        entity_id: entity.id,
        domain: entity.domain,
        change_type: 'ADDED',
        summary: `${entity.title} passou a existir na projeção.`,
        before: null,
        after: entity.status,
        importance: entity.importance,
      });
      continue;
    }
    if (prior.status !== entity.status) {
      changes.push({
        id: `change.status.${entity.id}.${current.snapshot_id}`,
        timestamp: current.generated_at,
        entity_id: entity.id,
        domain: entity.domain,
        change_type: 'STATUS_CHANGED',
        summary: `${entity.title}: ${prior.status} -> ${entity.status}.`,
        before: prior.status,
        after: entity.status,
        importance: entity.importance,
      });
    }
  }

  for (const entity of previous.entities) {
    if (currentIds.has(entity.id)) continue;
    changes.push({
      id: `change.removed.${entity.id}.${current.snapshot_id}`,
      timestamp: current.generated_at,
      entity_id: entity.id,
      domain: entity.domain,
      change_type: 'REMOVED',
      summary: `${entity.title} saiu da projeção.`,
      before: entity.status,
      after: null,
      importance: entity.importance,
    });
  }

  return changes.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
}
