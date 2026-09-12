import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApi } from '../lib/atlas-api.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Atlas vNext keeps one shell with the four requested perspectives and URL context', () => {
  const app = read('src/App.tsx');
  const route = read('src/atlas-route.ts');
  for (const label of ['GRAFOS', 'OBSERVATÓRIO', 'LABORATÓRIO', 'RESUMO DO UNIVERSO']) assert.match(app, new RegExp(label));
  for (const path of ['graphs', 'observatory', 'lab', 'universe']) assert.match(route, new RegExp(path));
  assert.match(route, /domain/);
  assert.match(route, /period/);
});

test('scientific projections are adapter-backed and do not embed reference numbers', () => {
  const source = read('src/api/adapters.ts') + read('src/pages/atlas-pages.tsx');
  for (const component of ['WeightedH0', 'Tension', 'Directional', 'Snapshot', 'Provenance', 'Freshness']) assert.match(source, new RegExp(component));
  for (const placeholder of ['70,2', '4,4', '1,03', '13,8', '70.2', '4.4']) assert.doesNotMatch(source, new RegExp(placeholder.replace('.', '\\.')));
  assert.match(source, /Nenhuma estimativa consolidada disponível/);
  assert.match(source, /Sem sinal direcional robusto no estado atual/);
});

test('configured API base is used without changing the existing request contract', async () => {
  const seen = [];
  const api = createApi({ baseUrl: 'https://api.example.test/nexo', fetchImpl: async url => {
    seen.push(String(url));
    return { ok: true, status: 200, json: async () => ({ nodes: [], edges: [], fingerprint: 'test' }) };
  }});
  await api.graph({ focus: 'system:NEXO' });
  assert.match(seen[0], /^https:\/\/api\.example\.test\/nexo\/graph\?/);
});

test('the production entrypoint is the React shell and the existing graph engine remains imported', () => {
  const index = read('index.html');
  const main = read('src/main.tsx');
  const app = read('src/App.tsx');
  const graphs = read('src/pages/graphs-page.tsx');
  assert.match(index, /id="root"/);
  assert.match(index, /src="\/src\/main\.tsx"/);
  assert.match(main, /createRoot/);
  assert.match(app, /GraphsPage/);
  assert.match(graphs, /AtlasCanvas/);
  assert.match(graphs, /actions\.more\(\)/);
});
