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
    ['#atlas', 'ATLAS'], ['#/atlas?lente=aprendizado', 'LEARNING'],
    ['#now', 'NOW'], ['#/cockpit/pessoal/recall', 'RECALL'],
  ];
  for (const [hash, expected] of cases) assert.equal(viewFromHash(hash), expected, hash);
  assert.equal(hashForView('INBOX'), '#/cockpit/comando?view=needs');
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
  assert.match(mcp, /content="0;url=\.\.\/#\/sistema/);
  assert.match(atlas, /params\.set\('view',\s*params\.get\('view'\) \|\| '3d'\)/);
  assert.match(atlas, /content="1;url=\.\.\/#\/atlas/);
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
  assert.match(mcp, /capabilities registradas/);
});

test('cockpit and Sistema share the instrument shell, palette and compact rail', async () => {
  const [app, header, foundation, shell, mcp] = await Promise.all([
    read('../src/app/App.tsx'), read('../src/shell/InstrumentHeader.tsx'),
    read('../src/styles/tokens.css'), read('../src/styles/product-shell.css'),
    read('../src/mcp/EmbeddedMcp.tsx'),
  ]);
  assert.match(app, /<InstrumentHeader mode=\{currentMode\}/);
  assert.match(app, /unified-shell system-route/);
  assert.match(app, /<EmbeddedMcp theme=\{theme\}/);
  assert.match(header, /Science :20 · Exec :05 · drift 0/);
  assert.match(header, /aria-label="Modo do produto"/);
  assert.match(shell, /grid-template-columns:56px minmax\(0,1fr\)/);
  assert.match(shell, /nav-rail:hover/);
  assert.match(shell, /prefers-reduced-motion:reduce/);
  assert.match(shell, /mcp-site\[data-mcp-embedded=true\] \.mcp-nav/);
  assert.match(foundation, /--bg:#0b0c0d/);
  assert.match(foundation, /--radius-sm:6px;--radius-md:8px;--radius-lg:16px/);
  assert.match(mcp, /themeOverride=\{theme\}/);
});
