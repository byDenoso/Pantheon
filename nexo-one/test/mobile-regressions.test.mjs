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
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  assert.match(atlas, /aria-label="Girar mapa para a esquerda"/);
  assert.match(atlas, /aria-label="Girar mapa para a direita"/);
  assert.match(atlas, /aria-label="Aproximar mapa"/);
  assert.match(atlas, /aria-label="Afastar mapa"/);
  assert.match(atlas, /camera\.alpha/);
  assert.match(atlas, /camera\.beta/);
  assert.match(atlas, /camera\.radius/);
});

test('Atlas uses Babylon WebGL 3D with restrained post-processing', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(atlas, /@babylonjs\/core/);
  assert.match(atlas, /new Engine\(canvas/);
  assert.match(atlas, /new ArcRotateCamera/);
  assert.match(atlas, /DefaultRenderingPipeline/);
  assert.match(atlas, /bloomThreshold = \.92/);
  assert.match(atlas, /fxaaEnabled = true/);
  assert.match(atlas, /data-renderer="babylon-webgl-3d"/);
  assert.match(view, /AtlasWebGL3D/);
});

test('Atlas adapts the spaced world to portrait mobile viewports', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  const graph = await text('src/viewmodels/graph3d.ts');
  const styles = await text('src/styles/atlas3d.css');
  assert.match(atlas, /matchMedia\('\(max-width: 760px\)'\)/);
  assert.match(atlas, /const worldScale = mobile \? \.52 : 1/);
  assert.match(atlas, /const nodeScale = mobile \? 1\.22 : 1/);
  assert.match(atlas, /camera\.fov = mobile \? \.72 : \.8/);
  assert.match(graph, /const spacingScale = 1\.34/);
  assert.match(styles, /min-height: 640px/);
  assert.match(styles, /aspect-ratio: 3 \/ 4/);
});

test('Atlas orbit wraps a full 360 degrees and renders backend learning edges by scope', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  assert.match(atlas, /camera\.alpha/);
  assert.match(atlas, /lowerBetaLimit/);
  assert.match(atlas, /edge\.is_learning/);
  assert.match(atlas, /edge\.learning_scope === 'INTER_DOMAIN' \? '#f4c468' : '#d99a4f'/);
});

test('Atlas surfaces backend learning scope counts beside the filament toggle', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /filtered\.edges\.filter\(edge => edge\.is_learning\)/);
  assert.match(view, /learningInterDomain/);
  assert.match(view, /learningIntraDomain/);
  assert.match(view, /interdomínio/);
  assert.match(view, /intradomínio/);
});

test('Atlas starts at the NEXO hub and expands canonical domain clusters on selection', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /const \[expandedDomain, setExpandedDomain\] = useState<string \| null>\(null\)/);
  assert.match(view, /node\?\.type === 'DOMAIN'/);
  assert.match(view, /Hub:<\/b> \{expandedDomain \?\? 'NEXO'\}/);
  assert.match(view, /Voltar ao hub/);
  assert.match(view, /node\.domain === expandedDomain/);
  assert.doesNotMatch(view, /topLevelIds\.add\(other\)/);
});

test('Atlas marks both endpoints of every visible learning edge', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  assert.match(atlas, /CreateLines/);
  assert.match(atlas, /Quadratic Bézier/);
  assert.match(atlas, /const pulses: NeuralPulse\[\]/);
  assert.match(atlas, /scene\.pick\(scene\.pointerX, scene\.pointerY/);
  assert.match(atlas, /PointerEventTypes\.POINTERDOWN/);
  assert.match(atlas, /atlas-star-material/);
  assert.match(atlas, /const starMeshes/);
  assert.match(atlas, /const containWheel = \(event: WheelEvent\) => event\.preventDefault\(\)/);
  assert.match(atlas, /addEventListener\('wheel', containWheel, \{ passive: false \}\)/);
  assert.match(atlas, /CreateTube\(`atlas-axon-/);
  assert.match(atlas, /fiberCount = Math\.max\(3/);
  assert.match(atlas, /#f4c468/);
  assert.match(atlas, /depthOfFieldEnabled = false/);
  assert.match(atlas, /line\.alpha = edge\.is_learning \? \.18 \+ strength \* \.14/);
  assert.match(atlas, /const nexoAnchor = renderNodes\.find/);
  assert.match(atlas, /const animateFocus = \(id: string \| null, center = false\)/);
  assert.match(atlas, /camera\.radius = fromRadius \+ \(toRadius - fromRadius\) \* eased/);
  assert.match(atlas, /const lodVisible = close \|\| node\?\.type === 'DOMAIN'/);
});
