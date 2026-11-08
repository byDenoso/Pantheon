import test from 'node:test';
import assert from 'node:assert/strict';
import {architectureView, retainMuralRow, whenOf, ARCH_SINCE} from '../server/atlas/architecture.mjs';
import {tableFromRows, MURAL_COLUMNS} from '../server/atlas/shadow-board.mjs';
import {projectPrivateShadowBoard} from '../server/atlas/private-shadow-source.mjs';
import {manuscritosTsv} from '../scripts/manuscritos-para-tower.mjs';
import {parseWhen} from '../src/private-workspace/liveEvents.ts';
import {parseCadence, crew} from '../src/cockpit/team.ts';

const row = (data, de, tipo, id, texto = '', item = '') => ({data, de, para: '', texto, link: '', tipo, item, id});
const available = {mural: 'available', manuscritos: 'available'};

test('timestamps: ISO, local with or without zone name, and day-first', () => {
  const t = Date.parse('2026-11-06T12:00:00-03:00');
  assert.equal(whenOf('2026-11-06 12:00 America/Sao_Paulo'), t);
  assert.equal(whenOf('2026-11-06T12:00:00-03:00'), t);
  assert.equal(whenOf('06/11/2026 12:00'), t);
  assert.equal(whenOf('ontem'), null);
  assert.equal(parseWhen('2026-11-06 12:00 America/Sao_Paulo'), t);
});

test('queues, pending hypotheses and open requests follow the IDs rows cite', () => {
  const mural = [
    row('2026-11-07T10:00:00-03:00', 'S1', 'HIPOTESE_PRE', 'S1-H1'),
    row('2026-11-07T10:01:00-03:00', 'S2', 'HIPOTESE_PRE', 'S2-H1'),
    row('2026-11-07T10:05:00-03:00', 'LUMIA', 'PRIOR_ART_PRE', 'L-1', 'ref S1-H1: não encontrei'),
    row('2026-11-07T11:00:00-03:00', 'S7', 'PEDIDO_AJUDA', 'S7-PEDIDO-01', 'SHA diverge'),
    row('2026-11-07T11:30:00-03:00', 'S6', 'PEDIDO_AJUDA', 'S6-PEDIDO-01', 'colunas'),
    row('2026-11-07T12:00:00-03:00', 'P', 'AJUDA_RESPOSTA', 'P-1', 'AJUDA_RESPOSTA ao pedido S7-PEDIDO-01 (MURAL3643)'),
    row('2026-11-07T12:10:00-03:00', 'S1', 'VARREDURA_RESULTADO', 'S1-R1'),
  ];
  const view = architectureView({mural, manuscritos: []}, available, new Date('2026-11-07T13:00:00Z'));
  const count = q => view.queues.find(x => x.queue === q).count;
  assert.deepEqual(view.queues.map(q => q.queue), ['HIPOTESE_PRE', 'PRIOR_ART_PRE', 'HIPOTESE_DUPLICADA', 'VARREDURA_REGISTRO', 'VARREDURA_RESULTADO', 'CANDIDATO_ABERTO', 'PEDIDO_AJUDA', 'PAPER_CANDIDATO', 'DECISAO_DENER']);
  assert.equal(count('HIPOTESE_PRE'), 2);
  assert.equal(count('PEDIDO_AJUDA'), 2);
  assert.deepEqual(view.pendingHypotheses.map(h => h.id), ['S2-H1']);
  assert.deepEqual(view.openRequests.map(h => h.id), ['S6-PEDIDO-01']);
  assert.deepEqual(view.placar, {since: new Date(ARCH_SINCE).toISOString(), g3: 0, g4: 0, g5: 0, tests: 1});
});

