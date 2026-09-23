import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hashForView, isSystemRoute, viewFromHash} from '../src/app/navigation.ts';
import {clearSharedJson, fetchSharedJson} from '../src/data/shared-json.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('canonical cockpit routes and legacy view hashes resolve to the same screens', () => {
  const cases = [
    ['#/cockpit/comando', 'OVERVIEW'], ['#overview', 'OVERVIEW'], ['#needs', 'INBOX'],
    ['#/cockpit/comando?view=needs', 'INBOX'], ['#actions', 'ACTIONS'], ['#execution', 'EXECUTION'],
    ['#/cockpit/pipeline', 'ACTIONS'], ['#/cockpit/pipeline?view=execution', 'EXECUTION'],
    ['#truthgraph', 'TRUTHGRAPH'], ['#capabilities', 'CAPABILITIES'], ['#sources', 'SOURCES'],
    ['#integrity', 'INTEGRITY'], ['#/cockpit/prova?view=integrity', 'INTEGRITY'],
    ['#atlas', 'ATLAS'], ['#/atlas?lente=aprendizado', 'ATLAS'], ['#/cockpit/ciencia?view=learning', 'LEARNING'],
    ['#now', 'NOW'], ['#/cockpit/pessoal/recall', 'RECALL'],
  ];
  for (const [hash, expected] of cases) assert.equal(viewFromHash(hash), expected, hash);
  assert.equal(hashForView('INBOX'), '#/cockpit/comando?view=needs');
  assert.equal(hashForView('TRUTHGRAPH'), '#/cockpit/prova?tab=autoridade');
  assert.equal(hashForView('CAPABILITIES'), '#/cockpit/prova?tab=capabilities');
  assert.equal(viewFromHash('#/cockpit/prova?tab=autoridade&view=3d'), 'TRUTHGRAPH');
  assert.equal(viewFromHash('#/cockpit/prova?view=capabilities'), 'CAPABILITIES');
  assert.equal(hashForView('ATLAS'), '#/atlas?lente=operacao&view=2d');
});

test('system route is recognized separately from cockpit views', () => {
  assert.equal(isSystemRoute('#/sistema'), true);
  assert.equal(isSystemRoute('#/sistema?q=tool'), true);
  assert.equal(isSystemRoute('#/cockpit/comando'), false);
});

test('legacy MCP and Atlas pages are minimal bridges and retain the SPA entries until readback', async () => {
  const [mcp, atlas, vite] = await Promise.all([
    read('../mcp/index.html'), read('../atlas3d/index.html'), read('../vite.config.ts'),
  ]);
  assert.match(mcp, /destination\.hash\s*=\s*'\/sistema'/);
  assert.match(mcp, /location\.replace/);
  assert.match(mcp, /location\.search/);
  assert.match(mcp, /content="[01];url=\.\.\/#\/sistema/);
  assert.match(atlas, /params\.set\('view',\s*params\.get\('view'\) \|\| '3d'\)/);
  assert.match(atlas, /content="[01];url=\.\.\/#\/atlas/);
  assert.match(atlas, /location\.replace/);
  assert.match(vite, /main:\s*'index\.html'/);
  assert.match(vite, /atlas3d:\s*'atlas3d\/index\.html'/);
  assert.doesNotMatch(mcp, /src\/mcp\/main\.tsx/);
  assert.doesNotMatch(atlas, /src\/atlas3d\/main\.tsx/);
});

test('MCP topology reads from the Pantheon base and uses the shared JSON request cache', async () => {
  const app = await read('../src/mcp/McpAtlasApp.tsx');
  const store = await read('../src/data/NexoStore.tsx');
  assert.match(app, /loadPublishedContext<Topology>/);
  assert.match(store, /\$\{base\}mcp\/topology\.json/);
  assert.match(store, /\$\{base\}build-meta\.json/);
  assert.match(store, /\$\{base\}tower-projection\/manifest\.json/);
  assert.doesNotMatch(app, /new URL\('\.\/topology\.json',\s*window\.location\.href\)/);
});

test('shared JSON cache deduplicates concurrent route reads', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {ok: true, json: async () => ({ready: true})};
  };
  try {
    const url = 'https://example.test/shared-system.json';
    const [first, second] = await Promise.all([fetchSharedJson(url), fetchSharedJson(url)]);
    assert.equal(calls, 1);
    assert.deepEqual(first, {ready: true});
    assert.deepEqual(second, {ready: true});
    clearSharedJson(url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('capability counters name their different semantics explicitly', async () => {
  const [overview, mcp] = await Promise.all([
    read('../src/features/system/Overview.tsx'), read('../src/mcp/McpAtlasApp.tsx'),
  ]);
  assert.match(overview, /Capabilities fora de PASS/);
  assert.match(mcp, /topology\.stats\.capabilities/);
});

test('app navigation uses seven primary tabs and removes duplicate rail navigation', async () => {
  const [app, header, foundation, shell, mcp] = await Promise.all([
    read('../src/app/App.tsx'), read('../src/shell/InstrumentHeader.tsx'),
    read('../src/styles/tokens.css'), read('../src/styles/product-shell.css'),
    read('../src/mcp/EmbeddedMcp.tsx'),
  ]);
  assert.match(app, /<InstrumentHeader mode=\{currentMode\}/);
  assert.match(app, /unified-shell system-route/);
  assert.match(app, /new URLSearchParams\(systemQuery\)\.get\('theme'\)/);
  assert.match(app, /<EmbeddedMcp theme=\{theme\}/);
  assert.match(header, /Science :20 · Exec :05 · drift 0/);
  assert.match(header, /aria-label="Modo do produto"/);
  for (const label of ['Início','Ciência','Operação','Prova','Sistema','Mapa','Pessoal']) assert.match(header, new RegExp(label));
  assert.match(app, /className="section-tabs"/);
  assert.match(shell, /\.unified-shell \.cockpit-body\{display:block!important/);
  assert.match(shell, /\.unified-shell \.nav-rail,\.unified-shell \.bottom-nav\{display:none!important\}/);
  assert.match(shell, /prefers-reduced-motion:reduce/);
  assert.match(shell, /mcp-site\[data-mcp-embedded=true\] \.mcp-nav/);
  assert.match(foundation, /--bg:#0b0c0d/);
  assert.match(foundation, /--radius-sm:6px;--radius-md:8px;--radius-lg:16px/);
  assert.match(mcp, /themeOverride=\{theme\}/);
});


test('shared graph is available in Atlas, Sistema, Ciencia and Prova with one mobile toolbar', async () => {
  const [atlas, graph, graphCss, proof, mcp, science] = await Promise.all([
    read('../src/atlas3d/Atlas3DApp.tsx'),
    read('../src/components/NexoGraph.tsx'),
    read('../src/components/NexoGraph.css'),
    read('../src/features/system/Integrity.tsx'),
    read('../src/mcp/McpAtlasApp.tsx'),
    read('../src/features/ScienceWorkspace.tsx'),
  ]);
  assert.match(atlas, /toolbarContext=/);
  assert.match(atlas, /toolbarFilters=/);
  assert.doesNotMatch(atlas, /className="atlas-topbar"/);
  assert.match(atlas, /atlas-lens-switch/);
  assert.match(graph, /data-toolbar-rows/);
  assert.match(graph, /GraphViewSwitch/);
  assert.match(graphCss, /nexo-graph-toolbar-primary/);
  assert.match(proof, /McpTopologyGraph/);
  assert.match(mcp, /export function McpTopologyGraph/);
  assert.match(mcp, /mode="all"/);
  assert.match(science, /<NexoGraph/);
});
