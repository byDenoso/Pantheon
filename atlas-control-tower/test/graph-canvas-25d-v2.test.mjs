import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const exists = path => existsSync(new URL(path, root));

test('2.5D graph isolates camera motion and pointer parallax in a dedicated controller', () => {
  assert.equal(exists('src/scene/CameraController.tsx'), true);
  const source = read('src/scene/CameraController.tsx');
  assert.match(source, /pointermove/);
  assert.match(source, /autoRotate/);
  assert.match(source, /damping/);
  assert.match(source, /prefers-reduced-motion|reducedMotion/);
});

test('graph UI exposes a compact bottom control dock and a demand-driven inspector', () => {
  assert.equal(exists('src/components/GraphControlDock.tsx'), true);
  assert.equal(exists('src/components/GraphInspector.tsx'), true);
  const dock = read('src/components/GraphControlDock.tsx');
  const inspector = read('src/components/GraphInspector.tsx');
  assert.match(dock, /Movimento/);
  assert.match(dock, /Reset/);
  assert.match(dock, /Zoom/);
  assert.match(dock, /Camadas/);
  assert.match(dock, /Foco/);
  assert.match(inspector, /Ver subgrafo/);
  assert.match(inspector, /Proveniência/);
});

test('graph includes a minimap and projected HTML labels instead of putting UI inside WebGL', () => {
  assert.equal(exists('src/components/GraphMinimap.tsx'), true);
  const scene = read('src/graph-engine/GraphScene3D.tsx');
  const labels = read('src/scene/LabelOverlay.tsx');
  assert.match(scene, /GraphMinimap/);
  assert.match(labels, /atlas-label/);
});

test('Learning is an overlay over the structural graph and never replaces the base edges', () => {
  const scene = read('src/graph-engine/GraphScene3D.tsx');
  assert.match(scene, /projection\.edges/);
  assert.match(scene, /learningEdges/);
  assert.match(scene, /learning-overlay/);
});

test('a single navigable-node click enters its subgraph instead of requiring a repeated click', () => {
  const page = read('src/pages/GraphsV2Page.tsx');
  assert.doesNotMatch(page, /selectedId===id/);
  assert.match(page, /openNode|navigateNode|enterNode/);
});
