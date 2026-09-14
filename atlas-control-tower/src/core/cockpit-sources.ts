import type { AtlasApiClient } from '../api/types';

export type SourceRead<T> = { state: 'READY' | 'PARTIAL' | 'ERROR'; data: T | null; metadata?: SourceMetadata };
export type PublicOperation = { id: string; label: string; status: string; updatedAt?: string };
export type PublicAuditIssue = { id: string; type: string; status: string; severity: string; scope: string };
type Operations = { actions: PublicOperation[]; runs: PublicOperation[] };
export type SourceMetadata = {
  source: string; freshness: string; sourceVersion: string | null; fingerprint: string | null;
  updatedAt: string | null; sourceRef: string | null;
};

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = ''): string => typeof value === 'string' && value.trim() ? value.trim() : fallback;

export function readMetadata(value: unknown): SourceMetadata {
  const root = record(value), source = { ...root, ...record(root.dataSource) };
  let sourceRef: string | null = null;
  try {
    const url = new URL(text(source.sourceRef));
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) sourceRef = url.href;
  } catch { /* A missing or invalid provenance URL is not a link. */ }
  return {
    source: text(source.effective, text(source.source, 'Fonte não identificada')),
    freshness: root.usedFallback === true || source.usedFallback === true ? 'DEGRADED' : text(source.freshness, 'UNKNOWN').toUpperCase(),
    sourceVersion: text(source.sourceVersion) || null, fingerprint: text(source.fingerprint) || null,
    // A revision (including an ISO-shaped sourceVersion) is not a sync receipt.
    updatedAt: text(source.updatedAt) || null, sourceRef
  };
}

export function freshnessLabel(value: string): string {
  return ({ LIVE: 'API ao vivo', SNAPSHOT: 'Snapshot público', STALE: 'Leitura desatualizada', DEGRADED: 'Leitura degradada', FALLBACK: 'Fallback da fonte', OFFLINE: 'Fonte offline' } as Record<string, string>)[value] || 'Origem não confirmada';
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some(item => !text(record(item).id))) throw Error('INVALID_COLLECTION');
  return value.map(record);
}

function operations(value: unknown): PublicOperation[] {
  return rows(value).map(item => ({ id: text(item.id), label: text(item.label, text(item.name, text(item.id))), status: text(item.status, 'UNKNOWN'), updatedAt: text(item.updatedAt) || undefined }));
}

async function read<T>(fetcher: () => Promise<unknown>, parse: (value: unknown) => T): Promise<SourceRead<T>> {
  try {
    const value = await fetcher(), root = record(value);
    if (root.error || root.ok === false || ['DATA_UNAVAILABLE', 'API_ERROR', 'OFFLINE'].includes(text(root.status))) throw Error('SOURCE_UNAVAILABLE');
    const metadata = readMetadata(value);
    return { state: ['DEGRADED', 'STALE', 'FALLBACK', 'OFFLINE'].includes(metadata.freshness) || root.status === 'PARTIAL' ? 'PARTIAL' : 'READY', data: parse(value), metadata };
  } catch { return { state: 'ERROR', data: null }; }
}

export async function loadCockpitSources(api: Pick<AtlasApiClient, 'health' | 'ops' | 'automationRuns' | 'audit'>) {
  const [health, ops, runs, audit] = await Promise.all([
    read(api.health, value => {
      const root = record(value);
      if (!text(root.contract) && !Object.keys(record(root.dataSource)).length) throw Error('INVALID_HEALTH');
      return root;
    }),
    read<Operations>(api.ops, value => ({ actions: operations(record(value).actions), runs: operations(record(value).runs) })),
    read(api.automationRuns, operations),
    read<PublicAuditIssue[]>(api.audit, value => rows(record(value).issues).map(item => ({ id: text(item.id), type: text(item.type, 'verificação'), status: text(item.status, 'UNKNOWN'), severity: text(item.severity, 'UNKNOWN'), scope: text(item.scope, 'NEXO') })))
  ]);
  return { health, ops, runs, audit };
}

export type CockpitSources = Awaited<ReturnType<typeof loadCockpitSources>>;

export function mergeRunSources(sources: Pick<CockpitSources, 'ops' | 'runs'>): SourceRead<PublicOperation[]> {
  const { ops, runs } = sources;
  if (!ops.data && !runs.data) return { state: 'ERROR', data: null };
  return {
    state: ops.state === 'READY' && runs.state === 'READY' ? 'READY' : 'PARTIAL',
    data: Array.from(new Map([...(ops.data?.runs || []), ...(runs.data || [])].map(item => [item.id, item])).values())
  };
}

export function activeOperations(items: PublicOperation[]): PublicOperation[] {
  return items.filter(item => ['RUNNING', 'IN_PROGRESS', 'EXECUTING', 'ACTIVE'].includes(item.status.toUpperCase()));
}
