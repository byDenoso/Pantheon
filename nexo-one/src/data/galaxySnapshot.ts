import { GALAXY_CONTRACT, type GalaxySnapshot } from '../contracts/galaxy.ts';

export type SnapshotFreshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export const DEFAULT_GALAXY_ENDPOINT =
  import.meta.env?.VITE_GALAXY_ENDPOINT?.trim() || './galaxy/latest.json';

export function assertGalaxySnapshot(value: unknown): GalaxySnapshot {
  if (!value || typeof value !== 'object') throw new Error('GALAXY_SNAPSHOT_INVALID');
  const snapshot = value as Partial<GalaxySnapshot>;
  if (snapshot.contract !== GALAXY_CONTRACT) throw new Error('GALAXY_CONTRACT_INVALID');
  if (typeof snapshot.snapshot_id !== 'string' || !/^galaxy-[0-9a-f]+$/i.test(snapshot.snapshot_id)) {
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

export function snapshotAgeMs(generatedAt: string, now = Date.now()): number | null {
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated)) return null;
  return Math.max(0, now - generated);
}

/**
 * The publishing cadence is two hours. One extra hour is tolerated as scheduling
 * jitter before a snapshot becomes AGING; six hours marks it STALE.
 */
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
    return assertGalaxySnapshot(await response.json());
  } catch (error) {
    if (fallback) return assertGalaxySnapshot(fallback);
    throw error;
  }
}
