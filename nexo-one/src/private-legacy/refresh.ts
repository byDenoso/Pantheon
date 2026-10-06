// Frame side of "give me a NEW generation". The frame never fetches anything itself: it asks the parent to revalidate the
// session and re-fetch the private runtime, then validates and swaps atomically. Never replays the same in-memory snapshot
// as if it were new, and never triggers any public workflow.
import {DataSourceError} from '../data/adapters/source.ts';
import {FRAME, type FromFrame} from './protocol.ts';
import {validateRuntime, type PrivateRuntime, type RuntimeFailure, type RuntimeHolder} from './runtime.ts';

export const REFRESH_TIMEOUT_MS = 30_000;
export type RefreshResult = {ok: true} | {ok: false; code: string};
export type Timers = {set(fn: () => void, ms: number): unknown; clear(h: unknown): void};

export type Broker = {
  /** Single-flight: concurrent callers share one request. Rejects with DataSourceError UNAVAILABLE (honest, never a fake success). */
  request(signal?: AbortSignal): Promise<void>;
  has(id: string): boolean;
  settle(id: string, result: RefreshResult): void;
  failAll(code: string): void;
};

export function createRefreshBroker(deps: {post: (m: FromFrame) => boolean; timeoutMs?: number; timers?: Timers}): Broker {
  const timers: Timers = deps.timers ?? {set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>)};
  let seq = 0;
  let cur: {id: string; promise: Promise<void>; resolve: () => void; reject: (e: Error) => void; timer: unknown} | null = null;
  const unavailable = (why: string) => new DataSourceError('UNAVAILABLE', `Atualização privada indisponível: ${why}.`);
  const finish = (r: RefreshResult) => {
    const c = cur; if (!c) return; cur = null; timers.clear(c.timer);
    if (r.ok) c.resolve(); else c.reject(unavailable(r.code));
  };
  return {
    request(signal) {
      if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      if (!cur) {
        const id = `r${++seq}-${Math.random().toString(36).slice(2, 10)}`;
        let resolve!: () => void, reject!: (e: Error) => void;
        const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
        promise.catch(() => undefined); // the shared promise may have no live consumer when it fails
        if (!deps.post({channel: FRAME, type: 'REFRESH', id})) return Promise.reject(unavailable('sem área privada pai'));
        cur = {id, promise, resolve, reject, timer: timers.set(() => finish({ok: false, code: 'TIMEOUT'}), deps.timeoutMs ?? REFRESH_TIMEOUT_MS)};
      }
      const shared = cur.promise;
      if (!signal) return shared;
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', onAbort, {once: true});
        shared.then(() => { signal.removeEventListener('abort', onAbort); resolve(); }, e => { signal.removeEventListener('abort', onAbort); reject(e); });
      });
    },
    has: id => cur?.id === id,
    settle(id, result) { if (cur?.id === id) finish(result); },
    failAll(code) { finish({ok: false, code}); },
  };
}

export type Applied =
  | {kind: 'accepted'; runtime: PrivateRuntime; changed: boolean}
  | {kind: 'invalid'; code: RuntimeFailure}
  | {kind: 'stale'};

/**
 * Validate a refreshed generation and, only if fully valid and not older than the current one, swap it in ONE assignment.
 * Anything else leaves the holder untouched (the caller decides: invalid => fail closed; stale => honest unavailable).
 * `changed` (different fingerprint) tells the host to rebuild the whole store so no cache of the old generation survives.
 */
export function applyRefresh(holder: RuntimeHolder, raw: unknown): Applied {
  const check = validateRuntime(raw);
  if (!check.ok) return {kind: 'invalid', code: check.code};
  const old = holder.get();
  if (old && Date.parse(check.runtime.generated_at) < Date.parse(old.generated_at)) return {kind: 'stale'};
  const changed = !old || old.fingerprint.toLowerCase() !== check.runtime.fingerprint.toLowerCase();
  holder.set(check.runtime);
  return {kind: 'accepted', runtime: check.runtime, changed};
}
