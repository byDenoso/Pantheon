// ============================================================================
// PONTO DE INTEGRAÇÃO ÚNICO.
//
// Este arquivo é o único lugar do frontend que precisa mudar quando as fontes
// reais forem conectadas. Nenhum componente, view model ou rota conhece a
// origem dos dados: todos dependem de SystemDataSource.
//
// Escopo deste estágio: NÃO implementar OAuth, secrets, acesso a Google,
// GitHub, Vercel, SSoT, ACTION_REGISTER, automações, scheduler ou writes.
// O adapter abaixo declara o formato esperado e falha de forma explícita.
//
// Para conectar depois:
//   1. Um endpoint servidor deve responder SystemState v1 em GET /api/system.
//      A composição (providers, capabilities, readbacks) acontece no servidor,
//      que já é quem detém as credenciais. O browser nunca vê secret.
//   2. Trocar `activeSource` em src/data/adapters/index.ts por `remoteSource`.
//   3. assertSystemState() já rejeita payload fora do contrato; nenhuma outra
//      validação precisa ser duplicada na UI.
//
// Mapa de responsabilidade por seção do contrato:
//   providers[]      <- health de cada provider (server/adapters/registry.mjs)
//   capabilities[]   <- declaração + evidência de execução (capability registry)
//   findings[]       <- comparação provider esperado x observado (TruthGraph)
//   actions[]        <- ACTION_REGISTER
//   runs[]           <- execuções e recibos
//   inbox[]          <- human gates abertos no ACTION_REGISTER
//   envelopes[]/bus  <- Universal Projection Bus
//   graph            <- Graph Contract V1 do Atlas
//   filaments[]      <- Semantic/Procedural Memory
// ============================================================================
import type { SystemState } from '../../contracts/system.ts';
import { DataSourceError, assertSystemState, type SystemDataSource } from './source.ts';

export const SYSTEM_ENDPOINT = '/api/system';

export const remoteSource: SystemDataSource = {
  id: 'remote',
  label: 'Servidor NEXO (não conectado)',
  kind: 'remote',
  async load({ signal }): Promise<SystemState> {
    const response = await fetch(SYSTEM_ENDPOINT, { signal, credentials: 'same-origin' });
    if (response.status === 401 || response.status === 403) {
      throw new DataSourceError('UNAUTHORIZED', 'Sessão privada necessária para ler o estado do sistema.');
    }
    if (response.status === 404) {
      throw new DataSourceError('NOT_CONNECTED',
        `${SYSTEM_ENDPOINT} ainda não existe. A camada de integração não foi conectada.`);
    }
    if (!response.ok) {
      throw new DataSourceError('UNAVAILABLE', 'O servidor não retornou o estado do sistema.');
    }
    return assertSystemState(await response.json());
  },
};
