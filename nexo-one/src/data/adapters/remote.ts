// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome SystemState v1 diretamente do backend NEXO em GET /api/system.
// O payload já contém o grafo canônico projetado para o Atlas em state.graph.
// Builds estáticos podem fornecer VITE_SYSTEM_ENDPOINT para uma projeção JSON.
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

const configuredSystemEndpoint = import.meta.env?.VITE_SYSTEM_ENDPOINT?.trim();

export function resolveSystemEndpoint(
  configuredEndpoint: string | undefined,
  baseUrl = import.meta.env?.BASE_URL || '/',
): string {
  if (!configuredEndpoint) return '/api/system';

  // Absolute URLs and root-absolute paths already have an unambiguous origin.
  if (/^[a-z][a-z\d+.-]*:/i.test(configuredEndpoint)
      || configuredEndpoint.startsWith('//')
      || configuredEndpoint.startsWith('/')) {
    return configuredEndpoint;
  }

  // Vite multi-page builds share one BASE_URL. Resolve relative static assets
  // against that deployment root, not against the current document directory.
  // Otherwise /Pantheon/atlas3d/ + ./system.json incorrectly becomes
  // /Pantheon/atlas3d/system.json instead of /Pantheon/system.json.
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${configuredEndpoint.replace(/^\.\//, '')}`;
}

export const SYSTEM_ENDPOINT = resolveSystemEndpoint(configuredSystemEndpoint);

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState público',
  kind: 'remote',

  async load({ signal, force }): Promise<SystemState> {
    const endpointPath = SYSTEM_ENDPOINT.split('?', 1)[0] ?? SYSTEM_ENDPOINT;
    const staticProjection = endpointPath.endsWith('.json');
    const separator = SYSTEM_ENDPOINT.includes('?') ? '&' : '?';
    const refresh = force && !staticProjection ? `${separator}refresh=1` : '';
    const requestUrl = `${SYSTEM_ENDPOINT}${refresh}`;

    const response = await fetch(requestUrl, {
      signal,
      // Static Pages assets keep a stable URL so the browser/CDN can revalidate
      // with ETag/Last-Modified instead of downloading a timestamp-busted copy.
      cache: staticProjection ? (force ? 'reload' : 'no-cache') : 'no-store',
    });

    if (response.status === 404) {
      throw new DataSourceError(
        'NOT_CONNECTED',
        `${SYSTEM_ENDPOINT} não está publicado nesta implantação.`,
      );
    }

    if (!response.ok) {
      throw new DataSourceError(
        'UNAVAILABLE',
        'O servidor não retornou o estado público do sistema.',
      );
    }

    return assertSystemState(await response.json());
  },
};
