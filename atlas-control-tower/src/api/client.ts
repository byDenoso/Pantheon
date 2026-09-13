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

export function configuredBaseUrl(): string {
  return configuredRemoteBaseUrl() || '/api';
}

export function configuredStaticDataBaseUrl(): string {
  const appBase = String(import.meta.env.BASE_URL || '/').trim() || '/';
  const normalized = appBase.endsWith('/') ? appBase : `${appBase}/`;
  const staticSegment = 'data';
  return `${normalized}${staticSegment}`;
}

export function createConfiguredApi(): AtlasApiClient {
  const remoteBase = configuredRemoteBaseUrl();
  if (remoteBase) return createApi({ baseUrl: remoteBase, profile: 'atlas' as const }) as AtlasApiClient;
  return createStaticArtifactApi({ baseUrl: configuredStaticDataBaseUrl() }) as AtlasApiClient;
}

export function apiBaseLabel(): string {
  return configuredRemoteBaseUrl() || 'Runtime estático publicado';
}
