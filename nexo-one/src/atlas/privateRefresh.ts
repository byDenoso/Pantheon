import {RefreshError} from './privateFrameBridge.ts';
import {ApiError, fetchPrivate, fetchSession} from './api.ts';

/** Revalidate the session and fetch a NEW generation. Fatal = session/source lost; only a pure network failure is transient. */
export async function refreshPrivateRuntime(f: (input: string, init?: RequestInit) => Promise<Response> = (i, n) => window.fetch(i, n), current?: Record<string, unknown>, now: () => number = Date.now, signal?: AbortSignal): Promise<Record<string, unknown>> {
  try {
    const s = await fetchSession(f, signal);
    if (!s.configured || !s.authenticated || !s.expiresAt || Date.parse(s.expiresAt) <= now()) throw new RefreshError('AUTH_REQUIRED', true);
    const data = (await fetchPrivate(f, signal)).data;
    if (Date.parse(s.expiresAt) <= now()) throw new RefreshError('AUTH_REQUIRED', true);
    if (typeof current?.generated_at === 'string' && typeof data.generated_at === 'string'
      && Date.parse(data.generated_at) < Date.parse(current.generated_at)) throw new RefreshError('STALE_GENERATION', false);
    return data;
  } catch (e) {
    if (e instanceof RefreshError) throw e;
    if (e instanceof ApiError) throw new RefreshError(e.code, e.code !== 'NETWORK' && e.code !== 'ABORTED');
    throw new RefreshError('REFRESH_FAILED', true);
  }
}
