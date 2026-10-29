export type AutonomyView = {
  contract: 'NEXO_AUTONOMY_READ_ONLY_VIEW_V1';
  status: 'UNKNOWN' | 'PREPARED_INACTIVE' | 'ACTIVE_UNVERIFIED' | 'REVOKED';
  observed_at: string;
  source_updated_at: string;
  tower_fingerprint: string;
  mandate: {id: string; revision: number; status: 'ACTIVE' | 'REVOKED'} | null;
  actions: {approve: false; revoke: false};
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function validAutonomyView(value: unknown): value is AutonomyView {
  if (!object(value) || value.contract !== 'NEXO_AUTONOMY_READ_ONLY_VIEW_V1' ||
      !['UNKNOWN','PREPARED_INACTIVE','ACTIVE_UNVERIFIED','REVOKED'].includes(String(value.status)) ||
      !date(value.observed_at) || !date(value.source_updated_at) ||
      typeof value.tower_fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.tower_fingerprint) ||
      !object(value.actions) || value.actions.approve !== false || value.actions.revoke !== false) return false;
  if (value.status === 'ACTIVE_UNVERIFIED' || value.status === 'REVOKED') {
    const m = value.mandate;
    return object(m) && typeof m.id === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(m.id) &&
      Number.isSafeInteger(m.revision) && Number(m.revision) >= 1 && m.status === (value.status === 'ACTIVE_UNVERIFIED' ? 'ACTIVE' : 'REVOKED');
  }
  return value.mandate === null;
}
export async function loadAutonomyStatus(signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<AutonomyView> {
  const response = await fetchImpl('/api/atlas-private/autonomy', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
    headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: '{}',
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'AUTONOMY_UNAVAILABLE');
  const value: unknown = await response.json();
  if (!validAutonomyView(value)) throw new Error('AUTONOMY_VIEW_INVALID');
  return value;
}
