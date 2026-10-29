export type ContinuityRead = (body: Record<string, unknown>, signal?: AbortSignal) => Promise<ContinuityData>;
export type ContinuityProject = {id: string; title: string; action: string; text: string; next_action: string | null; owner: string | null; depends_on: unknown[]; updated_at: string; decision: unknown; history: unknown[]};
export type ContinuityCard = {id: string; claim: string; scope_id: string; state: string; spec_version: number; next_owner: string; last_material_at: string; gaps: string[]; open_objections: string[]; open_conflicts: string[]; quorum: boolean; stale: boolean; registration: {test_id?: string} | null; legacy_test_ref: string | null};
export type ContinuityMemory = {id: string; category: string; text: string; recorded_at: string; author: string; sources: unknown[]; applicability?: unknown; contradicts?: string[]};
export type ContinuityData = {contract: 'NEXO_PRIVATE_CONTINUITY_VIEW_V1'; available: true; source_revision: string; source_updated_at: string; observed_at: string; scope: string; projects: ContinuityProject[]; cards: ContinuityCard[]; memory: ContinuityMemory[]; decisions: ContinuityProject[]; deliveries: Array<{id: string; title: string; text: string; delivery?: {source_path: string}; sources: unknown[]}>; timeline: Array<{id: string; at: string; kind: string; text: string | null}>; timeline_total: number; items: unknown[]; next_offset: number | null; total: number; events_total: number};
/** One owner-authenticated read route. No caller-selected URL, credentials or writes. */
export function createContinuityTransport(nativeFetch: typeof fetch): ContinuityRead {
  return async (body, signal) => {
    const response = await nativeFetch('/api/atlas-private/continuity', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal,
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(typeof value?.error === 'string' ? value.error : 'CONTINUITY_UNAVAILABLE'), {status: response.status});
    if (value?.contract !== 'NEXO_PRIVATE_CONTINUITY_VIEW_V1' || value.available !== true || value.access !== 'OWNER_PRIVATE') throw new Error('CONTINUITY_RESPONSE_INVALID');
    return value;
  };
}
