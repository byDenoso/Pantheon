import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('the main Grafos route mounts the reusable Neural surface', () => {
  const graph = read('src/pages/graphs-page.tsx');
  assert.match(graph, /AtlasNeuralSurface/);
});

test('opening Grafos from another graph layer resets the focus to the NEXO universe', () => {
  const app = read('src/App.tsx');
  assert.match(app, /area === 'graphs'[\s\S]*actions\.home\(\)/);
});

test('the embedded Neural surface and standalone route share the V3 loader', () => {
  const neural = read('src/atlas-v3/AtlasNeuralSurface.tsx');
  const standalone = read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(neural, /from '\.\/AtlasV3App'/);
  assert.match(neural, /AtlasNeuralSurface/);
  assert.match(standalone, /loadAtlasV3Snapshot/);
});
