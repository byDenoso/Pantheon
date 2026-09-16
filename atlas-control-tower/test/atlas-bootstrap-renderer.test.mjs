import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('the 2D Atlas canvas does not bootstrap the legacy Three renderer', () => {
  const canvas = read('src/scene/AtlasCanvas.tsx');
  assert.doesNotMatch(canvas, /createAtlasRenderer/);
  assert.match(canvas, /CanvasGraphFallback/);
});
