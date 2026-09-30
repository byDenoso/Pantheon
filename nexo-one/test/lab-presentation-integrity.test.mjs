import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLab } from '../src/features/lab/model.ts';
import { parseLabRoute, replaceEvidenceSearch } from '../src/features/lab/routes.ts';
import { currentVerdictText, matchesSearch, boardMeta, readinessLabel, hasPublishedValue } from '../src/features/lab/presentation.ts';

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


test('replacing a search query immediately updates the route used for scroll history', () => {
  let hash = '#/evidencia';
  let route = parseLabRoute(hash);
  const events = new EventTarget();
  events.addEventListener('nexo:searchchange', () => { route = { ...parseLabRoute(hash), preserveScroll: true }; });
  const target = { history: { replaceState: (_state, _unused, url) => { hash = url; } }, dispatchEvent: event => events.dispatchEvent(event) };
  replaceEvidenceSearch('matéria escura', 'READY', target);
  assert.equal(route.search, 'matéria escura');
  assert.equal(route.preserveScroll, true);
  assert.equal(route.q, 'READY');
  assert.equal(hash, '#/evidencia?v=READY&q=mat%C3%A9ria+escura');
  const positions = new Map([[`${route.page}:${route.id ?? ''}:${route.q ?? ''}:${route.search ?? ''}`, 640]]);
  route = parseLabRoute('#/e/RESULT');
  route = parseLabRoute(hash);
  assert.equal(positions.get(`${route.page}:${route.id ?? ''}:${route.q ?? ''}:${route.search ?? ''}`), 640);
});

test('missing status and missing result are described as absent, never provisional evidence', () => {
  const unknown = buildLab(snapshot({ A: {}, B: { status: 'DONE' } })).tests;
  assert.match(currentVerdictText(unknown.get('A')), /Estado e resultado não publicados/);
  assert.match(currentVerdictText(unknown.get('B')), /resultado científico ainda não foi publicado/);
});

test('missing frontier stays unavailable rather than becoming a declared zero', () => {
  const rm = buildLab(snapshot({}, [{ roadmap_id: 'DM' }])).roadmaps.get('DM');
  assert.equal(rm.frontier, null);
  assert.equal(rm.frontierSource, undefined);
});

test('board priority preserves Portuguese accents', () => {
  assert.equal(boardMeta({ id: 'P', from: 'PITIA', to: 'ALL', at: '', text: 'Prioridade: média\nPróxima ação: verificar.' }, Date.now()).priority, 'média');
});

test('the public projection forwards only readiness facts already exported, without runtime details', async () => {
  const { buildPagesProjection } = await import('../scripts/build-pages-system.mjs');
  const manifest = { authority: 'TOWER_V06', projection_only: true, writeback: 'FORBIDDEN', tower_commit: '6'.repeat(40), event_cursor: '20260930T120000000000Z-readiness', projection_fingerprint: 'sha256:' + '7'.repeat(64), generated_at: '2026-09-30T12:00:00Z' };
  const projection = { contract: 'NEXO_PUBLIC_PROJECTION_V1', manifest, event_cursor: manifest.event_cursor, work: [], capabilities: {}, counts: { active_work: 0, tests: 2, capabilities: 0 }, tests: [
    { id: 'A', status: 'READY', readiness: { eligible: false, policy: 'SCIENTIFIC_INTEGRITY_V1', reasons: ['INPUT_NOT_BOUND', '/private/path'], recipe_sha256: 'private-hash', binding: 'private-binding' } },
    { id: 'B', status: 'READY' }, { id: 'PRIVATE', private: true, status: 'READY', readiness: { eligible: true } },
  ] };
  const { system } = buildPagesProjection({ projection, manifestFile: manifest });
  assert.deepEqual(system.read_model.tests.A.readiness, { eligible: false, policy: 'SCIENTIFIC_INTEGRITY_V1', reasons: ['INPUT_NOT_BOUND'] });
  assert.equal(system.read_model.tests.B.readiness, undefined);
  assert.equal(system.read_model.tests.PRIVATE, undefined);
  assert.equal(readinessLabel(buildLab(system).tests.get('A')), 'Inelegível na verificação publicada');
});


test('unavailable result envelopes do not become provisional scientific evidence', () => {
  const absent = { value: { value: null, unavailable_reason: 'NOT_PUBLISHED', source_ref: 'public-source' }, source_ref: 'outer-source' };
  assert.equal(hasPublishedValue(absent), false);
  assert.equal(hasPublishedValue({ value: 0 }), true);
  assert.equal(hasPublishedValue({ statistics: { p_value: 0.04 } }), true);
  assert.match(currentVerdictText({ verdict: 'PROVISIONAL', status: null, review: null, verdictRaw: null, meaning: null, result: absent }), /Estado e resultado não publicados/);
});

test('all Evidence verdict filters use one stable population including contests', async () => {
  const source = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const evidence = source.slice(source.indexOf('function Evidence('), source.indexOf('// ---------- Entidade'));
  assert.match(evidence, /const all = \[\.\.\.lab.tests.values\(\)\];/);
  assert.doesNotMatch(evidence, /filter\(t => .*contestOf/);
});
