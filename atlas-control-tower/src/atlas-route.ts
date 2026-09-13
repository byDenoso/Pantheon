import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AtlasContext } from './api/types';

export type AtlasArea = 'observatory' | 'lab' | 'universe';

export type AtlasRoute = {
  area: AtlasArea;
  path: string;
  context: AtlasContext;
};

const AREAS: AtlasArea[] = ['observatory', 'lab', 'universe'];
const LEGACY_GRAPH_AREA = 'graphs';
const CONTEXT_KEYS: Array<keyof AtlasContext> = ['domain', 'query', 'dataset', 'source', 'period', 'redshift', 'status', 'scope'];
const APP_BASE = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';

function stripAppBase(pathname: string): string {
  if (APP_BASE === '/') return pathname || '/observatory';
  if (pathname === APP_BASE) return '/';
  if (pathname.startsWith(`${APP_BASE}/`)) return pathname.slice(APP_BASE.length) || '/';
  return pathname || '/observatory';
}

function withAppBase(pathname: string): string {
  if (APP_BASE === '/') return pathname;
  return `${APP_BASE}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function normalizeDomain(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.toUpperCase() : undefined;
}

function normalizeGraphPath(value: string | null): string[] | undefined {
  if (!value?.trim()) return undefined;
  const segments = value.split('/').map(segment => decodeURIComponent(segment.trim())).filter(Boolean);
  return segments.length ? segments : undefined;
}

export function readAtlasRoute(location: Pick<Location, 'pathname' | 'search'> = window.location): AtlasRoute {
  const pathname = stripAppBase(location.pathname || '/observatory');
  const segments = pathname.split('/').filter(Boolean);
  const areaSegment = segments[0];
  const legacyGraphRoute = areaSegment === LEGACY_GRAPH_AREA;
  const area: AtlasArea = legacyGraphRoute ? 'observatory' : AREAS.includes(areaSegment as AtlasArea) ? areaSegment as AtlasArea : 'observatory';
  const query = new URLSearchParams(location.search);
  const domainSegment = legacyGraphRoute && segments.length >= 3 && segments[1] === 'science' ? segments[2] : undefined;
  const legacyGraphPath = legacyGraphRoute && segments.length > 1 ? segments.slice(1).map(segment => decodeURIComponent(segment)) : undefined;
  const graphPath = legacyGraphPath || normalizeGraphPath(query.get('path'));
  const context = Object.fromEntries(CONTEXT_KEYS.flatMap(key => {
    const value = key === 'domain' ? normalizeDomain(query.get(key) || domainSegment || null) : query.get(key)?.trim();
    return value ? [[key, value]] : [];
  })) as AtlasContext;
  if (graphPath?.length) context.graphPath = graphPath;
  return { area, path: pathname, context };
}

export function routeFor(area: AtlasArea, context: AtlasContext = {}): string {
  const logicalPath = `/${area}`;
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    if (!context[key]) continue;
    query.set(key, String(context[key]));
  }
  if (area === 'observatory' && context.graphPath?.filter(Boolean).length) {
    query.set('path', context.graphPath.filter(Boolean).join('/'));
  }
  const path = withAppBase(logicalPath);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

export function useAtlasRoute() {
  const [route, setRoute] = useState<AtlasRoute>(() => readAtlasRoute());
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