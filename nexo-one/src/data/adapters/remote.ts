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
export const SYSTEM_ENDPOINT = configuredSystemEndpoint || '/api/system';

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
