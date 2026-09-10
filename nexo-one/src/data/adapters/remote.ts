// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome somente SystemState v1 em GET /api/system. Nenhum componente,
// view model ou superfície conhece Google, GitHub, Vercel, SSOT, ACTION_REGISTER,
// automações ou credenciais; a composição acontece exclusivamente no servidor.
// A superfície publicada é read-only e contém apenas projeções explicitamente públicas.
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

export const SYSTEM_ENDPOINT = '/api/system';

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState público',
  kind: 'remote',
  async load({ signal }): Promise<SystemState> {
    const response = await fetch(SYSTEM_ENDPOINT, { signal });
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
