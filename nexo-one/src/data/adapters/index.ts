import { fixtureSource } from './fixture.ts';
import { remoteSource } from './remote.ts';
import type { SystemDataSource } from './source.ts';

export { DataSourceError, assertSystemState } from './source.ts';
export type { SystemDataSource } from './source.ts';
export { fixtureSource } from './fixture.ts';
export { remoteSource, SYSTEM_ENDPOINT } from './remote.ts';

/**
 * Origem ativa do estado do sistema.
 * Trocar para `remoteSource` é a única mudança necessária quando o endpoint
 * real existir. A UI inteira continua igual.
 */
export const activeSource: SystemDataSource = fixtureSource;

export const AVAILABLE_SOURCES: SystemDataSource[] = [fixtureSource, remoteSource];
