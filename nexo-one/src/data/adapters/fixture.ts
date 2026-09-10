// Adapter de fixtures. Único adapter ativo neste estágio.
import type { SystemState } from '../../contracts/system.ts';
import { DEFAULT_SCENARIO_ID, scenarioById } from '../fixtures/scenarios.ts';
import { assertSystemState, type SystemDataSource } from './source.ts';

export const fixtureSource: SystemDataSource = {
  id: 'fixture',
  label: 'Fixtures determinísticas',
  kind: 'fixture',
  async load({ signal, scenarioId }): Promise<SystemState> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // A validação roda também sobre a fixture: o contrato vale para toda origem.
    return assertSystemState(scenarioById(scenarioId ?? DEFAULT_SCENARIO_ID).build());
  },
};
