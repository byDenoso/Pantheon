import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectome, parseLane, somaDistance, AXON_CONDUCTION } from '../src/viewmodels/connectome.ts';

const node = (id, type, domain, status_group) => ({ id, type, domain, label: id, status_group });
const owns = (from, to) => ({ id: from + '>' + to, from, to, kind: 'OWNS', weight: 1 });
const fil = (a, b, weight, status = 'ESTABLISHED') => ({ id: a + b + weight, from_domain: a, to_domain: b, domain: a, weight, status });

function world({ lanes, failing = [], filaments } = {}){
  const nodes = [
    node('d:N', 'DOMAIN', 'NEXO'), node('d:S', 'DOMAIN', 'SCIENCE'),
    node('d:E', 'DOMAIN', 'ENGINEERING'), node('d:O', 'DOMAIN', 'OLYMPUS'),
  ];
  const edges = [];
  for (let i = 0; i < 12; i++){ nodes.push(node('s' + i, 'TEST', 'SCIENCE', i < 8 ? 'DONE' : 'READY')); edges.push(owns('d:S', 's' + i)); }
  for (let i = 0; i < 6; i++){ nodes.push(node('e' + i, 'TEST', 'ENGINEERING', 'DONE')); edges.push(owns('d:E', 'e' + i)); }
  for (let i = 0; i < 4; i++){ nodes.push(node('o' + i, 'TEST', 'OLYMPUS', 'DONE')); edges.push(owns('d:O', 'o' + i)); }
  nodes.push(node('n0', 'ACTION', 'NEXO')); edges.push(owns('d:N', 'n0'));
  return {
    graph: { nodes, edges },
    filaments: filaments ?? [
      ...Array.from({ length: 6 }, () => fil('NEXO', 'SCIENCE', 0.8)),
      fil('SCIENCE', 'OLYMPUS', 0.7, 'PROVISIONAL'),
      fil('NEXO', 'NEXO', 0.8),
    ],
    lanes: lanes ?? [
      { domain: 'SCIENCE', current_state: '12 testes · 5 concluídos · 0 em andamento · 4 prontos' },
      { domain: 'ENGINEERING', current_state: '6 testes · 6 concluídos · 0 em andamento · 0 prontos' },
      { domain: 'OLYMPUS', current_state: '4 testes · 0 concluídos · 0 em andamento · 0 prontos' },
    ],
    guardian: { failing_areas: failing },
  };
}

test('lanes parse into counts', () => {
  assert.deepEqual(parseLane('108 testes · 69 concluídos · 10 em andamento · 23 prontos'), { tests: 108, done: 69, running: 10, ready: 23 });
  assert.equal(parseLane('texto sem números'), null);
});

test('myelin is rationed by the canonical lane, never by graph status_group', () => {
  const m = buildConnectome(world(), { iterations: 60 });
  const myel = d => m.nodes.filter(n => n.domain === d && n.myelinated).length;
  assert.equal(myel('SCIENCE'), 5, 'graph says 8 DONE, the lane says 5');
  assert.equal(myel('ENGINEERING'), 6);
  assert.equal(myel('OLYMPUS'), 0, 'graph claims 4 DONE; the lane says zero and the lane wins');
});

test('a domain with work but nothing done and nothing ready fires; guardian failures fire Nexo', () => {
  const m = buildConnectome(world({ failing: ['inbox'] }), { iterations: 60 });
  assert.equal(m.attention.OLYMPUS, true);
  assert.equal(m.attention.NEXO, true);
  assert.equal(m.attention.SCIENCE, undefined);
});

test('self-loop filaments are counted but never drawn as axons', () => {
  const m = buildConnectome(world(), { iterations: 60 });
  assert.equal(m.selfLoops, 1);
  assert.ok(m.axons.every(a => a.from !== a.to));
  assert.equal(m.axons.find(a => a.status === 'PROVISIONAL').conduction, AXON_CONDUCTION.PROVISIONAL);
});

test('distance between somata is derived from filaments: more filaments, closer', () => {
  const m = buildConnectome(world(), { iterations: 400 });
  const ns = somaDistance(m, 'NEXO', 'SCIENCE');
  const eo = somaDistance(m, 'ENGINEERING', 'OLYMPUS');
  assert.ok(Number.isFinite(ns) && Number.isFinite(eo));
  assert.ok(ns < eo, `six filaments should pull Nexo–Science (${ns.toFixed(0)}) closer than unlinked Eng–Olympus (${eo.toFixed(0)})`);
});

test('mass is the owned subtree', () => {
  const m = buildConnectome(world(), { iterations: 20 });
  const sci = m.nodes[m.somata.SCIENCE];
  assert.equal(sci.mass, 13);
});
