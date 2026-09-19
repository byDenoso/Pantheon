import {
  GALAXY_CONTRACT,
  GALAXY_DOMAINS,
  type GalaxyChange,
  type GalaxyEntity,
  type GalaxyKind,
  type GalaxySnapshot,
  type GalaxySubdomain,
} from '../contracts/galaxy.ts';
import type { Domain, GraphNodeType } from '../contracts/system.ts';

export type SnapshotFreshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export const DEFAULT_GALAXY_ENDPOINT =
  import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function inferredCanonicalType(kind: GalaxyKind): GraphNodeType {
  if (kind === 'DOMAIN') return 'DOMAIN';
  if (kind === 'TEST') return 'TEST';
  if (kind === 'HYPOTHESIS') return 'FILAMENT';
  if (kind === 'CAPABILITY') return 'CAPABILITY';
  if (kind === 'AUTOMATION') return 'PROVIDER';
  if (kind === 'WORK') return 'ACTION';
  if (kind === 'RESULT') return 'EFFECT';
  return 'MEMORY';
}

function inferredKind(value: unknown): GalaxyKind {
  const kind = stringValue(value).toUpperCase();
  const allowed: GalaxyKind[] = ['DOMAIN','SUBDOMAIN','TEST','HYPOTHESIS','CAPABILITY','AUTOMATION','WORK','RESULT','OTHER'];
  return allowed.includes(kind as GalaxyKind) ? kind as GalaxyKind : 'OTHER';
}

function domainValue(value: unknown, fallback: Domain): Domain {
  const domain = stringValue(value).toUpperCase();
  return (GALAXY_DOMAINS as string[]).includes(domain) ? domain as Domain : fallback;
}

function positionFrom(rawLayout: unknown, fallback: GalaxyEntity['layout']['position']) {
  const layout = record(rawLayout);
  if (!layout) return fallback;
  return {
    x: numberValue(layout.x, fallback.x),
    y: numberValue(layout.y, fallback.y),
    z: numberValue(layout.z, fallback.z),
  };
}

function rawChangeValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  const item = record(value);
  if (item && typeof item.status === 'string') return item.status;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function assertGalaxySnapshot(value: unknown): GalaxySnapshot {
  if (!value || typeof value !== 'object') throw new Error('GALAXY_SNAPSHOT_INVALID');
  const snapshot = value as Partial<GalaxySnapshot>;
  if (snapshot.contract !== GALAXY_CONTRACT) throw new Error('GALAXY_CONTRACT_INVALID');
  if (typeof snapshot.snapshot_id !== 'string' || !/^galaxy-[0-9a-z-]+$/i.test(snapshot.snapshot_id)) {
    throw new Error('GALAXY_SNAPSHOT_ID_INVALID');
  }
  if (typeof snapshot.generated_at !== 'string' || !Number.isFinite(Date.parse(snapshot.generated_at))) {
    throw new Error('GALAXY_GENERATED_AT_INVALID');
  }
  if (typeof snapshot.tower_revision !== 'string' || !snapshot.tower_revision) {
    throw new Error('GALAXY_TOWER_REVISION_INVALID');
  }
  if (!Array.isArray(snapshot.entities) || !Array.isArray(snapshot.relations) || !Array.isArray(snapshot.subdomains)) {
    throw new Error('GALAXY_COLLECTIONS_INVALID');
  }
  if (!Array.isArray(snapshot.domains) || snapshot.domains.length !== 4) {
    throw new Error('GALAXY_DOMAINS_INVALID');
  }
  return snapshot as GalaxySnapshot;
}

/**
 * Main's production compiler reads the sanctioned Tower projection directly.
 * The interactive frontend uses a narrower SystemState-shaped GalaxySnapshot.
 * Normalize the published projection into that UI contract instead of maintaining
 * two competing production compilers.
 */
