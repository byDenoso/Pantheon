import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adapters = fs.readFileSync(new URL('../src/api/adapters.ts', import.meta.url), 'utf8');
const graphs = fs.readFileSync(new URL('../src/pages/graphs-page.tsx', import.meta.url), 'utf8');
const filters = fs.readFileSync(new URL('../src/components/shell/MapFilters.tsx', import.meta.url), 'utf8');

test('health parser preserves source provenance fields exposed by the API', () => {
  assert.match(adapters, /source:\s*text\(source\.source\)/);
  assert.match(adapters, /sourceVersion:\s*text\(source\.sourceVersion\)/);
  assert.match(adapters, /authority:\s*text\(source\.authority\)/);
  assert.match(adapters, /projectionOnly:\s*typeof source\.projectionOnly === 'boolean'/);
});

test('graph context falls back to graph metadata when health is not ready', () => {
  assert.match(graphs, /graph\?\.freshness/);
  assert.match(graphs, /graph\?\.authority/);
  assert.match(graphs, /graph\?\.sourceVersion/);
});

test('source control shows the known global projection source instead of unavailable', () => {
  assert.match(filters, /sourceLabel/);
  assert.doesNotMatch(filters, />Indisponível</);
});
