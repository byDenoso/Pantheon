import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/viewmodels/graph25d.ts', import.meta.url), 'utf8');

test('2.5D projection is a pure deterministic Canvas-oriented view model', () => {
  assert.match(source, /export function graphBounds25D/);
  assert.match(source, /export function projectGraph25D/);
  assert.match(source, /depthScale/);
  assert.doesNotMatch(source, /@babylonjs|WebGL|THREE|forceSimulation/);
});

test('2.5D projection keeps semantic depth bounded and sorts deterministically', () => {
  assert.match(source, /Math\.max\(0\.82, Math\.min\(1\.18/);
  assert.match(source, /sort\(\(a, b\) => a\.depth - b\.depth \|\| a\.id\.localeCompare\(b\.id\)\)/);
});
