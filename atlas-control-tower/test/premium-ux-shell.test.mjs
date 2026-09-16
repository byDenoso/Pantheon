import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

// Existing premium shell assertions.
test('premium shell keeps graph trust and comparison affordances', () => {
  const graph = read('src/pages/graphs-page.tsx');
  const inspector = read('src/components/graph/GraphInspector.tsx');
  const context = read('src/components/graph/GraphContextBar.tsx');
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

test('operational private wrapper requires a real stored session while semantic writes stay backend-authorized', () => {
  const gate = read('src/components/PrivateGate.tsx');
  const semantic = read('api/private/semantic.mjs');
  assert.match(gate, /readStoredGoogleSession/);
  assert.match(gate, /Entrar no Atlas/);
  assert.match(semantic, /withGoogleAuth/);
  assert.match(semantic, /TOWER_WRITE_NOT_CONFIGURED/);
  assert.match(semantic, /ALLOWED_COMMANDS/);
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
  assert.match(app, /if \(area === 'graphs'\) void actions\.home\(\)/);
});
