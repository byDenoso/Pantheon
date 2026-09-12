import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/scene/CanvasGraphFallback.tsx', import.meta.url), 'utf8');
const atlasCanvas = fs.readFileSync(new URL('../src/scene/AtlasCanvas.tsx', import.meta.url), 'utf8');

test('Canvas fallback draws nodes, edges and labels from one animated canvas', () => {
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /getContext\(['"]2d['"]\)/);
  assert.match(source, /stroke\(/);
  assert.match(source, /fillText\(/);
  assert.match(source, /onNodeClick/);
});

test('R3F failure is contained by a real Canvas fallback', () => {
  assert.match(atlasCanvas, /CanvasErrorBoundary/);
  assert.match(atlasCanvas, /CanvasGraphFallback/);
  assert.match(atlasCanvas, /Renderer 3D indisponível/);
});
