// Locale controller: saved manual choice > server (Accept-Language, trusted CDN country)
// > browser language > pt-BR. Only the manual choice is persisted. No IP is sent anywhere
// by this module; the server call is same-origin.
import {fetchLocale, isLocale, type Fetch, type Locale} from '../atlas/api.ts';

export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const STORAGE_KEY = 'atlas.locale';

export type LocaleMode = 'auto' | 'manual';
export type LocaleState = {locale: Locale; mode: LocaleMode; source: string; persisted: boolean};

type StorageLike = {getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void};
type Listener = () => void;
type EventTargetLike = {addEventListener(t: string, f: (e: any) => void): void; removeEventListener(t: string, f: (e: any) => void): void};

export type LocaleDeps = {
  fetch: Fetch;
  /** may throw (privacy modes); must never be required for correctness */
  storage?: () => StorageLike | null;
  languages?: readonly string[];
  win?: EventTargetLike | null;
};

export function fromBrowserLanguages(langs: readonly string[] | undefined): Locale {
  for (const l of langs ?? []) {
    const t = String(l).toLowerCase();
    if (t.startsWith('pt')) return 'pt-BR';
    if (t.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

export function createLocaleController(deps: LocaleDeps) {
  // undefined follows storage; null is a local automatic override if removal
  // failed; a locale is a manual choice whose persistence failed.
  let memoryManual: Locale | null | undefined;
  const readStored = (): Locale | null => {
    try {
      const v = deps.storage?.()?.getItem(STORAGE_KEY);
      return isLocale(v) ? v : null;
    } catch { return null; }
  };
  const readManual = (): Locale | null => memoryManual !== undefined ? memoryManual : readStored();

  const browser = fromBrowserLanguages(deps.languages);
  const manual0 = readManual();
  let state: LocaleState = manual0
    ? {locale: manual0, mode: 'manual', source: 'manual', persisted: readStored() !== null}
    : {locale: browser, mode: 'auto', source: 'browser', persisted: false};

  const listeners = new Set<Listener>();
  let gen = 0;
  let aborter: AbortController | null = null;
  let disposed = false;
  let serverMemo: {locale: Locale; source: string} | null = null;

  const set = (s: LocaleState) => { state = s; listeners.forEach(l => l()); };

  async function serverLocale(signal: AbortSignal) {
    // memoise only a definitive answer; failures stay retryable
    if (serverMemo) return serverMemo;
    try {
      const r = await fetchLocale(deps.fetch, null, signal);
      if (signal.aborted) return null;
      serverMemo = {locale: r.locale, source: r.source};
      return serverMemo;
    } catch { return null; }
  }

  async function resolveAuto() {
    const my = ++gen;
    aborter?.abort();
    aborter = new AbortController();
    const res = await serverLocale(aborter.signal);
    // triple guard: generation, still automatic, manual choice not saved meanwhile
    if (disposed || my !== gen || state.mode !== 'auto') return;
    const saved = readManual();
    if (saved !== null) { set({locale: saved, mode: 'manual', source: 'manual', persisted: readStored() !== null}); return; }
    if (res) set({locale: res.locale, mode: 'auto', source: res.source, persisted: false});
    else set({locale: browser, mode: 'auto', source: 'browser', persisted: false});
  }

  const onStorage = (e: {key?: string | null}) => {
    if (disposed || (e.key && e.key !== STORAGE_KEY)) return;
    const m = readStored();
    memoryManual = undefined;
    if (m) { gen++; aborter?.abort(); set({locale: m, mode: 'manual', source: 'manual', persisted: true}); }
    else {
      // A storage notification only reads the shared preference. Writing here
      // could remove a newer choice made concurrently in the originating tab.
      gen++;
      set({locale: browser, mode: 'auto', source: 'browser', persisted: false});
      void resolveAuto();
    }
  };

  async function setAuto() {
    if (disposed) return;
    memoryManual = null;
    try {
      deps.storage?.()?.removeItem(STORAGE_KEY);
      if (readStored() === null) memoryManual = undefined;
    } catch { /* the in-memory automatic override remains authoritative */ }
    gen++;
    set({locale: browser, mode: 'auto', source: 'browser', persisted: false});
    await resolveAuto();
  }

  return {
    getSnapshot: () => state,
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
    start() {
      if (disposed) return;
      deps.win?.addEventListener('storage', onStorage);
      if (state.mode === 'auto') void resolveAuto();
    },
    choose(locale: Locale) {
      if (!isLocale(locale) || disposed) return;
      gen++; aborter?.abort();
      memoryManual = locale;
      let persisted = false;
      try { deps.storage?.()?.setItem(STORAGE_KEY, locale); persisted = readStored() === locale; } catch { persisted = false; }
      if (persisted) memoryManual = undefined;
      set({locale, mode: 'manual', source: 'manual', persisted});
    },
    setAuto,
    dispose() {
      disposed = true; gen++; aborter?.abort();
      deps.win?.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}
export type LocaleController = ReturnType<typeof createLocaleController>;
