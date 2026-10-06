// Private-area session controller. Framework-free and fully injectable so the
// late-response, route-change, logout and bfcache behaviours can be tested with
// synthetic mocks. React only subscribes (see usePrivateSession.ts).
//
// Invariants:
//  * `data` is non-null only while phase === 'authenticated'. Enforced in one place (commit()).
//  * Every async continuation re-checks a generation token; any wipe, login, logout,
//    revalidation or dispose invalidates all in-flight work. Stale results are dropped.
//  * There is NO compensating logout. The session cookie is shared by every tab, so an
//    old DELETE could revoke a newer session. Abandoned in-flight logins are left to
//    server expiry (documented limit).
//  * Local wipe is immediate; server revocation is tracked separately (`revocation`).
//  * Sign-out blocks automatic revalidation in that page until an explicit login
//    succeeds, including after bfcache restore, a peer sync or a route remount.

import {ApiError, fetchPrivate, fetchSession, login as apiLogin, logoutStrict, type Fetch, type LogoutResult} from './api.ts';

export type Phase = 'checking' | 'signedOut' | 'authenticating' | 'authenticated';
export type Notice = 'invalid' | 'not_configured' | 'unavailable' | 'rate_limited' | 'not_deployed' | 'contract';
export type Revocation = 'idle' | 'pending' | 'revoked' | 'unconfirmed';

export type PrivateState = {
  phase: Phase;
  notice: Notice | null;
  retryAfter: number | null;
  data: Record<string, unknown> | null;
  expiresAt: string | null;
  revocation: Revocation;
  revocationReason: string | null;
};

export const INITIAL_STATE: PrivateState = {
  phase: 'checking', notice: null, retryAfter: null, data: null, expiresAt: null, revocation: 'idle', revocationReason: null,
};

type Listener = () => void;
type EventTargetLike = {addEventListener(type: string, fn: (e: any) => void): void; removeEventListener(type: string, fn: (e: any) => void): void};
type RootLike = {setAttribute(k: string, v: string): void; removeAttribute(k: string): void};
export type ChannelLike = {postMessage(m: unknown): void; close(): void; onmessage: ((e: {data: unknown}) => void) | null};
export type LockManagerLike = {request<T>(name: string, cb: () => Promise<T>): Promise<T>};
export type TimerApi = {set(fn: () => void, ms: number): unknown; clear(h: unknown): void};

export type Deps = {
  fetch: Fetch;
  now?: () => number;
  win?: EventTargetLike | null;
  root?: RootLike | null;
  channel?: ChannelLike | null;
  timer?: TimerApi;
  serial?: Serializer;
  barrier?: SessionBarrier;
};

type BarrierState = {blocked: boolean; operation: string | null; revocation: Revocation; reason: string | null};
const OPEN_BARRIER: BarrierState = {blocked: false, operation: null, revocation: 'idle', reason: null};
// Only sign-out metadata is shared in page memory. It survives route remounts,
// including when a DELETE finishes after its original controller was disposed.
export function createSessionBarrier() {
  let value: BarrierState = OPEN_BARRIER;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: BarrierState) { value = next; listeners.forEach(l => l()); },
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
export type SessionBarrier = ReturnType<typeof createSessionBarrier>;
const pageBarrier = createSessionBarrier();
let operationSeq = 0;
const newOperation = () => `${Date.now()}:${++operationSeq}:${Math.random()}`;

export type Serializer = <T>(fn: () => Promise<T>) => Promise<T>;

export function createSerializer(locks?: LockManagerLike | null): Serializer {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = () => (locks ? locks.request('atlas-session-mutation', fn) : fn());
    const p = chain.then(run, run) as Promise<T>;
    chain = p.then(() => undefined, () => undefined);
    return p;
  };
}

// Shared by every controller instance in this page (covers remounts). Cross-tab
// ordering relies on navigator.locks when present.
let sharedSerial: Serializer | null = null;
export function defaultSerializer(): Serializer {
  if (!sharedSerial) {
    const locks = typeof navigator !== 'undefined' && (navigator as unknown as {locks?: LockManagerLike}).locks;
    sharedSerial = createSerializer(locks || null);
  }
  return sharedSerial;
}

const MAX_TIMER = 2_000_000_000;
const HIDDEN_ATTR = 'data-atlas-private';

export type PrivateController = {
  getSnapshot(): PrivateState;
  subscribe(l: Listener): () => void;
  start(): void;
  login(pin: string): Promise<void>;
  logout(): Promise<LogoutResult | null>;
  retryRevocation(): Promise<LogoutResult | null>;
  dispose(): void;
};

