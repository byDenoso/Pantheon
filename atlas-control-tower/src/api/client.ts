import { createApi } from '../../lib/atlas-api.mjs';
import { createStaticArtifactApi } from '../../lib/static-artifact-api.mjs';
import type { AtlasApiClient } from './types';

declare global {
  interface Window {
    __NEXO_API_BASE_URL__?: string;
  }
  const __NEXO_API_BASE_URL__: string | undefined;
}

function configuredRemoteBaseUrl(): string {
  const viteBase = import.meta.env.VITE_NEXO_API_BASE_URL;
  const buildBase = typeof __NEXO_API_BASE_URL__ === 'string' ? __NEXO_API_BASE_URL__ : undefined;
  const runtimeBase = typeof window !== 'undefined' ? window.__NEXO_API_BASE_URL__ : undefined;
  const configured = String(viteBase || buildBase || runtimeBase || '').trim();
  return configured ? configured.replace(/\/+$/, '') : '';
}

// The canonical Vercel deployment exposes the Node endpoints under the same
// origin. This keeps production on the live API even when no build-time env var
// was injected, while GitHub Pages and localhost continue to use the signed
// static artifact runtime.
export function shouldUseSameOriginApi(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
}

export function configuredBaseUrl(): string {
  return configuredRemoteBaseUrl() || '/api';
}

export function configuredStaticDataBaseUrl(): string {
  const appBase = String(import.meta.env.BASE_URL || '/').trim() || '/';
  const normalized = appBase.endsWith('/') ? appBase : `${appBase}/`;
  const staticSegment = 'data';
  return `${normalized}${staticSegment}`;
}

export function createResilientApi(primary: AtlasApiClient, fallback: AtlasApiClient): AtlasApiClient {
  let lastSource: 'primary' | 'fallback' = 'primary';

  async function call(method: string, ...args: unknown[]) {
    const primaryFn = (primary as unknown as Record<string, unknown>)[method];
    if (typeof primaryFn !== 'function') throw new Error(`PRIMARY_API_METHOD_MISSING:${method}`);
    try {
      const value = await (primaryFn as (...values: unknown[]) => Promise<unknown>)(...args);
      lastSource = 'primary';
      return value;
    } catch (primaryError) {
      const fallbackFn = (fallback as unknown as Record<string, unknown>)[method];
      if (typeof fallbackFn !== 'function') throw primaryError;
      const value = await (fallbackFn as (...values: unknown[]) => Promise<unknown>)(...args);
      lastSource = 'fallback';
      return value;
    }
  }

  return {
    get remote() { return primary.remote; },
    get provenance() { return lastSource === 'fallback' ? fallback.provenance : primary.provenance; },
    clear() {
      primary.clear?.();
      fallback.clear?.();
      lastSource = 'primary';
    },
    graph: query => call('graph', query) as ReturnType<AtlasApiClient['graph']>,
    state: query => call('state', query),
    health: () => call('health'),
    entity: (id, view) => call('entity', id, view),
    lineage: id => call('lineage', id) as ReturnType<AtlasApiClient['lineage']>,
    learning: () => call('learning'),
    learningFor: id => call('learningFor', id),
    ops: () => call('ops'),
    automationRuns: () => call('automationRuns'),
    audit: () => call('audit'),
    files: id => call('files', id),
    sync: () => primary.sync(),
    research: (route, query) => primary.research(route, query)
  };
}

export function createConfiguredApi(): AtlasApiClient {
  const remoteBase = configuredRemoteBaseUrl();
  if (remoteBase) return createApi({ baseUrl: remoteBase, profile: 'atlas' as const }) as AtlasApiClient;
  if (shouldUseSameOriginApi()) {
    const primary = createApi({ baseUrl: '/api', profile: 'atlas' as const }) as AtlasApiClient;
    const fallback = createStaticArtifactApi({ baseUrl: configuredStaticDataBaseUrl() }) as AtlasApiClient;
    return createResilientApi(primary, fallback);
  }
  return createStaticArtifactApi({ baseUrl: configuredStaticDataBaseUrl() }) as AtlasApiClient;
}

export function apiBaseLabel(): string {
  return configuredRemoteBaseUrl() || (shouldUseSameOriginApi() ? 'API do próprio site · fallback estático' : 'Runtime estático publicado');
}
