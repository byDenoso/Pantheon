import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('cockpit is a public read-only operational surface while execution stays gated', () => {
  const app = read('src/App.tsx');
  assert.match(app, /\{ area: 'cockpit', label: 'COCKPIT', icon: '◈' \}/);
  assert.match(app, /route\.area === 'cockpit' && <CockpitPage api=\{api\} navigate=\{navigate\}\/>/);
  assert.match(app, /route\.area === 'lab' && <PrivateGate/);
  assert.match(app, /route\.area === 'atividade' && <PrivateGate/);
});

test('observatory investigation links do not advertise a false active tab', () => {
  const pages = read('src/pages/atlas-pages.tsx');
  const nav = pages.slice(pages.indexOf('function ObservatorySurfaceNav'), pages.indexOf('function ObservatoryContextPanel'));
  assert.doesNotMatch(nav, /index === 0/);
  assert.doesNotMatch(nav, /aria-current=\{index === 0/);
  assert.match(nav, /aria-label="Superfícies de investigação"/);
});

test('command shortcut is platform-aware', () => {
  const command = read('src/components/CommandEntry.tsx');
  assert.match(command, /navigator\.platform/);
  assert.match(command, /Ctrl K/);
  assert.match(command, /⌘ K/);
});

test('mobile premium shell recalibrates its topbar geometry instead of inheriting the legacy 112px height', () => {
  const mobile = read('src/design/mobile.css');
  assert.match(mobile, /--atlas-topbar-height:\s*64px/);
});

test('cockpit consumes the public operations and audit projections', () => {
  const cockpit = read('src/pages/CockpitPage.tsx');
  assert.match(cockpit, /api\.ops\(\)/);
  assert.match(cockpit, /api\.automationRuns\(\)/);
  assert.match(cockpit, /api\.audit\(\)/);
  assert.doesNotMatch(cockpit, /requer a fachada privada/);
});

test('observatory marks unpublished layers as unavailable instead of presenting zero as a published count', () => {
  const pages = read('src/pages/atlas-pages.tsx');
  assert.match(pages, /surface\.available === false/);
});

test('live graph controls use a consistent Portuguese vocabulary', () => {
  const graph = read('src/pages/graphs-page.tsx');
  const inspector = read('src/graph-engine/SpatialInspector.tsx');
  const context = read('src/components/AtlasContextBar.tsx');
  assert.match(graph, /Explorar/);
  assert.match(graph, /Relações/);
  assert.match(graph, /Evidências/);
  assert.match(graph, /ABRIR SUBGRAFO/);
  assert.match(graph, /fixados/);
  assert.match(graph, /comparação/);
  assert.match(graph, /Fixar/);
  assert.match(graph, /Comparar/);
  assert.match(graph, /Detalhe/);
  assert.match(inspector, /Ao vivo/);
  assert.match(inspector, /Fixar/);
  assert.match(inspector, /Comparar/);
  assert.match(inspector, /COMPARAÇÃO/);
  assert.match(context, /Ao vivo/);
  assert.match(context, /Salto entre domínios/);
  assert.match(context, /Abrir subgrafo/);
});

test('private areas explain the access boundary in product language and keep the technical cause secondary', () => {
  const gate = read('src/components/PrivateGate.tsx');
  assert.match(gate, /Área protegida/);
  assert.match(gate, /execução e histórico/);
  assert.match(gate, /Detalhe técnico/);
  assert.match(gate, /AUTH_SETUP_REQUIRED/);
});

test('the Vercel runtime uses its same-origin API when no external base URL is injected', () => {
  const client = read('src/api/client.ts');
  assert.match(client, /shouldUseSameOriginApi/);
  assert.match(client, /vercel\.app/);
  assert.match(client, /createApi\(\{\s*baseUrl:\s*'\/api',\s*profile:\s*'atlas'/);
  assert.match(client, /createStaticArtifactApi/);
});

test('cockpit deduplicates operations when two public endpoints expose the same run', () => {
  const cockpit = read('src/pages/CockpitPage.tsx');
  assert.match(cockpit, /mergeUniqueOperations/);
  assert.match(cockpit, /new Map\(items\.map/);
});

test('graph transitions expose a visible loading state while preserving the last valid projection', () => {
  const graph = read('src/pages/graphs-page.tsx');
  const styles = read('src/design/spatial-interface.css');
  assert.match(graph, /Preparando o próximo recorte/);
  assert.match(graph, /state\.loading && projection/);
  assert.match(styles, /graph-stage-status/);
});

test('document title follows the active Atlas surface', () => {
  const app = read('src/App.tsx');
  assert.match(app, /PAGE_TITLES/);
  assert.match(app, /document\.title\s*=\s*PAGE_TITLES\[route\.area\]/);
  assert.match(app, /cockpit:\s*'Cockpit — NEXO Atlas'/);
  assert.match(app, /graphs:\s*'Grafos — NEXO Atlas'/);
});
