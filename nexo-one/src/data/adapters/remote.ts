// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome somente SystemState v1. Em runtime normal usa GET /api/system;
// builds estáticos podem fornecer VITE_SYSTEM_ENDPOINT para apontar a uma projeção
// pública colocada junto dos assets (GitHub Pages usa ./system.json).
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

const configuredSystemEndpoint = import.meta.env?.VITE_SYSTEM_ENDPOINT?.trim();
export const SYSTEM_ENDPOINT = configuredSystemEndpoint || '/api/system';

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState público',
  kind: 'remote',
  async load({ signal }): Promise<SystemState> {
    // Pages publica um JSON versionado por deploy, mas o CDN pode manter o
    // mesmo caminho em cache por alguns minutos. A leitura do estado precisa
    // acompanhar o botão Recompilar e não servir um snapshot anterior.
    const requestUrl = SYSTEM_ENDPOINT.endsWith('.json')
      ? `${SYSTEM_ENDPOINT}${SYSTEM_ENDPOINT.includes('?') ? '&' : '?'}v=${Date.now()}`
      : SYSTEM_ENDPOINT;
    const response = await fetch(requestUrl, { signal, cache: 'no-store' });
    if (response.status === 404) {
      throw new DataSourceError('NOT_CONNECTED',
        `${SYSTEM_ENDPOINT} não está publicado nesta implantação.`);
    }
    if (!response.ok) {
      throw new DataSourceError('UNAVAILABLE', 'O servidor não retornou o estado público do sistema.');
    }
    return assertSystemState(await response.json());
  },
};
