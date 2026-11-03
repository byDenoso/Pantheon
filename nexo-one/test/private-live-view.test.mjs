import test from 'node:test';import assert from 'node:assert/strict';
import {liveEvents, parseWhen} from '../src/private-workspace/liveEvents.ts';
import {workspaceRoute} from '../src/private-workspace/model.ts';

test('live route is reachable inside the private shell', () => {
  assert.deepEqual(workspaceRoute('#/teia/ao-vivo'), {page: 'live'});
});

test('dates written by the automations in three formats are ordered together', () => {
  assert.equal(parseWhen('2026-11-02T20:45:08-03:00'), Date.parse('2026-11-02T20:45:08-03:00'));
  assert.equal(parseWhen('2026-11-02 20:45'), Date.parse('2026-11-02T20:45-03:00'));
  assert.equal(parseWhen('02/11/2026 20:45'), Date.parse('2026-11-02T20:45:00-03:00'));
  assert.equal(parseWhen(''), null);
  assert.equal(parseWhen('ontem'), null);
});

test('mural, results and summary merge newest first, undated last', () => {
  const events = liveEvents(
    [{data: '2026-11-02 10:00', de: 'S4', para: 'S6', texto: 'Seu teste está usando o mesmo prior que o meu.', link: '', tipo: 'reclamação'}],
    [{data: '2026-11-02T12:00:00-03:00', task: 'S6', item: 'X', titulo: 'Pergunta?', resultado: 'Resultado.', numeros: '', limites: '', link_dados: ''}],
    [{data_hora: 'sem data', nivel: 'N1', item: 'P', o_que_mudou: 'Mudou', impacto: 'Impacto', link: ''}],
  );
  assert.deepEqual(events.map(e => e.kind), ['resultado', 'mural', 'resumo']);
  assert.equal(events[1].to, 'S6');
});
