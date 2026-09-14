import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AtlasContext } from './api/types';

// Internal area vocabulary is unchanged on purpose (graphs/observatory/lab/universe) --
// dozens of existing tests pin these literal strings via source-text regex against
// atlas-route.ts/App.tsx/graphs-page.tsx. The *public* URL contract from the locked
// route spec (/mapa, /pesquisa, /laboratorio, /cockpit, /atividade, /login) is layered
// on top via PUBLIC_PATH and LEGACY_PATH below, so the outside world sees the final
// route shape without an internal rename that would ripple through unrelated tests.
export type AtlasArea = 'graphs' | 'observatory' | 'lab' | 'universe' | 'cockpit' | 'atividade' | 'login' | 'landing';

export type AtlasRoute = {
  area: AtlasArea;
  path: string;
  context: AtlasContext;
};

const AREAS: AtlasArea[] = ['graphs', 'observatory', 'lab', 'universe', 'cockpit', 'atividade', 'login', 'landing'];

// Real domain ids are uppercase (domain:D1..D10); a URL typed or persisted in
// lowercase (domain:d1) must still resolve to the real node during graph-route
// hydration, or every downstream id comparison (buildLiveProjection,
// buildOrbitalNodes) silently fails and the graph falls back to an uncentered
// layout -- confirmed via a real browser repro, not a guess.
export function normalizeGraphHydrationId(id: string): string {
  return id.replace(/^domain:(.+)$/i, (_match, rest: string) => `domain:${rest.toUpperCase()}`);
}

// Locked public route contract: /graphs -> /mapa, /observatory and /universe -> /pesquisa
// (both fold into one consolidated public research index), /lab -> /laboratorio.
export const PUBLIC_PATH: Record<AtlasArea, string> = {
  graphs: 'mapa',
  observatory: 'pesquisa',
  universe: 'pesquisa',
  lab: 'laboratorio',
  cockpit: 'cockpit',
  atividade: 'atividade',
  login: 'login',
  landing: ''
};

// Legacy public prefixes that must redirect (preserving the rest of the path and the
// query string) to their PUBLIC_PATH equivalent above, rather than 404 or silently
// keep working forever as an undocumented second URL for the same screen.
const LEGACY_PREFIX_TO_AREA: Record<string, AtlasArea> = { graphs: 'graphs', observatory: 'observatory', universe: 'universe', lab: 'lab' };

export const PRIVATE_AREAS: ReadonlySet<AtlasArea> = new Set(['cockpit', 'atividade', 'lab']);

export function isPrivateArea(area: AtlasArea): boolean {
  return PRIVATE_AREAS.has(area);
}

const CONTEXT_KEYS: Array<keyof AtlasContext> = ['domain', 'query', 'dataset', 'source', 'period', 'redshift', 'status', 'scope', 'kind', 'entity'];

function resolveAppBase(): string {
  // Guarded so this module can also be imported directly by node:test (which has no
  // import.meta.env at all -- only Vite injects it), not just bundled by Vite.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (!env) return '/';
  return String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
}

const APP_BASE = resolveAppBase();

function stripAppBase(pathname: string): string {
  if (APP_BASE === '/') return pathname || '/';
  if (pathname === APP_BASE) return '/';
  if (pathname.startsWith(`${APP_BASE}/`)) return pathname.slice(APP_BASE.length) || '/';
  return pathname || '/';
}

/**
 * Rewrites a legacy public prefix (/graphs, /observatory, /universe, /lab) onto its
 * canonical PUBLIC_PATH prefix (/mapa, /pesquisa, /pesquisa, /laboratorio), keeping
 * every remaining segment untouched. Returns null when no legacy prefix matched, so
 * the caller can tell "already canonical" apart from "rewritten".
 */
export function rewriteLegacyPublicPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (!first) return null;
  const legacyArea = LEGACY_PREFIX_TO_AREA[first];
  if (!legacyArea) return null;
  const canonicalPrefix = PUBLIC_PATH[legacyArea];
  if (first === canonicalPrefix) return null; // already canonical (graphs/observatory/universe/lab happen to not collide with mapa/pesquisa/laboratorio, so this only guards future renames)
  return `/${[canonicalPrefix, ...segments.slice(1)].filter(Boolean).join('/')}`;
}