export function normalizePublishedGalaxySnapshot(rawValue: unknown, fallback: GalaxySnapshot): GalaxySnapshot {
  const raw = record(rawValue);
  if (!raw || raw.contract !== GALAXY_CONTRACT) throw new Error('GALAXY_CONTRACT_INVALID');
  const rawEntities = Array.isArray(raw.entities) ? raw.entities : [];
  const fallbackById = new Map(fallback.entities.map(entity => [entity.id, entity]));
  const publishedToCanonical = new Map<string, string>();

  const entities: GalaxyEntity[] = rawEntities.map((itemValue, index) => {
    const item = record(itemValue) ?? {};
    const publishedId = stringValue(item.id);
    const canonicalId = stringValue(item.canonical_id) || publishedId.replace(/^[a-z_]+:/i, '');
    if (publishedId) publishedToCanonical.set(publishedId, canonicalId);
    const base = fallbackById.get(canonicalId) ?? fallbackById.get(publishedId);
    const kind = inferredKind(item.kind);
    const fallbackDomain = base?.domain ?? 'NEXO';
    const domain = domainValue(item.visual_domain ?? item.domain, fallbackDomain);
    const layout = base?.layout ?? {
      layer: kind === 'DOMAIN' ? (domain === 'NEXO' ? 'CORE' : 'DOMAIN') : 'ENTITY',
      position: { x: 0, y: 0, z: 0 },
      weight: kind === 'DOMAIN' ? 4 : 2,
      derived: true as const,
    };
    const source = record(item.source);
    return {
      id: canonicalId || `published:${index}`,
      kind,
      canonical_type: base?.canonical_type ?? inferredCanonicalType(kind),
      domain,
      subdomain_id: base?.subdomain_id ?? null,
      status: (stringValue(item.status) || base?.status || 'UNKNOWN') as GalaxyEntity['status'],
      title: stringValue(item.title) || base?.title || canonicalId || publishedId,
      summary: base?.summary || stringValue(item.title) || canonicalId || publishedId,
      importance: numberValue(item.importance, base?.importance ?? 2),
      provenance: base?.provenance ?? {
        source_ref: stringValue(source?.canonical_id) || canonicalId || publishedId,
        source_revision: stringValue(source?.revision) || stringValue(record(raw.provenance)?.source_fingerprint),
        fingerprint: stringValue(source?.projection_fingerprint) || stringValue(record(raw.provenance)?.source_fingerprint),
        authority_class: 'DERIVED',
      },
      layout: {
        ...layout,
        position: positionFrom(item.layout, layout.position),
        weight: numberValue(item.importance, layout.weight),
        derived: true,
      },
    };
  });

  const entitiesBySubdomain = new Map<string, GalaxyEntity[]>();
  for (const entity of entities) {
    if (!entity.subdomain_id) continue;
    const list = entitiesBySubdomain.get(entity.subdomain_id) ?? [];
    list.push(entity);
    entitiesBySubdomain.set(entity.subdomain_id, list);
  }

  const subdomains: GalaxySubdomain[] = fallback.subdomains.map(subdomain => {
    const members = entitiesBySubdomain.get(subdomain.id) ?? [];
    if (!members.length) return subdomain;
    const sums = members.reduce((acc, entity) => ({
      x: acc.x + entity.layout.position.x,
      y: acc.y + entity.layout.position.y,
      z: acc.z + entity.layout.position.z,
    }), { x: 0, y: 0, z: 0 });
    return {
      ...subdomain,
      entity_count: members.length,
      layout: {
        ...subdomain.layout,
        position: {
          x: sums.x / members.length,
          y: sums.y / members.length,
          z: sums.z / members.length,
        },
      },
    };
  });

  const rawChanges = Array.isArray(raw.changes) ? raw.changes : [];
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const changes: GalaxyChange[] = rawChanges.map((changeValue, index) => {
    const change = record(changeValue) ?? {};
    const publishedEntity = stringValue(change.entity ?? change.entity_id);
    const entityId = publishedToCanonical.get(publishedEntity) || publishedEntity.replace(/^[a-z_]+:/i, '');
    const entity = entityById.get(entityId);
    const rawType = stringValue(change.change_type).toUpperCase();
    const changeType: GalaxyChange['change_type'] =
      rawType === 'ADDED' ? 'ADDED' : rawType === 'REMOVED' ? 'REMOVED' : 'STATUS_CHANGED';
    return {
      id: stringValue(change.id) || `change.published.${index}.${entityId || 'unknown'}`,
      timestamp: stringValue(change.timestamp) || stringValue(raw.generated_at),
      entity_id: entityId,
      domain: entity?.domain ?? null,
      change_type: changeType,
      summary: stringValue(change.summary) || `${entity?.title ?? entityId} updated.`,
      before: rawChangeValue(change.before),
      after: rawChangeValue(change.after),
      importance: numberValue(change.importance, entity?.importance ?? 1),
    };
  });

  const provenance = record(raw.provenance);
  const projectionFingerprint = stringValue(provenance?.source_fingerprint) || fallback.tower_revision;
  const snapshot: GalaxySnapshot = {
    ...fallback,
    snapshot_id: stringValue(raw.snapshot_id) || fallback.snapshot_id,
    generated_at: stringValue(raw.generated_at) || fallback.generated_at,
    tower_revision: projectionFingerprint,
    fingerprint: stringValue(raw.fingerprint) || fallback.fingerprint,
    entities,
    subdomains,
    relations: fallback.relations,
    needs_you: fallback.needs_you,
    changes,
    stats: {
      domains: GALAXY_DOMAINS.length,
      subdomains: subdomains.length,
      entities: entities.length,
      relations: fallback.relations.length,
      needs_you: fallback.needs_you.length,
    },
  };
  return assertGalaxySnapshot(snapshot);
}

export function snapshotAgeMs(generatedAt: string, now = Date.now()): number | null {
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated)) return null;
  return Math.max(0, now - generated);
}

export function galaxySnapshotFreshness(generatedAt: string, now = Date.now()): SnapshotFreshness {
  const age = snapshotAgeMs(generatedAt, now);
  if (age === null) return 'UNKNOWN';
  if (age <= 3 * 60 * 60 * 1000) return 'FRESH';
  if (age <= 6 * 60 * 60 * 1000) return 'AGING';
  return 'STALE';
}

export function galaxySnapshotAgeLabel(generatedAt: string, now = Date.now()): string {
  const age = snapshotAgeMs(generatedAt, now);
  if (age === null) return 'snapshot age unknown';
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return 'updated just now';
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `updated ${hours}h ago`;
  return `updated ${Math.floor(hours / 24)}d ago`;
}

export async function loadGalaxySnapshot({
  endpoint = DEFAULT_GALAXY_ENDPOINT,
  signal,
  fallback = null,
  fetchImpl = fetch,
}: {
  endpoint?: string;
  signal?: AbortSignal;
  fallback?: GalaxySnapshot | null;
  fetchImpl?: typeof fetch;
} = {}): Promise<GalaxySnapshot> {
  const requestUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}v=${Date.now()}`;
  try {
    const response = await fetchImpl(requestUrl, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`GALAXY_HTTP_${response.status}`);
    const raw = await response.json();
    return fallback ? normalizePublishedGalaxySnapshot(raw, fallback) : assertGalaxySnapshot(raw);
  } catch (error) {
    if (fallback) return assertGalaxySnapshot(fallback);
    throw error;
  }
}
