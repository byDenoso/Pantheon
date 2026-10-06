// Swapped in for data/projectionSync.ts. "Atualizar" here means: ask the private shell to revalidate the session and fetch a
// NEW generation (see refresh.ts). No public workflow dispatch, no public polling, no persistent receipt cache.
import {DataSourceError} from '../data/adapters/source.ts';
import {broker, runtimeHolder} from './state.ts';

export type ProjectionSyncReceipt = {outcome: 'PRIVATE_RUNTIME_REFRESHED'; request_id: string; projection_fingerprint: string; deduplicated: false};
export const projectionSyncAvailable = (): boolean => typeof window !== 'undefined' && window.parent !== window;

export async function dispatchProjectionSync(_previousFingerprint: string, signal?: AbortSignal): Promise<ProjectionSyncReceipt> {
  await broker.request(signal); // rejects honestly (UNAVAILABLE) when no new generation could be obtained
  const rt = runtimeHolder.get();
  if (!rt) throw new DataSourceError('UNAUTHORIZED', 'Runtime privado não carregado.');
  return {outcome: 'PRIVATE_RUNTIME_REFRESHED', request_id: 'private-refresh', projection_fingerprint: rt.fingerprint, deduplicated: false};
}
/** The new generation is already installed when dispatch resolves; there is no publication to wait for. */
export async function waitForProjectionSync(_requestId: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}
