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
  assert.match(atlas, /rotateLeft/);
  assert.match(atlas, /dollyIn/);
  assert.match(atlas, /onWheelCapture=\{event => event\.preventDefault\(\)\}/);
});

test('Atlas uses Three.js force graph 3D with fixed positions and restrained links', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(atlas, /react-force-graph-3d/);
  assert.match(atlas, /data-renderer="three-force-graph-3d"/);
  assert.match(atlas, /controlType="orbit"/);
  assert.match(atlas, /nodeThreeObject=\{makeNode\}/);
  assert.match(atlas, /fx: node\.x, fy: node\.y, fz: node\.z/);
  assert.match(atlas, /linkCurvature=/);
  assert.match(view, /AtlasWebGL3D/);
});

test('Atlas adapts the spaced world to portrait mobile viewports', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  const graph = await text('src/viewmodels/graph3d.ts');
  const styles = await text('src/styles/atlas3d.css');
  assert.match(atlas, /matchMedia\('\(max-width: 760px\)'\)/);
  assert.match(atlas, /const distance = isMobile \? 34 : 42/);
  assert.match(atlas, /const distance = Math\.max\(mobile \? 72 : 86/);
  assert.match(styles, /touch-action: none/);
  assert.match(graph, /const spacingScale = 1\.34/);
  assert.match(styles, /min-height: 640px/);
  assert.match(styles, /aspect-ratio: 3 \/ 4/);
});

test('Atlas orbit wraps a full 360 degrees and renders backend learning edges by scope', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  assert.match(atlas, /controlType="orbit"/);
  assert.match(atlas, /enableNavigationControls/);
  assert.match(atlas, /edge\.is_learning/);
  assert.match(atlas, /edge\.learning_scope === 'INTER_DOMAIN' \? '#f4c468' : '#d99a4f'/);
  assert.match(atlas, /linkOpacity=\{0\.84\}/);
  assert.match(atlas, /return 0\.38 \+ strength\(value\) \* 0\.24/);
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
  assert.match(view, /const \[rootExpanded, setRootExpanded\] = useState\(false\)/);
  assert.match(view, /const \[expandAll, setExpandAll\] = useState\(false\)/);
  assert.match(view, /if \(!rootExpanded\) return \{ nodes: nexoNode \? \[nexoNode\] : \[\], edges: \[\] \}/);
  assert.match(view, /atlas\.root\.edge/);
  assert.match(view, /const \[expandedDomain, setExpandedDomain\] = useState<GraphNode\['domain'\] \| null>\(null\)/);
  assert.match(view, /const \[expandedCluster, setExpandedCluster\] = useState<GraphNode\['type'\] \| null>\(null\)/);
  assert.match(view, /node\?\.type === 'DOMAIN'/);
  assert.match(view, /Hub:<\/b> \{expandAll \? 'NEXO · Visão completa' : expandedDomain \?\? \(rootExpanded \? 'NEXO · Domínios' : 'NEXO'\)\}/);
  assert.match(view, /aria-label="Voltar um nível no grafo"/);
  assert.match(view, /aria-label="Expandir gráficos"/);
  assert.match(view, /aria-label="Voltar à tela inicial dos gráficos"/);
  assert.match(view, /atlas\.cluster/);
  assert.match(view, /clusterFromId/);
  assert.match(view, /node\.domain === expandedDomain/);
  assert.doesNotMatch(view, /topLevelIds\.add\(other\)/);
});

test('Atlas marks both endpoints of every visible learning edge', async () => {
  const atlas = await text('src/components/AtlasWebGL3D.tsx');
  assert.match(atlas, /filter\(edge => ids\.has\(edge\.from\) && ids\.has\(edge\.to\)\)/);
  assert.match(atlas, /source: edge\.from, target: edge\.to/);
  assert.match(atlas, /linkDirectionalParticles=/);
  assert.match(atlas, /linkDirectionalParticleColor=/);
  assert.match(atlas, /linkCurvature=/);
  assert.match(atlas, /#f4c468/);
  assert.match(atlas, /const graphData = useMemo/);
  assert.match(atlas, /graph\.cameraPosition/);
});