export function createPrivateSession(deps: Deps): PrivateController {
  const now = deps.now ?? (() => Date.now());
  const timer: TimerApi = deps.timer ?? {set: (fn, ms) => { const h = setTimeout(fn, ms) as unknown as {unref?: () => void}; h.unref?.(); return h; }, clear: h => clearTimeout(h as ReturnType<typeof setTimeout>)};
  const serial = deps.serial ?? defaultSerializer();
  const barrier = deps.barrier ?? pageBarrier;
  const f = deps.fetch;

  let state: PrivateState = INITIAL_STATE;
  const listeners = new Set<Listener>();
  let gen = 0;
  let disposed = false;
  let pageHidden = false;
  let pendingLogouts = 0;
  let unsubscribeBarrier: (() => void) | null = null;
  let aborter: AbortController | null = null;
  let expiryTimer: unknown = null;

  const commit = (patch: Partial<PrivateState>) => {
    const next = {...state, ...patch};
    if (next.phase !== 'authenticated') { next.data = null; next.expiresAt = null; }
    state = next;
    listeners.forEach(l => l());
  };

  const bump = () => {
    gen += 1;
    aborter?.abort();
    aborter = null;
    if (expiryTimer !== null) { timer.clear(expiryTimer); expiryTimer = null; }
    return gen;
  };
  const begin = () => {
    const my = bump();
    aborter = new AbortController();
    return {my, signal: aborter.signal};
  };
  const live = (my: number) => !disposed && my === gen;
  const post = (message: Record<string, unknown>) => { try { deps.channel?.postMessage(message); } catch { /* channel closed */ } };

  const noticeFor = (e: unknown): {notice: Notice; retryAfter: number | null} => {
    const code = e instanceof ApiError ? e.code : 'CONTRACT';
    switch (code) {
      case 'AUTH_REQUIRED': return {notice: 'invalid', retryAfter: null};
      case 'AUTH_NOT_CONFIGURED': return {notice: 'not_configured', retryAfter: null};
      case 'RATE_LIMITED': return {notice: 'rate_limited', retryAfter: e instanceof ApiError ? e.retryAfter : null};
      case 'NOT_DEPLOYED': return {notice: 'not_deployed', retryAfter: null};
      case 'CONTRACT': return {notice: 'contract', retryAfter: null};
      default: return {notice: 'unavailable', retryAfter: null};
    }
  };

  const armExpiry = (expiresAt: string, my: number) => {
    const ms = Date.parse(expiresAt) - now();
    if (!(ms > 0)) { wipeLocal('signedOut'); return; }
    expiryTimer = timer.set(() => { if (live(my)) wipeLocal('signedOut'); }, Math.min(ms, MAX_TIMER));
  };

  function wipeLocal(phase: Phase = 'signedOut', patch: Partial<PrivateState> = {}) {
    bump();
    commit({phase, notice: null, retryAfter: null, ...patch});
  }

  async function loadPrivate(my: number, signal: AbortSignal, expiresAt: string | null) {
    try {
      if (!expiresAt || !(Date.parse(expiresAt) > now())) { wipeLocal('signedOut'); return; }
      const p = await fetchPrivate(f, signal);
      if (!live(my)) return;
      if (!(Date.parse(expiresAt) > now())) { wipeLocal('signedOut'); return; }
      commit({phase: 'authenticated', data: p.data, expiresAt, notice: null, retryAfter: null, revocation: 'idle', revocationReason: null});
      armExpiry(expiresAt, my);
    } catch (e) {
      if (!live(my)) return;
      const n = noticeFor(e);
      commit({phase: 'signedOut', ...n}); // 401/503/anything: private state cleared
    }
  }

  async function revalidate() {
    if (disposed) return;
    if (barrier.get().blocked) { onBarrier(); return; }
    const {my, signal} = begin();
    commit({phase: 'checking', notice: null, retryAfter: null});
    try {
      const s = await fetchSession(f, signal);
      if (!live(my)) return;
      if (!s.configured) { commit({phase: 'signedOut', notice: 'not_configured'}); return; }
      if (!s.authenticated) { commit({phase: 'signedOut'}); return; }
      await loadPrivate(my, signal, s.expiresAt);
    } catch (e) {
      if (!live(my)) return;
      commit({phase: 'signedOut', ...noticeFor(e)});
    }
  }

  function onBarrier() {
    const b = barrier.get();
    if (!disposed && b.blocked) wipeLocal('signedOut', {revocation: b.revocation, revocationReason: b.reason});
  }

  const onPageHide = () => {
    pageHidden = true;
    try { deps.root?.setAttribute(HIDDEN_ATTR, 'hidden'); } catch { /* ignore */ }
    if (state.phase !== 'signedOut') wipeLocal('checking');
    else bump();
  };
  const onPageShow = (e: {persisted?: boolean}) => {
    if (!e?.persisted || disposed) return;
    pageHidden = false;
    // Keep the cached DOM hidden until fresh state has reached subscribers.
    // Removing the attribute first can reveal a pre-freeze React DOM snapshot.
    void revalidate().finally(revealCurrentPage);
  };
  function revealCurrentPage() {
    if (!disposed && !pageHidden) { try { deps.root?.removeAttribute(HIDDEN_ATTR); } catch { /* ignore */ } }
  }
  const onChannel = (e: {data: unknown}) => {
    if (disposed) return;
    const m = e.data as {t?: unknown; operation?: unknown; revoked?: unknown; reason?: unknown} | null;
    const t = m?.t;
    if (t === 'wipe' && typeof m?.operation === 'string') {
      barrier.set({blocked: true, operation: m.operation, revocation: 'pending', reason: null});
    } else if (t === 'revocation' && barrier.get().blocked && m?.operation === barrier.get().operation && typeof m?.revoked === 'boolean') {
      barrier.set({...barrier.get(), revocation: m.revoked ? 'revoked' : 'unconfirmed', reason: m.revoked ? null : typeof m.reason === 'string' ? m.reason : 'CONTRACT'});
    }
    else if (t === 'sync') void revalidate();
  };

  const self: PrivateController = {
    getSnapshot: () => state,
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
    start() {
      if (disposed || unsubscribeBarrier) return;
      unsubscribeBarrier = barrier.subscribe(onBarrier);
      deps.win?.addEventListener('pagehide', onPageHide);
      deps.win?.addEventListener('pageshow', onPageShow);
      if (deps.channel) deps.channel.onmessage = onChannel;
      // A previous controller may have been disposed while a bfcache restore
      // was checking its session. The new controller owns clearing that marker.
      void revalidate().finally(revealCurrentPage);
    },
    async login(pin) {
      if (disposed || state.phase === 'authenticating' || state.revocation === 'pending') return;
      const {my, signal} = begin();
      commit({phase: 'authenticating', notice: null, retryAfter: null});
      try {
        // The POST is deliberately NOT abortable: aborting client-side cannot prove the server
        // did not create the session, and logout is serialized behind it.
        const r = await serial(() => apiLogin(f, pin));
        if (!live(my)) return; // superseded: no compensating logout (see header)
        barrier.set(OPEN_BARRIER);
        commit({revocation: 'idle', revocationReason: null});
        post({t: 'sync'});
        await loadPrivate(my, signal, r.expiresAt);
      } catch (e) {
        if (!live(my)) return;
        commit({phase: 'signedOut', ...noticeFor(e)});
      }
    },
    async logout() {
      if (disposed) return null;
      const operation = newOperation();
      barrier.set({blocked: true, operation, revocation: 'pending', reason: null});
      onBarrier();
      post({t: 'wipe', operation});
      pendingLogouts++;
      let result: LogoutResult;
      try { result = await serial(() => logoutStrict(f)); }
      catch { result = {revoked: false, reason: 'AUTH_UNAVAILABLE', status: 0}; }
      // A later explicit login or logout supersedes this outcome. A failed
      // DELETE never triggers automatic loading in this tab or its peers.
      if (barrier.get().blocked && barrier.get().operation === operation) {
        barrier.set({blocked: true, operation, revocation: result.revoked ? 'revoked' : 'unconfirmed', reason: result.revoked ? null : result.reason});
      }
      post({t: 'revocation', operation, ...result});
      pendingLogouts--;
      if (disposed && pendingLogouts === 0) { try { deps.channel?.close(); } catch { /* ignore */ } }
      return result;
    },
    async retryRevocation() {
      if (disposed || state.revocation !== 'unconfirmed' || state.phase === 'authenticating') return null;
      return self.logout();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bump();
      unsubscribeBarrier?.(); unsubscribeBarrier = null;
      deps.win?.removeEventListener('pagehide', onPageHide);
      deps.win?.removeEventListener('pageshow', onPageShow);
      if (deps.channel) { deps.channel.onmessage = null; if (pendingLogouts === 0) { try { deps.channel.close(); } catch { /* ignore */ } } }
      listeners.clear();
      state = {...INITIAL_STATE};
    },
  };
  return self;
}
