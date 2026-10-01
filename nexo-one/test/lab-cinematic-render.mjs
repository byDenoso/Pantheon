// Structural render QA. This is not a substitute for browser, layout or WebGL checks.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const input = process.env.NEXO_PUBLIC_PROJECTION_INPUT;
assert.ok(input, 'Set NEXO_PUBLIC_PROJECTION_INPUT to the sanctioned public audit projection');
const projection = JSON.parse(await readFile(input, 'utf8'));
const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
await mkdir('test-output/cinematic', { recursive: true });
try {
  const { default: LabApp } = await server.ssrLoadModule('/src/features/lab/LabApp.tsx');
  const render = (route, state = system) => renderToString(createElement(LabApp, { state, route, theme: 'dark' })).replace(/<!--.*?-->/gs, '');
  const home = render({ page: 'agora' });
  assert.match(home, /54 testes parados/);
  assert.match(home, /recuperar os 54/);
  assert.match(home, /1\.0\.0.*2026-09-28/s);
  assert.match(home, /17 \/ 33 registros/);
  assert.match(home, /9\.4 h/);
  assert.match(home, /normalizados contêm 54 BLOCKED/);
  assert.match(home, /cobertura parcial/);
  assert.doesNotMatch(home, /Cientista precisa gerar hipóteses|2,8–4,2σ|TRGB no meio/);
  await writeFile('test-output/cinematic/home-render.html', home);
  const rejected = render({ page: 'entidade', id: 'FAM-DE-FS-GEOGROWTH-ELG-DESI-PP' });
  assert.match(rejected, /Rejeitado pelo critério/);
  assert.match(rejected, /terminou com rejeição/);
  assert.doesNotMatch(rejected, /Travei aqui/);
  await writeFile('test-output/cinematic/rejected-render.html', rejected);
  const h0 = render({ page: 'roadmap', id: 'RM-H0-SYSTEMATICS-VS-PHYSICS-20260923-V1' });
  assert.match(h0, /0 resultados fora da fronteira/);
  assert.match(h0, /22 na fronteira/);
  assert.doesNotMatch(h0, /16 andados/);
  await writeFile('test-output/cinematic/roadmap-render.html', h0);
  const cycle = render({ page: 'ciclo' });
  assert.match(cycle, /240 eventos recebidos no recorte de até 48 h · cobertura parcial/);
  assert.match(cycle, /Nenhum evento deste papel no recorte recebido; cobertura parcial/);
  await writeFile('test-output/cinematic/cycle-render.html', cycle);
  const globalSourceOnly = structuredClone(system);
  for (const frontier of globalSourceOnly.cosmology_state.frontiers) delete frontier.literature_source;
  const detail = render({ page: 'universo', id: 'h0' }, globalSourceOnly);
  assert.match(detail, /cosmology-world-model.*1\.0\.0.*2026-09-28/s);
  const invalidTime = structuredClone(system);
  invalidTime.generated_at = 'bad';
  invalidTime.read_model.tests.RUNNING_DATE_GUARD = { status: 'RUNNING' };
  const invalidHome = render({ page: 'agora' }, invalidTime);
  assert.match(invalidHome, /data inválida/);
  assert.doesNotMatch(invalidHome, /class="is-running"/);
  await writeFile('test-output/cinematic/universe-global-source-render.html', detail);
  console.log('PASS structural render: home, rejected entity, H0 roadmap, cycle, global literature source, invalid freshness');

} finally { await server.close(); }
