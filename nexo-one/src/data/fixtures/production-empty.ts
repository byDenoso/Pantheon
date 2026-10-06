// Build-time replacement only: deterministic development datasets never enter
// a public client bundle. Data is read from the authenticated backend instead.
export const DEFAULT_SCENARIO_ID = 'unavailable';
export const SCENARIOS = [{id: DEFAULT_SCENARIO_ID, label: 'Unavailable', description: 'Authentication required', build: () => {throw new Error('FIXTURES_DISABLED_IN_PRODUCTION');}}];
export const scenarioById = () => SCENARIOS[0];