test('scoreboard counts achados by queue, ignores grade words in free text and pre-reformulation rows', () => {
  const mural = [
    row('2026-11-06T09:00:00-03:00', 'S3', 'CANDIDATO_ABERTO', 'OLD-1'),
    row('2026-11-07T09:00:00-03:00', 'S2', 'VARREDURA_RESULTADO', 'S2-R1', 'G0 G1 G2 G3 G4=0 G5'),
    row('2026-11-07T10:00:00-03:00', 'S2', 'CANDIDATO_ABERTO', 'S2-C1'),
    row('2026-11-07T10:30:00-03:00', 'S2', 'CANDIDATO_ABERTO', 'S2-C1', 'repetido'),
    row('2026-11-07T10:40:00-03:00', 'S4', 'CANDIDATO_ABERTO', 'S4-C1'),
    row('2026-11-07T11:00:00-03:00', 'LUMIA', 'PRIOR_ART_PRE', 'L-9', 'S2-C1: não encontrei'),
    row('2026-11-07T11:05:00-03:00', 'LUMIA', 'PRIOR_ART_PRE', 'L-10', 'S4-C1: já publicado'),
    row('2026-11-07T12:00:00-03:00', 'P', 'PAPER_CANDIDATO', 'PC-1'),
    row('2026-11-07T12:05:00-03:00', 'P', 'DECISAO_DENER', 'D-1', 'Escolher periódico para PC-1', 'Cartão PC-1'),
    row('2026-11-07T12:30:00-03:00', 'P', 'DECISAO_DENER', 'D-2', 'segundo cartão'),
    row('2026-11-07T13:00:00-03:00', 'P', 'AJUDA_RESPOSTA', 'P-5', 'seguimento de D-1'),
  ];
  const view = architectureView({mural}, available);
  assert.deepEqual([view.placar.g3, view.placar.g4, view.placar.g5], [2, 1, 1]);
  assert.deepEqual(view.decisions.map(d => d.id), ['D-2', 'D-1']);
  assert.equal(view.decisions[1].mentions, 1);
  assert.equal(view.decisions[1].title, 'Cartão PC-1');
});

test('window rows older than 300 survive only for the three card queues, and only after the reformulation', () => {
  const header = ['data', 'de', 'para', 'texto', 'link', 'tipo', 'item', 'id'];
  const line = (data, tipo, id) => [data, 'P', '', 't', '', tipo, '', id];
  const rows = [header,
    line('2026-11-05T08:00:00-03:00', 'DECISAO_DENER', 'OLD'),
    line('2026-11-07T08:00:00-03:00', 'DECISAO_DENER', 'KEEP'),
    line('2026-11-07T08:01:00-03:00', 'HIPOTESE_PRE', 'H-OLD'),
    ...Array.from({length: 300}, (_, i) => line('2026-11-07T09:00:00-03:00', 'VARREDURA_REGISTRO', `V${i}`)),
  ];
  const kept = tableFromRows(rows, MURAL_COLUMNS, ['tipo', 'item', 'id'], retainMuralRow);
  assert.equal(kept.length, 301);
  assert.deepEqual(kept.map(r => r.id).slice(0, 2), ['KEEP', 'V0']);
  assert.equal(tableFromRows(rows, MURAL_COLUMNS, ['tipo', 'item', 'id']).length, 300);
});

test('manuscript state comes from the Tower tab, grouped, without local paths', () => {
  const manuscritos = [
    {id: 'X1', titulo: 'A', tipo: 'nota', alvo: 'RNAAS', estado: 'pronta', referee_ia: '80%', dono: 'Dener (portal)', proxima_acao: 'submeter', pacote: 'C:\\privado'},
    {id: 'X2', titulo: 'B', tipo: 'paper', alvo: 'MNRAS', estado: 'REJEITADO 05/11', referee_ia: '', dono: 'interno', proxima_acao: '', pacote: ''},
    {id: 'X3', titulo: 'C', tipo: 'paper', alvo: 'OJAp', estado: '3 REJEICOES', referee_ia: '', dono: 'interno', proxima_acao: '', pacote: ''},
    {id: 'X4', titulo: 'D', tipo: 'nota', alvo: 'RNAAS', estado: 'abaixo do corte (68%); resumo corrigido', referee_ia: '', dono: 'Claude', proxima_acao: '', pacote: ''},
  ];
  const view = architectureView({mural: [], manuscritos}, available);
  assert.deepEqual(view.manuscripts.counts, {pronto: 1, rejeitado: 2, outro: 1});
  assert.equal(view.manuscripts.rows[0].needsDener, true);
  assert.equal(JSON.stringify(view).includes('privado'), false);
  assert.equal(architectureView({mural: [], manuscritos}, {mural: 'available'}).manuscripts.available, false);
  assert.equal(architectureView(null, {mural: 'unavailable'}).available, false);
});

