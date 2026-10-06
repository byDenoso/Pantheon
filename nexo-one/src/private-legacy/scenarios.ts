// Swapped in for data/fixtures/scenarios.ts: the private bundle carries no fixtures.
// App reads SCENARIOS[0] for fixture-only labels; with a live source they are never rendered.
export interface Scenario {id: string; label: string; description: string; build: () => never}
export const DEFAULT_SCENARIO_ID = 'private-runtime';
export const SCENARIOS: Scenario[] = [{id: DEFAULT_SCENARIO_ID, label: 'Runtime privado', description: '', build: () => { throw new Error('NO_FIXTURES_IN_PRIVATE_SHELL'); }}];
export const scenarioById = (_id: string): Scenario => SCENARIOS[0]!;
