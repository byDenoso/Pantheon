import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildLab } from '../src/features/lab/model.ts';
import { currentVerdictText } from '../src/features/lab/presentation.ts';
import { numbersOf, selectScienceFocus, scientificStatRows } from '../src/features/lab/science-presentation.ts';

const entities = records => [...buildLab({ generated_at: '2026-09-30T12:00:00Z', graph: { nodes: [], edges: [] }, read_model: { tests: records }, science_projection_v1: { tests: Object.entries(records).map(([id, record]) => ({ id, ...record })) } }).tests.values()];
const done = { status: 'DONE', result_meaning: 'Interpretação registrada.' };

test('focus prefers published confirmation over recent or extreme provisional numbers, without requiring execution readiness', () => {
  const records = {
    PROVISIONAL: { ...done, executed_at: '2026-09-30T12:00:00Z', statistics: { delta_chi2: -1000 } },
    CONFIRMED_OLD: { ...done, review_state: 'CONFIRMED', executed_at: '2026-09-28T12:00:00Z', statistics: { delta_chi2: -100 } },
    CONFIRMED_NEW: { ...done, review_state: 'CONFIRMED', executed_at: '2026-09-29T12:00:00Z', readiness: { eligible: false } },
  };
  const tests = entities(records), original = structuredClone(tests);
  const focus = selectScienceFocus(tests);
  assert.equal(focus.test.id, 'CONFIRMED_NEW');
  assert.match(focus.reason, /confirmados pela revisão publicada/);
  assert.match(focus.reason, /magnitude dos números não determina/);
  assert.deepEqual(tests, original);
});

test('DDELEARN inconclusive result remains inconclusive despite delta chi square -17.1', () => {
  const [dde] = entities({ 'DDELEARN26-001-BACKGROUND-GROWTH-DECOUPLING': {
    ...done, verdict: 'INCONCLUSIVE', statistics: { delta_chi2: -17.1023599219 }, executed_at: '2026-09-24T09:00:00Z',
  } });
  const focus = selectScienceFocus([dde]);
  assert.equal(focus.test, dde);
  assert.match(focus.reason, /Sem resultado confirmado/);
  assert.match(currentVerdictText(dde), /resultado inconclusivo/);
  assert.equal(dde.verdictRaw, 'INCONCLUSIVE');
  const [[label, explanation]] = scientificStatRows(dde);
  assert.equal(label, 'Δχ² = -17.1');
  assert.match(explanation, /ordem da subtração não está declarada/);
  assert.match(explanation, /isolado não inclui penalização de complexidade nem validação completa/);
  assert.doesNotMatch(explanation, /claramente melhor|evidência forte|dados preferem/);
  assert.equal(numbersOf(dde).delta_chi2, -17.1023599219);
});

test('focus excludes operational, historical, contested-child and unavailable-only records', () => {
  const tests = entities({
    READY: { ...done, status: 'READY' }, RUNNING: { ...done, status: 'RUNNING' },
    BLOCKED: { ...done, status: 'BLOCKED_INPUT' }, ARCHIVED: { ...done, status: 'ARCHIVED' },
    HISTORY: { ...done, historical: true, review_state: 'CONFIRMED' },
    EMPTY: { status: 'DONE', result: { value: null, source_ref: 'reference', unavailable_reason: 'NOT_PUBLISHED' } },
    'CONTEST-A-1': { ...done, review_state: 'CONFIRMED' },
  });
  assert.equal(selectScienceFocus(tests), null);
});

test('focus compares actual timestamps and states creation fallback or missing chronology', () => {
  let focus = selectScienceFocus(entities({
    OLDER: { ...done, executed_at: '2026-09-30T11:00:00+03:00' },
    NEWER: { ...done, executed_at: '2026-09-30T09:00:00Z' },
  }));
  assert.equal(focus.test.id, 'NEWER');
  focus = selectScienceFocus(entities({ A: { ...done, executed_at: 'invalid', created_at: '2026-09-30T10:00:00Z' } }));
  assert.match(focus.reason, /criação do registro/);
  focus = selectScienceFocus(entities({ B: done, A: done }));
  assert.equal(focus.test.id, 'A');
  assert.match(focus.reason, /sem inferir recência/);
});

test('refuted fallback keeps current review separate from original promoted interpretation', () => {
  const [entity] = entities({ A: { ...done, verdict: 'PROMOTED', review_state: 'REFUTED', statistics: { sigma_raw: 6 } } });
  const focus = selectScienceFocus([entity]);
  assert.match(focus.reason, /registro refutado/);
  assert.match(currentVerdictText(focus.test), /revisão atual refutou/);
  assert.equal(entity.verdictRaw, 'PROMOTED');
  assert.match(scientificStatRows(entity)[0][1], /não equivale a confirmação ou descoberta/);
});

test('p values are displayed without deriving sigma or the probability of a hypothesis', () => {
  const [entity] = entities({ A: { ...done, statistics: { p_value: 0.00001 } } });
  const rows = scientificStatRows(entity);
  assert.equal(rows.length, 1);
  assert.match(rows[0][1], /Sob a hipótese nula/);
  assert.match(rows[0][1], /Não é a probabilidade de a hipótese ser verdadeira/);
  assert.doesNotMatch(rows[0][0], /σ/);
  const [invalid] = entities({ A: { ...done, statistics: { p_value: 1.5 } } });
  assert.match(scientificStatRows(invalid)[0][1], /fora do intervalo válido/);
});

test('named chi square convention gives fit direction without promoting an evidence class', () => {
  const [entity] = entities({ A: { ...done, statistics: { delta_chi2_lcdm_minus_w0wa: 17.1, delta_bic: -100, ln_bayes_factor: 99 } } });
  const rows = scientificStatRows(entity);
  assert.match(rows[0][1], /w0wa tem χ² menor/);
  assert.doesNotMatch(JSON.stringify(rows), /preferem energia escura|evidência forte|Jeffreys/);
});

test('result card and hero lead with current verdict and explain focus; no synthetic discovery scale or uncertainty ellipse', async () => {
  const ui = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const card = ui.slice(ui.indexOf('function ResultCard('), ui.indexOf('// ---------- Frentes da cosmologia'));
  assert.match(ui, /Resultado científico em destaque:[\s\S]*?currentVerdictText\(focus.test\)/);
  assert.match(card, /Por que este destaque:[\s\S]*?selectionReason/);
  assert.match(card, /Veredito atual:[\s\S]*?currentVerdictText\(t\)/);
  assert.match(card, /Revisão publicada:[\s\S]*?Resultado bruto:/);
  assert.ok(card.indexOf('currentVerdictText(t)') < card.indexOf('humanize(t.meaning)'));
  assert.match(card, /incerteza e covariância não representadas/);
  assert.doesNotMatch(ui, /zFromP|nível de descoberta|claramente melhor|<ellipse/);
});
