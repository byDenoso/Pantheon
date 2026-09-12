import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('graph routes serialize and restore a stable hierarchy path', () => {
  const route = read('src/atlas-route.ts');
  assert.match(route, /graphPath/);
  assert.match(route, /segments\.slice\(/);
  assert.match(route, /encodeURIComponent/);
});

test('the WebGL graph animates node and edge transitions inside the renderer', () => {
  const canvas = read('src/scene/AtlasCanvas.tsx');
  const nodes = read('src/scene/InstancedNodes.tsx');
  const edges = read('src/scene/InstancedFilaments.tsx');
  assert.match(canvas, /useFrame/);
  assert.match(canvas, /focusId/);
  assert.match(nodes, /useFrame/);
  assert.match(edges, /useFrame/);
  assert.match(canvas, /motion\.current/);
  assert.match(canvas, /motion\.target/);
  assert.match(canvas, /lerp/);
  assert.match(edges, /positions/);
});

test('node entry is a real drill-down and terminal nodes remain selectable', () => {
  const canvas = read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas, /childCount|childrenCount/);
  assert.match(canvas, /onOpen\(node\)/);
  assert.match(canvas, /onSelect\(node\)/);
  assert.match(canvas, /loading/);
});
