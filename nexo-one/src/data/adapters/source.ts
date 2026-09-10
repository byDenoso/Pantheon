// DataSource -> Adapter -> Contract -> ViewModel -> UI
// A UI depende SOMENTE desta interface. Trocar a origem dos dados não toca em componente algum.
import type { SystemState } from '../../contracts/system.ts';

export type DataSourceErrorCode = 'UNAUTHORIZED' | 'UNAVAILABLE' | 'CONTRACT_MISMATCH' | 'NOT_CONNECTED';

export class DataSourceError extends Error {
  code: DataSourceErrorCode;
  constructor(code: DataSourceErrorCode, message: string) {
    super(message);
    this.name = 'DataSourceError';
    this.code = code;
  }
}

export interface SystemDataSource {
  id: string;
  label: string;
  /** Origem real dos dados. `fixture` nunca deve chegar a produção sem rótulo visível. */
  kind: 'fixture' | 'remote';
  load(options: { signal?: AbortSignal; scenarioId?: string }): Promise<SystemState>;
}

/**
 * Validação de fronteira. Um payload fora do contrato é rejeitado em vez de degradar em silêncio,
 * exatamente como o adapter do Atlas já faz no servidor.
 */
export function assertSystemState(value: unknown): SystemState {
  const state = value as SystemState;
  const wellFormed = !!state
    && state.contract_version === '1'
    && Array.isArray(state.envelopes)
    && Array.isArray(state.findings)
    && Array.isArray(state.actions)
    && Array.isArray(state.inbox)
    && Array.isArray(state.capabilities)
    && Array.isArray(state.runs)
    && Array.isArray(state.lanes)
    && Array.isArray(state.filaments)
    && Array.isArray(state.providers)
    && !!state.graph && Array.isArray(state.graph.nodes) && Array.isArray(state.graph.edges)
    && !!state.bus && typeof state.bus.fingerprint === 'string';
  if (!wellFormed) throw new DataSourceError('CONTRACT_MISMATCH', 'A resposta não obedece ao contrato SystemState v1.');
  const unprovenanced = state.envelopes.find(e => !e.source_ref || !e.fingerprint || !e.freshness);
  if (unprovenanced) {
    throw new DataSourceError('CONTRACT_MISMATCH',
      `Envelope ${unprovenanced.entity_id} sem proveniência completa (source_ref, fingerprint, freshness).`);
  }
  const authoritative = state.envelopes.find(e => e.authoritative !== false);
  if (authoritative) {
    throw new DataSourceError('CONTRACT_MISMATCH',
      `Envelope ${authoritative.entity_id} declarou-se autoritativo. Projeções são sempre NON_AUTHORITATIVE.`);
  }
  return state;
}
