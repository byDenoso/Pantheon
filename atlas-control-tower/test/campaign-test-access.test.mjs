import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../src/graph-engine/graph-entity-contract.ts', import.meta.url), 'utf8');

test('campaign remains a graph node and exposes a generic test-access link', () => {
  assert.match(contract, /MAP_ENTITY_TYPES[^\n]*CAMPAIGN/);
  assert.match(app, /String\(selected\.type \|\| ''\)\.toUpperCase\(\) === 'CAMPAIGN'/);
  assert.match(app, /routeFor\('lab',\s*\{\s*entity:\s*state\.selectedId,\s*kind:\s*'TEST'\s*\}\)/);
  assert.match(app, /Acessar testes/);
  assert.doesNotMatch(app, /selected\.id.*PEER|selected\.id.*OLYMPUS/);
});
