import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';
import { buildLab } from '../src/features/lab/model.ts';
import { labVisualFixture } from './lab-visual-fixture.mjs';

let server, LabApp;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  ({ default: LabApp } = await server.ssrLoadModule('/src/features/lab/LabApp.tsx'));
});
after(async () => { await server?.close(); });

const now = Date.parse('2026-10-01T15:09:07Z');
const fixture = () => {
  const projection = labVisualFixture(now);
  const { system } = buildPagesProjection({ projection, manifestFile: projection.manifest });
  return system;
};
const render = (state, page) => renderToString(createElement(LabApp, { state, route: { page }, theme: 'dark' })).replace(/<!--.*?-->/gs, '');

test('missing causes remain unknown while the published question and BLOCKED status survive', () => {
  const state = fixture();
  const id = 'VISUAL-H0-08';
  delete state.read_model.tests[id].blocker;
  const graph = state.graph.nodes.find(node => node.id === 'test:' + id);
  delete graph.blocker;
  graph.summary = 'A pergunta científica publicada, sem causa operacional';
  const lab = buildLab(state), record = lab.tests.get(id);
  assert.equal(record.blocker, null);
  assert.equal(record.verdict, 'BLOCKED');
  assert.equal(lab.counts.BLOCKED, 54);
  assert.ok(record.question);
  assert.equal(record.summary, graph.summary);
  state.read_model.tests[id].blocker = 'Causa publicada: entrada versionada ausente';
  assert.equal(buildLab(state).tests.get(id).blocker, 'Causa publicada: entrada versionada ausente');
});

test('home keeps a missing cause separate from the linked test and shows both published counting bases', () => {
  const state = fixture();
  for (const record of Object.values(state.read_model.tests)) delete record.blocker;
  for (const node of state.graph.nodes) delete node.blocker;
  const html = render(state, 'agora');
  const problem = html.slice(html.indexOf('id="now-problem"'), html.indexOf('id="now-next"'));
  assert.match(problem, /Motivo do bloqueio não publicado/);
  assert.doesNotMatch(problem, /class="hud-big">Fixture visual: o resultado atende/);
  assert.match(problem, /href="#\/e\//);
  assert.match(html, /<dt>53 \/ 53<\/dt>/);
  assert.match(html, /100% nessa base publicada/);
  const lab = buildLab(state);
  assert.match(html, new RegExp(`54 bloqueados entre ${lab.tests.size} testes recebidos`));
  assert.match(html, /normalizados contêm 54 BLOCKED/);
});

test('health dates a report from its own timestamp and never substitutes a newer projection time', () => {
  const state = fixture();
  state.guardian = { status: 'YELLOW', checked_at: '2026-10-01T15:09:07Z', report_checked_at: '2026-10-01T13:03:47Z', checks_total: 2, checks_failing: 1, failing_areas: ['science'] };
  let html = render(state, 'saude');
  assert.match(html, /2026-10-01 13:03:47 UTC/);
  assert.doesNotMatch(html, /2026-10-01 15:09:07 UTC/);
  state.guardian.report_checked_at = null;
  html = render(state, 'saude');
  assert.match(html, /data da auditoria não informada/);
  assert.doesNotMatch(html, /2026-10-01 15:09:07 UTC/);
  delete state.guardian.report_checked_at;
  html = render(state, 'saude');
  assert.match(html, /data da auditoria não informada/);
  assert.doesNotMatch(html, /2026-10-01 15:09:07 UTC/);
  state.guardian.report_checked_at = 'invalid';
  assert.match(render(state, 'saude'), /data da auditoria não informada/);
});

test('report findings and publication checks retain separate sources, times and areas', () => {
  const state = fixture();
  state.guardian = { status: 'YELLOW', checked_at: '2026-10-01T15:09:07Z', live_checked_at: '2026-10-01T15:09:07Z', report_checked_at: '2026-10-01T13:03:47Z', checks_total: 5, checks_failing: 2, failing_areas: ['science', 'automations'], live_areas: ['automations', 'cycle'] };
  const html = render(state, 'saude');
  const report = html.match(/<section[^>]*aria-labelledby="he-fail"[^>]*>[\s\S]*?<\/section>/)?.[0];
  const publication = html.match(/<section[^>]*aria-labelledby="he-live"[^>]*>[\s\S]*?<\/section>/)?.[0];
  assert.ok(report && publication);
  assert.match(report, /2026-10-01 13:03:47 UTC/);
  assert.doesNotMatch(report, /2026-10-01 15:09:07 UTC|Problema em automations/);
  assert.match(publication, /2026-10-01 15:09:07 UTC/);
  assert.doesNotMatch(publication, /2026-10-01 13:03:47 UTC|Problema em science/);
  assert.match(publication, /não comprova tarefa pausada/);
});
