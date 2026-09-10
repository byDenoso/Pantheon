// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// O frontend consome somente SystemState v1 em GET /api/system. Nenhum componente,
// view model ou superfície conhece Google, GitHub, Vercel, SSOT, ACTION_REGISTER,
// automações ou credenciais; a composição acontece exclusivamente no servidor.
//
// Mapa de responsabilidade por seção do contrato:
//   providers[]      <- provider registry + AUTOMATION_HEALTH projetado
//   capabilities[]   <- ACTION_REGISTER/CAPABILITY_MATRIX
//   findings[]       <- TruthGraph
//   actions[]        <- ACTION_REGISTER/ACTIONS
//   runs[]           <- ACTION_REGISTER/EXECUTION_RUNS
//   inbox[]          <- SIDE_QUESTS HUMAN/WAITING
//   envelopes[]/bus  <- Universal Projection Bus
//   graph            <- derivado do mesmo SystemState
//   filaments[]      <- LEARNING_FILAMENTS
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

export const SYSTEM_ENDPOINT = '/api/system';

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO · SystemState',
  kind: 'remote',
  async load({ signal }): Promise<SystemState> {
    const response = await fetch(SYSTEM_ENDPOINT, { signal, credentials: 'same-origin' });
    if (response.status === 401 || response.status === 403) {
      throw new DataSourceError('UNAUTHORIZED', 'Sessão privada necessária para ler o estado do sistema.');
    }
    if (response.status === 404) {
      throw new DataSourceError('NOT_CONNECTED',
        `${SYSTEM_ENDPOINT} não está publicado nesta implantação.`);
    }
    if (!response.ok) {
      throw new DataSourceError('UNAVAILABLE', 'O servidor não retornou o estado do sistema.');
    }
    return assertSystemState(await response.json());
  },
};
