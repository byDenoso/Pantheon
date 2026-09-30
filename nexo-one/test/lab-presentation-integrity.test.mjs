import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLab } from '../src/features/lab/model.ts';
import { parseLabRoute } from '../src/features/lab/routes.ts';
import { currentVerdictText, matchesSearch, boardMeta, readinessLabel } from '../src/features/lab/presentation.ts';

const snapshot = (tests = {}, roadmaps = [], progress = []) => ({
  generated_at: '2026-09-30T12:00:00Z', graph: { nodes: [], edges: [] },
  read_model: { tests, roadmaps }, evolution: { roadmaps: progress },
});

test('a promoted execution can be refuted without rewriting either record', () => {
  const input = snapshot({ 'META-ROADMAP26-001-AUTOATTACH-REPAIR': {
    status: 'DONE', verdict: 'PROMOTED', review_state: 'REFUTED',
    result_meaning: 'O reparo passou no critério original.',
  }});
  const original = structuredClone(input);
  const entity = buildLab(input).tests.get('META-ROADMAP26-001-AUTOATTACH-REPAIR');
  assert.equal(entity.verdict, 'REFUTED');
  assert.equal(entity.verdictRaw, 'PROMOTED');
  assert.equal(entity.meaning, 'O reparo passou no critério original.');
  assert.match(currentVerdictText(entity), /revisão atual refutou/);
  assert.doesNotMatch(currentVerdictText(entity), /passou no critério original/);
  assert.deepEqual(input, original);
});

test('READY never infers eligibility from the label or WORK automation flags', () => {
  const lab = buildLab(snapshot({
    A: { status: 'READY', automation_eligible: true },
    B: { status: 'READY', readiness: { eligible: false, reasons: ['INPUT_NOT_BOUND'] } },
    C: { status: 'READY', readiness: { eligible: true, reasons: [] } },
    D: { status: 'READY', readiness: { eligible: 'true' } },
  }));
  assert.equal(readinessLabel(lab.tests.get('A')), 'Elegibilidade não publicada');
  assert.equal(readinessLabel(lab.tests.get('B')), 'Inelegível na verificação publicada');
  assert.equal(readinessLabel(lab.tests.get('C')), 'Elegível na verificação publicada');
  assert.equal(readinessLabel(lab.tests.get('D')), 'Elegibilidade não publicada');
  assert.match(currentVerdictText(lab.tests.get('B')), /inelegível/);
  assert.deepEqual(lab.tests.get('B').readiness.reasons, ['INPUT_NOT_BOUND']);
});

test('linked test counts and budget usage remain distinct; missing is not zero', () => {
  const linked = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'CONTEST-A-1'];
  const tests = Object.fromEntries(linked.map(id => [id, { status: 'READY' }]));
  const rm = { roadmap_id: 'DM', test_ids: linked, frontier_test_ids: [...linked, 'MISSING'], progress: { total: 8, frontier: 9 }, charter: { budget: { max_tests: 40 } } };
  const missing = buildLab(snapshot(tests, [rm])).roadmaps.get('DM');
  assert.equal(missing.used, null);
  assert.equal(missing.tests.length, 8);
  assert.equal(missing.frontier, 9);
  assert.equal(missing.frontierIds.length, 9);
  assert.equal(missing.testsSource, 'read_model.roadmaps.test_ids');
  const explicit = buildLab(snapshot(tests, [rm], [{ roadmap_id: 'DM', tests_used: 0 }])).roadmaps.get('DM');
  assert.equal(explicit.used, 0);
  assert.equal(explicit.maxTests, 40);
});

test('search persists in the route, folds Portuguese accents and matches all words', () => {
  const route = parseLabRoute('#/evidencia?v=READY&q=mat%C3%A9ria%20escura');
  assert.equal(route.page, 'evidencia');
  assert.equal(route.q, 'READY');
  assert.equal(route.search, 'matéria escura');
  assert.equal(matchesSearch(route.search, 'Matéria escura', 'Natureza em aberto'), true);
  assert.equal(matchesSearch('materia escura', 'MATÉRIA ESCURA'), true);
  assert.equal(matchesSearch('escura materia', 'Matéria escura'), true);
  assert.equal(matchesSearch('matéria escura', 'Energia escura'), false);
});

test('board uses published fields without inventing owners, priorities or next actions', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const post = { id: 'P', at: '2026-09-30', from: 'PITIA', to: 'ALL', text: 'Uma observação.' };
  assert.deepEqual(boardMeta(post, now), { owner: 'ALL', priority: 'Não informada', status: 'Aberto', nextAction: null });
  assert.equal(boardMeta({ ...post, text: 'Prioridade: P1\nPróxima ação: conferir o vínculo público.' }, now).nextAction, 'conferir o vínculo público.');
  assert.equal(boardMeta({ ...post, resolved_at: '2026-09-30T11:00:00Z' }, now).status, 'Resolvido');
  assert.equal(boardMeta({ ...post, expires_at: '2026-09-30T10:00:00Z' }, now).status, 'Expirado');
});

test('UI keeps current review and raw interpretation in separately labelled sections', async () => {
  const ui = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  assert.match(ui, /title="Veredito atual"[\s\S]*?currentVerdictText\(t\)/);
  assert.match(ui, /title="Resultado bruto da execução"[\s\S]*?humanize\(t.meaning\)/);
  assert.doesNotMatch(ui, /title="No que acredito agora"/);
  assert.ok(ui.indexOf('id="now-problem"') < ui.indexOf('id="now-sci"'));
  assert.match(ui, /sceneAvailable === true && <QualityButton/);
  assert.match(ui, /scrollPositions\.current\.get\(routeKey\)/);
});

test('accepted and replied board states require an explicit record', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const post = { id: 'P', at: '2026-09-30', from: 'PITIA', to: 'EXECUTOR', text: 'Verificar dados.' };
  assert.equal(boardMeta(post, now).status, 'Aberto');
  assert.equal(boardMeta({ ...post, status: 'ACCEPTED' }, now).status, 'Aceito');
  assert.equal(boardMeta(post, now, [{ ...post, id: 'R', reply_to: 'P' }]).status, 'Respondido');
  assert.equal(boardMeta({ ...post, resolved_at: '2026-09-30' }, now, [{ ...post, id: 'R', reply_to: 'P' }]).status, 'Resolvido');
});

test('Atlas filter groups cannot shrink into each other and footer overlays have separate lanes', async () => {
  const css = await readFile(new URL('../src/atlas3d/atlas3d.css', import.meta.url), 'utf8');
  assert.match(css, /\.atlas-graph-filters\{flex:none;width:max-content;min-width:max-content/);
  assert.match(css, /\.atlas-layer-switch\) > button\{flex-shrink:0\}/);
  assert.match(css, /\.atlas-interaction-hint\{left:16px;right:196px;bottom:72px/);
});
