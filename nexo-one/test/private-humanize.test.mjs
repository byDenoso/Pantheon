import test from 'node:test';import assert from 'node:assert/strict';
import {humanizeResult, isIdLike, isCodeLine, metricsOf, humanTitle} from '../src/private-workspace/humanize.ts';
import {towerDraft} from '../server/atlas/public-selection.mjs';

const machine = {titulo: '6ae3bfd9a9848191b3069fd3cd2a41f1-20261102T2152-V34-T0-E0-01', resultado: 'T0_PROJECTOR_QUADRATIC_COVARIANT|SN_ADVANTAGE_DISAPPEARS_WITH_MATCHED_LCDM_REFIT|C1_C2|NOVELTY_NOT_DEMONSTRATED', numeros: '{"schema":"NEXO_S5_V34","SN_n":1580,"delta_SN_R29_minus_LCDM_refit":0.3819852558110597,"BAO_SN_block_delta_R29_LCDM":-3.6040603744313557,"script_sha256":"0525"}'};

test('machine rows lose IDs, codes and JSON but keep them as technical detail', () => {
  const h = humanizeResult(machine, 'S5');
  assert.equal(h.title, 'Resultado técnico de S5');
  assert.match(h.body, /^Construção teórica; .*a vantagem desaparece num controle.*novidade ainda não demonstrada\.$/);
  assert.deepEqual(h.metrics, ['Δ SN R29 − ΛCDM refit = 0,382', 'BAO SN block Δ R29 ΛCDM = -3,604']);
  assert.ok(h.technical.includes(machine.titulo) && h.technical.includes('NOVELTY_NOT_DEMONSTRATED'));
  for (const part of [h.title, h.body, ...h.metrics]) assert.doesNotMatch(part, /[0-9a-f]{16}|_|\{|\|/);
});

test('reader-facing rows pass through; a leading question becomes the title', () => {
  const h = humanizeResult({titulo: '6ae3bfd9a9848191b3069fd3cd2a41f1-20261103-R1', resultado: 'A preferência sobrevive sem as supernovas próximas? Com Ωm = 0,315 ela cai cerca de 75%.', numeros: 'redução = 75%'});
  assert.equal(h.title, 'A preferência sobrevive sem as supernovas próximas?');
  assert.equal(h.body, 'Com Ωm = 0,315 ela cai cerca de 75%.');
  assert.deepEqual(h.metrics, ['redução = 75%']);
  assert.equal(h.technical, '6ae3bfd9a9848191b3069fd3cd2a41f1-20261103-R1');
});

test('detectors do not flag ordinary Portuguese', () => {
  assert.equal(isIdLike('Setor escuro'), false);
  assert.equal(isCodeLine('A melhora do ajuste depende do prior em Ωm.'), false);
  assert.equal(isCodeLine('T0|C1_C2'), true);
  assert.deepEqual(metricsOf('{"note":"x"}'), []);
  assert.equal(humanTitle('S1_RUN71_EINSTEIN_FRAME', 'Frente'), 'Frente');
});

test('public drafts start from reader-facing text only', () => {
  const d = towerDraft(machine);
  assert.equal(d.question['pt-BR'], ''); assert.equal(d.result['pt-BR'], '');
  const e = towerDraft({titulo: machine.titulo, resultado: 'A energia escura muda? Sim, um pouco.', numeros: 'Δχ² = 3,1', limites: 'vale para SN+BAO', metodo: 'Ajuste CPL contra ΛCDM.'});
  assert.equal(e.question['pt-BR'], 'A energia escura muda?'); assert.equal(e.result['pt-BR'], 'Sim, um pouco. Δχ² = 3,1'); assert.equal(e.method['pt-BR'], 'Ajuste CPL contra ΛCDM.');
});