test('a board read before the MANUSCRITOS tab existed is still valid', () => {
  const tabs = Object.fromEntries(['roadmap', 'mural', 'resumo', 'resultados', 'equipe'].map(t => [t, []]));
  const board = {contract: 'NEXO_SHADOW_BOARD_V1', access: 'PRIVATE', source_id: '1wizywUGEMd_8KrNqMcz5PQig3KgOTbZd8ENkTW8nRKw', availability: {mural: 'available'}, ...tabs};
  const projected = projectPrivateShadowBoard(board);
  assert.deepEqual(projected.manuscritos, []);
  assert.equal(projected.availability.manuscritos, 'unknown');
});

test('manuscritos.csv converts to tab-separated rows and rejects another header', () => {
  const csv = 'id,titulo,tipo,alvo,estado,referee_ia,dono,proxima_acao,pacote\nA,"um, dois",nota,RNAAS,pronta,80%,Dener,submeter,pasta\n';
  assert.equal(manuscritosTsv(csv).split('\n')[1], 'A\tum, dois\tnota\tRNAAS\tpronta\t80%\tDener\tsubmeter\tpasta');
  assert.throws(() => manuscritosTsv('a,b\n1,2\n'), /header must be/);
});

test('the new roster reads from EQUIPE: cadence text, shared Lumia name, retired rows', () => {
  assert.deepEqual(parseCadence('1h :05 America/Sao_Paulo'), {kind: 'hourly', every: 1, minute: 5, label: 'A cada hora, no minuto 05'});
  assert.equal(parseCadence('1h :02 America/Sao_Paulo').minute, 2);
  assert.equal(parseCadence('a cada 1 hora, minuto :58').minute, 58);
  assert.equal(parseCadence('diária 07:00 America/Sao_Paulo').kind, 'daily');
  assert.equal(parseCadence('a cada 3 horas').kind, 'unknown');
  const now = Date.parse('2026-11-07T13:00:00-03:00');
  const equipe = [
    {papel: 'S1 Energia escura e expansão', cadencia: '1h :05 America/Sao_Paulo', estado: 'ATIVA', frentes: 'BAO'},
    {papel: 'Lumia · Bibliotecária', cadencia: '1h :02 America/Sao_Paulo', estado: 'ATIVA', frentes: ''},
    {papel: 'Lumia · Desbloqueadora', cadencia: '1h :58 America/Sao_Paulo', estado: 'ATIVA', frentes: ''},
    {papel: 'R', cadencia: '1h :26 America/Sao_Paulo', estado: 'PAUSADA_CORE4', frentes: 'HISTORICO'},
  ];
  const events = [{key: 'a', kind: 'mural', when: now - 60_000, agent: 'Lumia', title: '', body: 'x'}, {key: 'b', kind: 'mural', when: now - 60_000, agent: 'S1', title: '', body: 'y'}];
  const out = crew(equipe, events, now);
  const by = n => out.find(m => m.name === n);
  assert.equal(by('S1').last, now - 60_000);
  assert.equal(by('Lumia · Bibliotecária').shared, true);
  assert.equal(by('Lumia · Bibliotecária').last, null);
  assert.equal(by('R').retired, true);
  assert.equal(out.at(-1).name, 'R');
});
