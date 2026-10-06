// Private-runtime replacement for data/adapters/index.ts (swapped at build time).
// There is no fixture source and no URL: the single source is the in-memory generation.
import type {SystemState} from '../contracts/system.ts';
import {DataSourceError, assertSystemState, type SystemDataSource} from '../data/adapters/source.ts';
import {runtimeHolder} from './state.ts';

export {DataSourceError, assertSystemState};
export type {SystemDataSource};

export const activeSource: SystemDataSource = {
  id: 'private-runtime',
  label: 'Runtime privado · geração em memória',
  kind: 'remote', // enables the live-source behaviours; no network is involved
  async load({signal}): Promise<SystemState> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const rt = runtimeHolder.get();
    if (!rt) throw new DataSourceError('UNAUTHORIZED', 'Runtime privado não carregado.');
    return structuredClone(rt.system);
  },
};
export const AVAILABLE_SOURCES: SystemDataSource[] = [activeSource];
