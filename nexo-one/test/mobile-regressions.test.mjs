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

test('Atlas exposes explicit touch navigation controls for mobile instead of depending only on gestures', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas, /aria-label="Girar para a esquerda"/);
  assert.match(canvas, /aria-label="Girar para a direita"/);
  assert.match(canvas, /aria-label="Aproximar"/);
  assert.match(canvas, /aria-label="Afastar"/);
  assert.match(canvas, /onWheel=\{event=>\{/);
  assert.match(canvas, /event\.preventDefault\(\)/);
});

test('Atlas uses the deterministic Canvas 2.5D renderer with pointer-driven yaw/pitch/zoom, not a WebGL force graph', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  const atlas = await text('src/components/AtlasCanvas25D.tsx');
  assert.match(canvas, /getContext\('2d'/);
  assert.match(canvas, /data-renderer="canvas-2\.5d"/);
  assert.match(canvas, /function rotatePoint/);
  assert.match(canvas, /onPointerDown=\{/);
  assert.match(canvas, /onPointerMove=\{/);
  assert.doesNotMatch(canvas, /react-force-graph-3d|ForceGraph3D|THREE\./);
  assert.match(atlas, /data-renderer="canvas-2\.5d"/);
  assert.doesNotMatch(atlas, /react-force-graph-3d|ForceGraph3D/);
});

test('Atlas adapts the spaced world and canvas controls to portrait mobile viewports', async () => {
  const css = await text('src/components/CanvasGraph25D.css');
  const graph = await text('src/viewmodels/graph3d.ts');
  assert.match(css, /touch-action:none/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(graph, /const spacingScale = 1\.34/);
});

test('Atlas surfaces backend learning scope counts beside the filament toggle', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /filtered\.edges\.filter\(edge => edge\.is_learning\)/);
  assert.match(view, /learningInterDomain/);
  assert.match(view, /learningIntraDomain/);
  assert.match(view, /interdomínio/);
  assert.match(view, /intradomínio/);
});

test('Atlas starts at the NEXO domain overview and expands canonical domain clusters on selection', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /const \[rootExpanded, setRootExpanded\] = useState\(true\)/);
  assert.match(view, /const \[expandAll, setExpandAll\] = useState\(false\)/);
  assert.match(view, /atlas\.root\.edge/);
  assert.match(view, /visibleLearningEdges/);
  assert.match(view, /visibleIds\.has\(edge\.from\) && visibleIds\.has\(edge\.to\)/);
  assert.match(view, /const \[expandedDomain, setExpandedDomain\] = useState<GraphNode\['domain'\] \| null>\(null\)/);
  assert.match(view, /const \[expandedCluster, setExpandedCluster\] = useState<GraphNode\['type'\] \| null>\(null\)/);
  assert.match(view, /node\?\.type === 'DOMAIN'/);
  assert.match(view, /atlas\.cluster/);
  assert.match(view, /clusterFromId/);
  assert.match(view, /node\.domain === expandedDomain/);
});

test('Atlas marks both endpoints of every rendered edge and keeps relation color coding legible', async () => {
  const atlas = await text('src/components/AtlasCanvas25D.tsx');
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(atlas, /edges\.map\(edge=>\(\{/);
  assert.match(atlas, /edgeColor\(edge\)/);
  assert.match(canvas, /safeEdges=useMemo\(\(\)=>edges\.filter\(edge=>byId\.has\(edge\.from\)&&byId\.has\(edge\.to\)\)/);
  assert.match(canvas, /dashed/);
});
