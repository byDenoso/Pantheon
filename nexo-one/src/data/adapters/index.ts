import { fixtureSource } from './fixture.ts';
import { remoteSource } from './remote.ts';
import { sourceKindForHost } from './select.ts';
import type { SystemDataSource } from './source.ts';

export { DataSourceError, assertSystemState } from './source.ts';
export type { SystemDataSource } from './source.ts';
export { fixtureSource } from './fixture.ts';
export { remoteSource, SYSTEM_ENDPOINT } from './remote.ts';
export { sourceKindForHost } from './select.ts';

/**
 * Browser publicado -> estado remoto real.
 * Node/localhost -> fixtures determinísticas para testes e regressão visual.
 */
const runtimeKind = typeof window === 'undefined' ? 'fixture' : sourceKindForHost(window.location.hostname);
export const activeSource: SystemDataSource = runtimeKind === 'remote' ? remoteSource : fixtureSource;

export const AVAILABLE_SOURCES: SystemDataSource[] = [fixtureSource, remoteSource];
