import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLab } from '../src/features/lab/model.ts';
import { currentVerdictText, roadmapTrail } from '../src/features/lab/presentation.ts';
import { activityWindow, activityRange } from '../src/features/lab/activity-presentation.ts';
import { createNarrationDeck } from '../src/features/lab/narration-deck.ts';
import { NARRATION } from '../src/features/lab/narration.ts';
import { buildPagesProjection } from '../scripts/build-pages-system.mjs';

const snapshot = tests => ({ generated_at: '2026-10-01T03:45:51Z', graph: { nodes: [], edges: [] }, read_model: { tests }, evolution: { roadmaps: [] } });
const manifest = { authority: 'TOWER_V06', projection_only: true, writeback: 'FORBIDDEN', tower_commit: '6'.repeat(40), event_cursor: '20261001T034551000000Z-audit', projection_fingerprint: 'sha256:' + '7'.repeat(64), generated_at: '2026-10-01T03:45:51Z' };
const projection = tests => ({ contract: 'NEXO_PUBLIC_PROJECTION_V1', manifest, event_cursor: manifest.event_cursor, work: [], capabilities: {}, counts: { active_work: 0, tests: tests.length, capabilities: 0 }, tests });

test('scientific rejection is completed negative evidence, distinct from blocking, review and archival', () => {
  const tests = [
    { id: 'FAM-DE-FS-GEOGROWTH-ELG-DESI-PP', status: 'REJECTED', verdict: 'REJECTED' },
    { id: 'B', status: 'BLOCKED_INPUT' },
    { id: 'C', state: 'BLOCKED_SCIENTIFIC_CONTRACT' },
    { id: 'D', status: 'REJECTED', verdict: 'REJECTED', review_state: 'PENDING_REVIEW' },
    { id: 'E', status: 'DONE', verdict: 'PROMOTED', review_state: 'REFUTED' },
    { id: 'F', status: 'ARCHIVED' },
    { id: 'G', status: 'DONE', verdict: 'REJECTED' },
  ];
  const { system } = buildPagesProjection({ projection: projection(tests), manifestFile: manifest });
  assert.equal(system.graph.nodes.find(n => n.id === 'test:' + tests[0].id).state, 'SNAPSHOT');
  assert.equal(system.graph.nodes.find(n => n.id === 'test:C').state, 'BLOCKED');
  const lab = buildLab(system);
  assert.equal(lab.tests.get(tests[0].id).verdict, 'REJECTED');
  assert.equal(lab.tests.get('B').verdict, 'BLOCKED');
  assert.equal(lab.tests.get('C').verdict, 'BLOCKED');
  assert.equal(lab.tests.get('D').verdict, 'REVIEW');
  assert.equal(lab.tests.get('E').verdict, 'REFUTED');
  assert.equal(lab.tests.get('F').verdict, 'DISCARDED');
  assert.equal(lab.tests.get('G').verdict, 'REJECTED');
  assert.equal(lab.counts.BLOCKED, 2);
  assert.match(currentVerdictText(lab.tests.get(tests[0].id)), /terminou com rejeição/);
  assert.equal(lab.tests.get('E').verdictRaw, 'PROMOTED');
});

test('explicit current status takes priority over a stale blocked graph hint', () => {
  const state = snapshot({ A: { status: 'REJECTED' }, B: { status: 'READY' } });
  state.graph.nodes = [{ id: 'test:A', type: 'TEST', state: 'BLOCKED' }, { id: 'test:B', type: 'TEST', state: 'BLOCKED' }];
  const lab = buildLab(state);
  assert.equal(lab.tests.get('A').verdict, 'REJECTED');
  assert.equal(lab.tests.get('B').verdict, 'READY');
});

test('twenty-two published frontier members never become sixteen completed results after a six-row display cut', () => {
  const ids = Array.from({ length: 22 }, (_, i) => 'H0-' + i);
  const lab = buildLab(snapshot(Object.fromEntries(ids.map((id, i) => [id, { status: i < 7 ? 'CHECKPOINTED' : 'BLOCKED_INPUT' }]))));
  const tests = [...lab.tests.values()];
  const visibleList = tests.slice(0, 6);
  assert.equal(visibleList.length, 6);
  const trail = roadmapTrail(tests, ids);
  assert.equal(trail.walked.length, 0);
  assert.equal(trail.ahead.length, 22);
  assert.equal(trail.other.length, 0);
  assert.equal(roadmapTrail(tests, []).walked.length, 0);
});

test('activity counts describe a partial received window and do not attest inactivity', () => {
  const now = Date.parse('2026-10-01T03:45:51Z');
  const events = Array.from({ length: 240 }, (_, i) => ({ event_type: 'TEST_RESULT_RECORDED', role: 'EXECUTOR', at: new Date(now - 2 * 3600e3 + i * 30000).toISOString() }));
  const result = activityWindow(events, 24, now);
  assert.equal(result.count, 240);
  assert.equal(result.partial, true);
  assert.match(result.label, /recorte de até 24 h · cobertura parcial/);
  assert.match(activityRange(result), /não atesta a janela completa/);
  assert.match(activityRange(activityWindow([], 48, now)), /não comprova ausência de atividade/);
  assert.equal(activityWindow([{ ...events[0], at: 'invalid' }, { ...events[0], at: '2026-10-02' }], 24, now).count, 0);
});

