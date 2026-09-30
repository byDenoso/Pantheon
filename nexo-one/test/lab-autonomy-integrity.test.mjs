import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { autonomyPresentation } from '../src/features/lab/autonomy-presentation.ts';

const legacy = { window_hours: 24, results: 78, robot_share: .962, decisive_rate: .577, median_hours_to_result: null, contest_closure: .387, recovery_rate: 1, false_block_share: 1 };
const metric = (value, numerator, denominator, scope = 'window') => ({ value, numerator, denominator, scope, definition: 'PUBLISHED_DEFINITION', unit: 'ratio' });
const v2 = () => ({ ...legacy, schema_version: 'AUTONOMY_METRICS_V2', metrics: {
  execution_record_share: metric(.962, 75, 78),
  decisive_rate: metric(.564, 44, 78),
  median_hours_to_result: { ...metric(null, null, null), unit: 'hours', sample_count: 0, coverage: { value: 0, numerator: 0, denominator: 78 } },
  positive_review_closure: metric(.387, 24, 62, 'all_tests'),
  blocked_share: metric(1, 61, 61, 'all_tests'),
} });

test('legacy screenshot figures keep limits: proxy is not autonomy and 58 percent can include contested', () => {
  const view = autonomyPresentation(legacy);
  assert.equal(view.legacy, true);
  assert.equal(view.recent[0].value, '96%');
  assert.match(view.recent[0].label, /execução ou família/);
  assert.match(view.recent[0].description, /participação de pessoas e agentes não é medida/);
  assert.match(view.recent[0].base, /não publicados/);
  assert.equal(view.recent[2].value, '58%');
  assert.match(view.recent[2].label, /legado/);
  assert.match(view.recent[2].description, /pode incluir CONTESTED/);
  assert.equal(view.recent[1].value, '—');
  assert.match(view.recent[1].base, /mediana indisponível/);
});

test('versioned metrics show producer numerators and correct decisive cohort without rewriting legacy aliases', () => {
  const source = v2(), before = structuredClone(source);
  const view = autonomyPresentation(source);
  assert.equal(view.legacy, false);
  assert.equal(view.recent[2].value, '56%');
  assert.equal(view.recent[2].base, '44 / 78 registros');
  assert.equal(view.recent[0].base, '75 / 78 registros');
  assert.equal(view.inventory[0].base, '24 / 62 registros');
  assert.deepEqual(source, before);
});

test('100 percent blocked is the ready-plus-blocked cohort, not all TEST or WORK', () => {
  const blocked = autonomyPresentation(v2()).inventory[1];
  assert.equal(blocked.value, '100%');
  assert.equal(blocked.base, '61 / 61 registros');
  assert.match(blocked.label, /entre READY e BLOCKED/);
  assert.match(blocked.description, /Exclui os outros estados de TEST e a fila de WORK/);
  assert.match(blocked.description, /Não mede bloqueios falsos/);
});

test('missing V2 metrics never silently fall back to a semantically different legacy percentage', () => {
  const source = v2();
  delete source.metrics.decisive_rate;
  const view = autonomyPresentation(source);
  assert.equal(view.recent[2].value, '—');
  assert.equal(view.recent[2].base, 'Numerador e denominador não publicados');
});

test('outcome buckets are only rendered when published under the versioned contract', () => {
  const source = v2();
  source.buckets = { result_verdicts: { PROMOTED: 24, REJECTED: 20, INCONCLUSIVE: 33, CONTESTED: 1 } };
  const view = autonomyPresentation(source);
  assert.equal(view.outcomes.reduce((sum, [, total]) => sum + total, 0), 78);
  assert.deepEqual(view.outcomes.find(([label]) => label === 'CONTESTED'), ['CONTESTED', 1]);
  assert.deepEqual(autonomyPresentation({ ...source, schema_version: undefined }).outcomes, []);
});

test('latency shows coverage, distinguishes absent from zero hours, and keeps empty cohorts unavailable', () => {
  const source = v2();
  let view = autonomyPresentation(source);
  assert.equal(view.recent[1].value, '—');
  assert.match(view.recent[1].base, /^0 \/ 78 resultados com datas válidas/);
  source.metrics.median_hours_to_result = { ...source.metrics.median_hours_to_result, value: 0, sample_count: 1, coverage: { value: .5, numerator: 1, denominator: 2 } };
  source.metrics.blocked_share = metric(null, 0, 0, 'all_tests');
  view = autonomyPresentation(source);
  assert.equal(view.recent[1].value, '0 h');
  assert.equal(view.inventory[1].value, '—');
  assert.match(view.inventory[1].base, /0 \/ 0 registros · sem casos/);
});

test('zero ratio needs a non-empty cohort and zero latency needs a measured sample', () => {
  const source = v2();
  source.metrics.blocked_share = metric(0, 0, 0, 'all_tests');
  source.metrics.median_hours_to_result.value = 0;
  const view = autonomyPresentation(source);
  assert.equal(view.inventory[1].value, '—');
  assert.equal(view.recent[1].value, '—');
  source.metrics.blocked_share = metric(0, 0, 5, 'all_tests');
  assert.equal(autonomyPresentation(source).inventory[1].value, '0%');
});

test('V2 percentages require the documented scope, unit, definition and valid counts', () => {
  for (const patch of [{ scope: 'all_tests' }, { unit: 'hours' }, { definition: '' }, { numerator: 90 }, { denominator: null }]) {
    const source = v2();
    Object.assign(source.metrics.decisive_rate, patch);
    assert.equal(autonomyPresentation(source).recent[2].value, '—');
  }
});

test('ratio display does not manufacture confidence from invalid or unversioned values', () => {
  const source = v2();
  source.metrics.decisive_rate.value = 1.1;
  assert.equal(autonomyPresentation(source).recent[2].value, '—');
  source.schema_version = 'UNKNOWN_FUTURE_CONTRACT';
  assert.equal(autonomyPresentation(source).legacy, true);
});

test('UI separates temporal and stock cohorts, labels legacy data and keeps zero-result cards visible', async () => {
  const ui = await readFile(new URL('../src/features/lab/LabApp.tsx', import.meta.url), 'utf8');
  const autonomy = ui.slice(ui.indexOf('function Autonomy('), ui.indexOf('// ---------- Famílias'));
  assert.match(autonomy, /Agregado legado/);
  assert.match(autonomy, /Resultados na janela · testes principais/);
  assert.match(autonomy, /Estoque na leitura · sem recorte temporal/);
  assert.match(autonomy, /a.computed_at/);
  assert.match(autonomy, /cell.base/);
  assert.doesNotMatch(autonomy, /!a.results|feito só pelo robô|sem agente nem pessoa|testes que decidem|da ideia ao resultado/);
});