function withAppBase(pathname: string): string {
  if (APP_BASE === '/') return pathname;
  return `${APP_BASE}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function normalizeDomain(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : undefined;
}

// Reverse of PUBLIC_PATH (canonical word -> internal area), merged with the legacy
// words themselves so an old bookmark/link still parses to a real area instead of
// falling through to the default -- the visible URL upgrade happens separately via
// rewriteLegacyPublicPath, this map just makes sure both spellings resolve.
const AREA_BY_SEGMENT: Record<string, AtlasArea> = {
  mapa: 'graphs',
  pesquisa: 'observatory',
  laboratorio: 'lab',
  cockpit: 'cockpit',
  atividade: 'atividade',
  login: 'login',
  ...LEGACY_PREFIX_TO_AREA
};

export function readAtlasRoute(location: Pick<Location, 'pathname' | 'search'> = window.location): AtlasRoute {
  const pathname = stripAppBase(location.pathname || '/');
  const segments = pathname.split('/').filter(Boolean);
  const areaSegment = segments[0];
  const query = new URLSearchParams(location.search);
  let area: AtlasArea = (areaSegment && AREA_BY_SEGMENT[areaSegment]) || (areaSegment && AREAS.includes(areaSegment as AtlasArea) ? (areaSegment as AtlasArea) : 'landing');
  // /pesquisa and /universe share one public path (PUBLIC_PATH.observatory ===
  // PUBLIC_PATH.universe === 'pesquisa') by design -- but without this check every
  // link to 'universe' silently rendered ObservatoryPage instead, since the reverse
  // map (AREA_BY_SEGMENT.pesquisa) can only point at one area. ?scope=universo (set
  // by routeFor below) is the real, additive discriminator that makes UniversePage
  // reachable without splitting the shared public path or touching PUBLIC_PATH.
  if (area === 'observatory' && query.get('scope') === 'universo') area = 'universe';
  const domainSegment = area === 'graphs' && segments.length >= 3 && segments[1] === 'science' ? segments[2] : undefined;
  const graphPath = area === 'graphs' && segments.length > 1 ? segments.slice(1).map(segment => decodeURIComponent(segment)) : undefined;
  const context = Object.fromEntries(CONTEXT_KEYS.flatMap(key => {
    const value = key === 'domain' ? normalizeDomain(query.get(key) || domainSegment || null) : query.get(key)?.trim();
    return value ? [[key, value]] : [];
  })) as AtlasContext;
  if (graphPath?.length) context.graphPath = graphPath;
  return { area, path: pathname, context };
}

export function routeFor(area: AtlasArea, context: AtlasContext = {}): string {
  const domain = context.domain?.trim();
  const graphPath = area === 'graphs' ? context.graphPath?.filter(Boolean) : undefined;
  const publicPrefix = PUBLIC_PATH[area];
  const logicalPath =
    area === 'graphs' && graphPath?.length
      ? `/${publicPrefix}/${graphPath.map(encodeURIComponent).join('/')}`
      : area === 'graphs' && domain
        ? `/${publicPrefix}/science/${encodeURIComponent(domain.toLowerCase())}`
        : publicPrefix
          ? `/${publicPrefix}`
          : '/';
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    // 'scope' is a private discriminator between Observatory and Universe (both
    // sharing the /pesquisa path below), not a general-purpose passthrough value --
    // carrying it into an unrelated area's link (e.g. clicking "Grafos" while on
    // Resumo do Universo, which reuses the current route's context) produced URLs
    // like /mapa?scope=universo that don't mean anything for that area. It is only
    // ever set explicitly, below, for area === 'universe'.
    if (key === 'domain' || key === 'scope' || !context[key]) continue;
    query.set(key, String(context[key]));
  }
  // Universe shares /pesquisa's public path with Observatory (see PUBLIC_PATH); this
  // is the additive discriminator readAtlasRoute checks to render UniversePage
  // instead of ObservatoryPage. Set unconditionally (not merged from context) so
  // stray context never accidentally produces a bare /pesquisa for this area.
  if (area === 'universe') query.set('scope', 'universo');
  const path = withAppBase(logicalPath);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

function redirectLegacyPathIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const pathname = stripAppBase(window.location.pathname);
  const rewritten = rewriteLegacyPublicPath(pathname);
  if (!rewritten) return;
  const legacyArea = LEGACY_PREFIX_TO_AREA[pathname.split('/').filter(Boolean)[0] || ''];
  const query = new URLSearchParams(window.location.search);
  // A legacy /universe link collapses onto the same /pesquisa path as Observatory;
  // without re-adding the scope discriminator here, the redirect would silently
  // strip the one signal that tells readAtlasRoute to render UniversePage.
  if (legacyArea === 'universe' && !query.get('scope')) query.set('scope', 'universo');
  const search = query.toString();
  const target = withAppBase(rewritten) + (search ? `?${search}` : '') + window.location.hash;
  window.history.replaceState(window.history.state, '', target);
}

export function useAtlasRoute() {
  const [route, setRoute] = useState<AtlasRoute>(() => readAtlasRoute());
  useEffect(() => {
    // Legacy public prefixes (/graphs, /observatory, /universe, /lab) must upgrade
    // the visible URL to the canonical one (/mapa, /pesquisa, /laboratorio), not just
    // work silently forever as an undocumented second address for the same screen.
    // history.replaceState does not fire popstate, so without this the address bar
    // would change while the already-rendered area (read from the pre-redirect path
    // at the initial useState above) silently stayed stale -- re-reading the route
    // right after the rewrite keeps state and URL in sync on the very first paint.
    redirectLegacyPathIfNeeded();
    setRoute(readAtlasRoute());
  }, []);
  useEffect(() => {
    const onPopState = () => setRoute(readAtlasRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = useCallback((next: string | AtlasRoute) => {
    const href = typeof next === 'string' ? next : routeFor(next.area, next.context);
    window.history.pushState({}, '', href);
    setRoute(readAtlasRoute());
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  return useMemo(() => ({ route, navigate }), [navigate, route]);
}