test('narration uses every pair once per family cycle and keeps the same receipt stable', () => {
  const deck = createNarrationDeck('test-session');
  const count = NARRATION.BOARD_POSTED.heads.length * NARRATION.BOARD_POSTED.tails.length;
  const seen = new Set();
  const fields = Object.fromEntries(['status', 'review', 'result', 'blocker', 'question', 'roadmap', 'meaning', 'limit', 'method', 'by', 'request', 'n'].map(field => [field, 'published ' + field]));
  for (let i = 0; i < count; i++) {
    const line = deck.say('BOARD_POSTED', 'receipt:' + i, fields);
    assert.ok(!seen.has(line), 'repeat at pair ' + i);
    seen.add(line);
    assert.equal(deck.say('BOARD_POSTED', 'receipt:' + i, fields), line);
  }
  assert.equal(seen.size, 14400);
  assert.equal(deck.say('NOT_RECEIVED', 'receipt'), null);
});

test('factual narration never promises execution, fabricates quiet roles or asserts a conscious reaction', () => {
  for (const matrix of Object.values(NARRATION)) {
    for (const line of [...matrix.heads, ...matrix.tails]) assert.doesNotMatch(line, /nenhum papel parado|volta em minutos|ninguém precisou|sem incidente|me surpreendi|ficou com medo|entra na fila hoje|vai consertar/i);
  }
});

test('home prioritizes recovery and roadmap membership; literature consumes versioned Tower synthesis', async () => {
  const ui = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Conferir requisitos dos \{blocked.length\} bloqueios publicados/);
  assert.match(ui, /activeRoadmaps\.has\(t.roadmapId\)/);
  assert.match(ui, /Novas frentes dependem de carta aprovada/);
  assert.match(ui, /frontier=\{frontierDeclared \? r\.frontierIds/);
  assert.match(ui, /frontier\.literature_source \?\? cosmology\.literature_source/);
  assert.match(ui, /source\.updated_at \?\? 'sem data publicada'/);
  assert.doesNotMatch(ui, /const FRONTS|2,8–4,2σ|TRGB no meio|ainda sem ações registradas/);
});


test('scene activity follows explicit RUNNING and does not animate READY as execution', async () => {
  const ui = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const events = ui.slice(ui.indexOf('function sceneEvents('), ui.indexOf('// ---------- raias do ciclo'));
  assert.match(events, /t.status\?\.toUpperCase\(\) !== 'RUNNING'/);
  assert.match(events, /href: '#\/evidencia\?v=RUNNING'/);
  assert.doesNotMatch(events, /rodando ou na fila|batteries.*DISPATCHED/);
});


test('a declared frontier excludes READY records absent from the published IDs', () => {
  const lab = buildLab(snapshot({ DECLARED: { status: 'BLOCKED_INPUT' }, READY_UNDECLARED: { status: 'READY' } }));
  const tests = [...lab.tests.values()];
  assert.deepEqual(roadmapTrail(tests, ['DECLARED']).ahead.map(t => t.id), ['DECLARED']);
  assert.deepEqual(roadmapTrail(tests, []).ahead, []);
  assert.deepEqual(roadmapTrail(tests, null).ahead.map(t => t.id), ['READY_UNDECLARED']);
});


test('missing roadmap state stays unpublished instead of becoming an active charter', () => {
  const state = snapshot({ A: { status: 'READY', roadmap_id: 'UNKNOWN' } });
  state.read_model.roadmaps = [{ roadmap_id: 'UNKNOWN', test_ids: ['A'] }];
  const roadmap = buildLab(state).roadmaps.get('UNKNOWN');
  assert.equal(roadmap.state, 'UNPUBLISHED');
  assert.ok(!['ACTIVE', 'CHARTERED'].includes(roadmap.state));
});


test('since-last-visit summary does not turn a bounded export into a full-period total', async () => {
  const source = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const summary = source.slice(source.indexOf('function AwaySummary('), source.indexOf('// ---------- Busca'));
  assert.match(summary, /eventos recebidos/);
  assert.match(summary, /Recorte de cobertura parcial/);
  assert.match(summary, /não atestam o total do período/);
  assert.doesNotMatch(summary, /resultados chegaram|testes novos nasceram/);
});


test('compact mobile exploration keeps its accessible name when the visible text is hidden', async () => {
  const source = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/atlas-cinematic.css', import.meta.url), 'utf8');
  assert.match(source, /className="explore-toggle" aria-label=\{explore \? 'Voltar ao painel' : 'Explorar a teia'\}/);
  assert.match(css, /\.observatory \.obs-tools>button\{min-width:44px;min-height:44px\}/);
});
