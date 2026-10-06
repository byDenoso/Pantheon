// Containment for the private frame. Installed BEFORE any legacy module runs.
//  * storage: only generic language/theme keys reach real storage; everything else is memory-only
//  * network: fetch is the in-memory adapter router; XHR/EventSource/WebSocket/sendBeacon/window.open are closed
//  * navigation: links that would leave this document are neutralised; native form posts are cancelled
import {createPrivateFetch} from './router.ts';
import type {RuntimeHolder} from './runtime.ts';

export const PERSISTABLE_KEYS: readonly string[] = ['nexo-theme', 'atlas.theme', 'atlas.locale'];

export type MemoryStorage = {
  readonly length: number; key(i: number): string | null; getItem(k: string): string | null;
  setItem(k: string, v: string): void; removeItem(k: string): void; clear(): void; dump(): Record<string, string>;
};

export function createGuardedStorage(real: () => Storage | null, allow: readonly string[] = PERSISTABLE_KEYS): MemoryStorage {
  const mem = new Map<string, string>();
  const backing = () => { try { return real(); } catch { return null; } };
  return {
    get length() { return mem.size; },
    key: i => [...mem.keys()][i] ?? null,
    getItem(k) {
      k = String(k);
      if (allow.includes(k)) { try { return backing()?.getItem(k) ?? mem.get(k) ?? null; } catch { return mem.get(k) ?? null; } }
      return mem.get(k) ?? null;
    },
    setItem(k, v) {
      k = String(k); v = String(v); mem.set(k, v);
      if (allow.includes(k)) { try { backing()?.setItem(k, v); } catch { /* memory only */ } }
    },
    removeItem(k) { k = String(k); mem.delete(k); if (allow.includes(k)) { try { backing()?.removeItem(k); } catch { /* ignore */ } } },
    clear() { mem.clear(); },
    dump: () => Object.fromEntries(mem),
  };
}

const closed = (name: string) => function Closed() { throw new Error(`PRIVATE_SHELL_${name}_CLOSED`); };

const SENSITIVE_PARAM = /^(?:access[_-]?token|id[_-]?token|refresh[_-]?token|token|auth|authorization|bearer|jwt|session|sessionid|sid|sig|signature|key|api[_-]?key|apikey|secret|client[_-]?secret|password|passwd|pwd|pin|otp|credential|credentials|code)$|(?:token|secret|password|passwd|apikey|api_key|credential)/i;
const MAX_URL = 2048;

/**
 * An outbound canonical-source link may be opened ONLY if it is absolute https, has no credentials, no sensitive query/fragment
 * parameters, is not this private origin, and is not a loopback/private/IP-literal host. The caller must additionally require a
 * trusted, explicit user gesture. Exported for tests.
 */
export function isApprovedSourceUrl(raw: unknown, ownOrigin: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL || /[\u0000-\u001f\s]/.test(raw)) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; } // relative / malformed => not an approved external source
  if (u.protocol !== 'https:' || u.username || u.password || u.origin === ownOrigin || !u.hostname) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') || h.startsWith('[') || /^\d+(\.\d+){3}$/.test(h)) return false;
  for (const [k] of u.searchParams) if (SENSITIVE_PARAM.test(k)) return false;
  const frag = u.hash.replace(/^#\/?/, '');
  if (frag.includes('=')) for (const [k] of new URLSearchParams(frag.replace(/^\?/, ''))) if (SENSITIVE_PARAM.test(k)) return false;
  return true;
}

/** Pure decision used by the click guard; exported for tests. */
export function linkStaysInDocument(href: string, base: string): boolean {
  let u: URL, b: URL;
  try { u = new URL(href, base); b = new URL(base); } catch { return false; }
  if (u.origin !== b.origin || u.pathname !== b.pathname || u.search !== b.search) return false;
  return u.hash !== '' || href.startsWith('#');
}

export type GuardTarget = any;
export type GuardHandle = {dispose(): void; denied: string[]; storage: {local: MemoryStorage; session: MemoryStorage}};

export function installGuards(win: GuardTarget, holder: RuntimeHolder): GuardHandle {
  const origin: string = win.location.origin;
  const denied: string[] = [];
  const realLocal = () => win.__realLocalStorage ?? null;
  // capture the real storage objects once, before shadowing
  let real: Storage | null = null;
  try { real = win.localStorage; } catch { real = null; }
  win.__realLocalStorage = real;
  const local = createGuardedStorage(() => realLocal());
  const session = createGuardedStorage(() => null);
  const def = (k: string, v: unknown) => Object.defineProperty(win, k, {value: v, configurable: true, writable: true});
  const defGet = (k: string, v: unknown) => Object.defineProperty(win, k, {get: () => v, configurable: true});
  defGet('localStorage', local); defGet('sessionStorage', session);
  def('fetch', createPrivateFetch(holder, origin, (p, r) => { denied.push(`${r}:${p}`); }));
  def('XMLHttpRequest', closed('XHR')); def('EventSource', closed('EVENTSOURCE')); def('WebSocket', closed('WEBSOCKET'));
  const nativeOpen: ((...a: unknown[]) => unknown) | null = typeof win.open === 'function' ? win.open.bind(win) : null;
  const gesture = () => { try { return win.navigator?.userActivation?.isActive === true; } catch { return false; } };
  /** The only exit: https source + live user activation; always a fresh tab without opener/referrer. */
  const openSource = (url: string): boolean => {
    if (!nativeOpen || !gesture() || !isApprovedSourceUrl(url, origin)) return false;
    nativeOpen(url, '_blank', 'noopener,noreferrer');
    return true;
  };
  def('open', (url?: unknown) => { denied.push(`OPEN:${String(url ?? '').slice(0, 60)}`); return null; });
  try { Object.defineProperty(win.navigator, 'sendBeacon', {value: () => false, configurable: true}); } catch { /* read-only navigator */ }

  const doc = win.document;
  const onClick = (e: any) => {
    const a = typeof e.target?.closest === 'function' ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (linkStaysInDocument(href, String(win.location.href))) return;
    // explicit, trusted left/middle click on a validated https source link: open it ourselves, safely
    const explicit = e.isTrusted === true && (e.type === 'click' ? (e.button ?? 0) === 0 : e.button === 1);
    if (explicit && isApprovedSourceUrl(a.href ?? href, origin) && openSource(String(a.href ?? href))) { e.preventDefault(); return; }
    e.preventDefault(); e.stopImmediatePropagation?.();
    a.setAttribute?.('data-private-blocked', 'true');
    a.setAttribute?.('aria-disabled', 'true');
    a.setAttribute?.('title', 'Link bloqueado: só fontes https validadas abrem, por clique explícito');
    denied.push(`LINK:${href.slice(0, 60)}`);
  };
  const onSubmit = (e: any) => { if (!e.defaultPrevented) e.preventDefault(); };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true);
  doc.addEventListener('submit', onSubmit, false);
  return {
    denied, storage: {local, session},
    dispose() {
      doc.removeEventListener('click', onClick, true); doc.removeEventListener('auxclick', onClick, true); doc.removeEventListener('submit', onSubmit, false);
      local.clear(); session.clear();
    },
  };
}
