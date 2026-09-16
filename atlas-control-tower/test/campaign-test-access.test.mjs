import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const atlas = readFileSync(new URL('../src/atlas-v3/AtlasV3App.tsx', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../src/graph-engine/graph-entity-contract.ts', import.meta.url), 'utf8');

test('campaign remains a graph node and exposes generic access to its tests', () => {
  assert.match(contract, /MAP_ENTITY_TYPES[^\n]*CAMPAIGN/);
  assert.match(atlas, /String\(node\.type\s*\|\|\s*''\)\.toUpperCase\(\)\s*===\s*'CAMPAIGN'/);
  assert.match(atlas, /routeFor\('lab',\s*\{\s*entity:\s*node\.id,\s*kind:\s*'TEST'\s*\}\)/);
  assert.match(atlas, /Acessar testes/);
  assert.doesNotMatch(atlas, /node\.id.*PEER|node\.id.*OLYMPUS/);
});
