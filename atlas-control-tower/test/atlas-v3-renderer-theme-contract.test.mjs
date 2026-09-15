import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const canvas = readFileSync(new URL('src/scene/AtlasCanvas.tsx', root), 'utf8');
const nodes = readFileSync(new URL('src/scene/InstancedNodes.tsx', root), 'utf8');
const fallback = readFileSync(new URL('src/scene/CanvasGraphFallback.tsx', root), 'utf8');

test('WebGL nodes and Canvas fallback receive the resolved theme', () => {
  assert.match(canvas, /<InstancedNodes[\s\S]*theme=\{theme\}/);
  assert.match(canvas, /<CanvasGraphFallback[\s\S]*theme=\{theme\}/);
  assert.match(nodes, /theme\?:\s*['"]dark['"]\s*\|\s*['"]light['"]/);
  assert.match(nodes, /theme\s*===\s*['"]light['"]/);
  assert.match(fallback, /theme\?:\s*['"]dark['"]\s*\|\s*['"]light['"]/);
  assert.match(fallback, /theme\s*===\s*['"]light['"]/);
});

test('Canvas camera uses a named framing scale for the wider orbital volume', () => {
  assert.match(canvas, /cameraDistanceForPresentation/);
  const camera = readFileSync(new URL('src/scene/camera-controls.ts', root), 'utf8');
  assert.match(camera, /CANVAS_CAMERA_SCALE/);
  assert.match(camera, /CANVAS_MOBILE_CAMERA_SCALE/);
});

test('light theme adds a dark readability edge to labels and graph marks', () => {
  const theme = readFileSync(new URL('src/atlas-v3/atlas-v3-theme.css', root), 'utf8');
  assert.match(theme, /data-theme="light"[^}]*\n[^}]*text-shadow/);
  assert.match(theme, /data-theme="light"[^}]*\.atlas-label[^}]*border-color/);
  assert.match(fallback, /theme === 'light'[^;]*strokeStyle|strokeStyle[^;]*theme === 'light'/);
});

test('Canvas fallback declutters labels instead of drawing overlapping text', () => {
  assert.match(fallback, /labelCandidates/);
  assert.match(fallback, /labelBoxes/);
  assert.match(fallback, /overlaps/);
  assert.match(fallback, /labelBudget/);
});
