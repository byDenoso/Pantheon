import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const rows = publicAtlasProjection().tests;

test('reviewed questions distinguish data, priors and redshift partitions without dropping records', () => {
  assert.equal(rows.length, 215);
  assert.equal(new Set(rows.map(row => row.question['pt-BR'])).size, 215);
  for (const row of rows.slice(1, 19)) {
    const method = row.method['pt-BR'].split('Condições desta comparação: ')[1];
    const question = row.question['pt-BR'];
    const prior = method.match(/Ωm = ([^;]+)/)[1];
    const compilations = method.match(/compilações ([^;]+)/)[1].split(', ');
    const bands = method.match(/faixas de redshift (.+)\.$/)[1].replaceAll(' a ', '–');
    assert.ok(question.includes(`Ωm = ${prior}`));
    assert.ok(compilations.every(name => question.includes(name)));
    assert.ok(question.includes(bands));
  }
});

test('same displayed result does not collapse distinct sample thresholds', () => {
  const sample = rows.slice(197, 200);
  assert.deepEqual(sample.map(row => Number(row.question['pt-BR'].match(/mínimo de (\d+) casos/)[1])), [20, 30, 40]);
  assert.deepEqual(sample[1].result, sample[2].result);
  assert.notDeepEqual(sample[1].method, sample[2].method);
});

test('full-shape questions distinguish previously omitted redshift bins', () => {
  for (const [index, redshift] of [[149, '0,51'], [150, '0,706'], [151, '0,919']]) {
    assert.ok(rows[index].question['pt-BR'].includes(`redshift efetivo ${redshift}`));
    assert.ok(rows[index].method['pt-BR'].includes(`z = ${redshift}`));
  }
});

test('verified same-design repetitions are explicitly described and remain accessible', () => {
  for (const [first, repeat] of [[58, 59], [60, 61], [62, 63]]) {
    assert.match(rows[repeat].question['pt-BR'], /^Repetindo o mesmo desenho:/);
    assert.match(rows[repeat].method['pt-BR'], /não constitui um novo desenho de teste/);
    assert.deepEqual(rows[first].result, rows[repeat].result);
  }
});

test('editorial specificity preserves every previously reviewed scientific result', () => {
  const digest = createHash('sha256').update(JSON.stringify(rows.map(row => row.result))).digest('hex');
  assert.equal(digest, '7e4a1c35d224b727c20dd50544ff10911bbb920143705420ab6e75be012d67fa');
});

test('publication count does not claim scientific independence', () => {
  const ui = readFileSync('src/atlas/ui/PublicTestList.tsx', 'utf8');
  assert.match(ui, /testes associados/);
  assert.match(ui, /não representam descobertas independentes/);
  assert.match(ui, /are not independent discoveries/);
  assert.match(ui, /teste associado/);
});
