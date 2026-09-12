import { createApi } from '../../lib/atlas-api.mjs';
import type { AtlasApiClient } from './types';

declare global {
  interface Window {
    __NEXO_API_BASE_URL__?: string;
  }
  const __NEXO_API_BASE_URL__: string | undefined;
}

export function configuredBaseUrl(): string {
  const viteBase = import.meta.env.VITE_NEXO_API_BASE_URL;
  const buildBase = typeof __NEXO_API_BASE_URL__ === 'string' ? __NEXO_API_BASE_URL__ : undefined;
  const runtimeBase = typeof window !== 'undefined' ? window.__NEXO_API_BASE_URL__ : undefined;
  const configured = String(viteBase || buildBase || runtimeBase || '').trim();
  if (!configured) return '/api';
  return configured.replace(/\/+$/, '');
}

export function createConfiguredApi(): AtlasApiClient {
  return createApi({ baseUrl: configuredBaseUrl() }) as AtlasApiClient;
}

export function apiBaseLabel(): string {
  const base = configuredBaseUrl();
  return base === '/api' ? 'API local' : base;
}
