import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCockpitSources, mergeRunSources } from '../src/core/cockpit-sources.ts';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('cockpit, laboratory and activity are public read-only product surfaces', () => {
  const app = read('src/App.tsx');
  const gate = read('src/components/PrivateGate.tsx');
  assert.match(app, /\{ area: 'cockpit', label: 'COCKPIT', icon: '◈' \}/);
  assert.match(app, /route\.area === 'cockpit' && <CockpitPage api=\{api\} navigate=\{navigate\}\/>/);
  assert.match(app, /route\.area === 'lab' && <PrivateGate/);
  assert.match(app, /route\.area === 'atividade' && <PrivateGate/);
  assert.match(gate, /return <>{children}<\/>/);
  assert.doesNotMatch(gate, /AUTH_SETUP_REQUIRED|Acesso à área restrito/);
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

test('cockpit consumes the public operations and audit projections', async () => {
  const cockpit = read('src/pages/CockpitPage.tsx');
  const calls = [];
  await loadCockpitSources(Object.fromEntries(['health', 'ops', 'automationRuns', 'audit'].map(key => [key, async () => { calls.push(key); return {}; }])));
  assert.deepEqual(calls.sort(), ['audit', 'automationRuns', 'health', 'ops']);
  assert.match(cockpit, /loadCockpitSources\(api\)/);
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

test('legacy private wrapper is transparent while backend write authorization remains separate', () => {
  const gate = read('src/components/PrivateGate.tsx');
  assert.match(gate, /public\/read-only/);
  assert.match(gate, /authorization belongs to backend/);
  assert.match(gate, /return <>{children}<\/>/);
});

test('the Vercel runtime uses its real same-origin HTTP API when no external base URL is injected', () => {
  const client = read('src/api/client.ts');
  assert.match(client, /shouldUseSameOriginApi/);
  assert.match(client, /vercel\.app/);
  assert.match(client, /sameOriginApiBase/);
  assert.match(client, /window\.location\.origin/);
  assert.match(client, /createApi\(\{\s*baseUrl:\s*sameOriginApiBase,\s*profile:\s*'atlas'/);
  assert.doesNotMatch(client, /createApi\(\{\s*baseUrl:\s*'\/api',\s*profile:\s*'atlas'/);
  assert.match(client, /createStaticArtifactApi/);
});

test('opening Grafos resets a stale graph-layer focus to the NEXO universe', () => {
  const app = read('src/App.tsx');
  assert.match(app, /area === 'graphs'[\s\S]*actions\.home\(\)/);
});

test('cockpit deduplicates operations when two public endpoints expose the same run', () => {
  const run = { id: 'same-run', status: 'RUNNING', label: 'Published run' };
  const merged = mergeRunSources({ ops: { state: 'READY', data: { actions: [], runs: [run] } }, runs: { state: 'READY', data: [run] } });
  assert.equal(merged.data.length, 1);
  assert.equal(merged.data[0].id, run.id);
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
