import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('published shell does not mount the legacy projection overlay that probes /api/projections', async () => {
  const main = await text('src/main.tsx');
  assert.doesNotMatch(main, /ProjectionBusStatus/);
  assert.doesNotMatch(main, /<ProjectionBusStatus\s*\/>/);
});

test('Canvas galaxy exposes explicit navigation controls in addition to gestures', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas, /aria-label="Girar para a esquerda"/);
  assert.match(canvas, /aria-label="Girar para a direita"/);
  assert.match(canvas, /aria-label="Aproximar"/);
  assert.match(canvas, /aria-label="Afastar"/);
  assert.match(canvas, /onPointerMove/);
  assert.match(canvas, /onWheel=/);
});

test('Atlas active surface prefers procedural Three.js and keeps deterministic Canvas fallback', async () => {
  const [canvas,adapter,router,three,view,graph] = await Promise.all([
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/AtlasCanvas25D.tsx'),
    text('src/components/AtlasGalaxy.tsx'),
    text('src/components/ThreeGalaxy.tsx'),
    text('src/features/system/Atlas.tsx'),
    text('src/viewmodels/graph3d.ts'),
  ]);
  assert.match(canvas, /data-renderer="canvas-2\.5d"/);
  assert.match(canvas, /getContext\('2d'/);
  assert.match(adapter, /GALAXY_ARMS/);
  assert.match(router, /<ThreeGalaxy/);
  assert.match(router, /<AtlasCanvas25D/);
  assert.match(three, /data-renderer="three-procedural-galaxy"/);
  assert.match(view, /AtlasGalaxy/);
  assert.match(graph, /layoutGalaxy3D/);
  assert.doesNotMatch(view, /AtlasWebGL3D/);
});

test('Atlas adapts density and interaction budgets for mobile viewports', async () => {
  const [canvas,styles] = await Promise.all([
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/CanvasGraph25D.css'),
  ]);
  assert.match(canvas, /size\.width<760\?720:1500/);
  assert.match(canvas, /size\.width<760\?420:1100/);
  assert.match(canvas, /size\.width<760\?14:34/);
  assert.match(canvas, /pointersRef/);
  assert.match(canvas, /newDistance\/oldDistance/);
  assert.match(styles, /touch-action:\s*none/);
});

test('Atlas uses zoom LOD and selection to progressively reveal relations', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  const adapter = await text('src/components/AtlasCanvas25D.tsx');
  assert.match(canvas, /lodForZoom/);
  assert.match(canvas, /edge\.from===selectedId\|\|edge\.to===selectedId/);
  assert.match(canvas, /edgeBudget/);
  assert.match(adapter, /edge\.is_learning/);
  assert.match(adapter, /minZoom:/);
  assert.match(adapter, /importance:/);
});

test('Atlas starts on domain topology and camera focus follows hierarchy selection', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /const \[rootExpanded, setRootExpanded\] = useState\(true\)/);
  assert.match(view, /const \[expandAll, setExpandAll\] = useState\(false\)/);
  assert.match(view, /galaxyRef\.current\?\.focusDomain/);
  assert.match(view, /galaxyRef\.current\?\.focusSubdomain/);
  assert.match(view, /galaxyRef\.current\?\.focusEntity/);
  assert.match(view, /galaxyRef\.current\?\.reset/);
  assert.match(view, /atlas\.cluster/);
  assert.match(view, /clusterFromId/);
});

test('Canvas relation rendering keeps both visible endpoints and promotes selected links', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas, /screenById\.has\(edge\.from\)/);
  assert.match(canvas, /screenById\.has\(edge\.to\)/);
  assert.match(canvas, /screenById\.get\(edge\.from\)/);
  assert.match(canvas, /screenById\.get\(edge\.to\)/);
  assert.match(canvas, /selected\?1\.75/);
  assert.match(canvas, /quadraticCurveTo/);
});
