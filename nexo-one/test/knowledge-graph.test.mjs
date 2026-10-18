import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnowledge, claimWeight, layoutKnowledge, scoreHypothesis} from '../src/knowledge/model.ts';
import {workspaceRoute} from '../src/private-workspace/model.ts';
import {knowledgeReadModel} from './helpers/knowledge.fixture.mjs';

const state = {read_model: knowledgeReadModel()};

test('weights follow evidence type, publication, tier, replication and supersession', () => {
  assert.equal(claimWeight({source: 'LITERATURE', evidence: 'COLLABORATION', publication: 'PEER_REVIEWED', tier: 'A'}), 1);
  assert.equal(claimWeight({source: 'LITERATURE', evidence: 'COLLABORATION', publication: 'PREPRINT', tier: 'A'}), 0.7);
  assert.equal(claimWeight({source: 'LITERATURE', evidence: 'INDEPENDENT', publication: 'PEER_REVIEWED', tier: 'C'}), 0.48);
  assert.equal(claimWeight({source: 'LITERATURE', evidence: 'COLLABORATION', publication: 'RETRACTED', tier: 'A'}), 0);
  assert.equal(claimWeight({source: 'LITERATURE', evidence: 'COLLABORATION', publication: 'PEER_REVIEWED', tier: 'A', superseded: true}), 0.3);
  assert.equal(claimWeight({source: 'NEXO', survived: true}), 0.8);
  assert.equal(claimWeight({source: 'NEXO', survived: false}), 0.3);
});

test('claims sharing a data lineage count once per stance', () => {
  const claim = (id, w, lineage) => ({id, label: id, source: 'LITERATURE', ref: null, journal: null, tier: null, value: null, date: null, lineage, survived: false, weight: w, links: [{hypothesis: 'H', stance: 'SUPPORTS'}]});
  const s = scoreHypothesis([claim('a', 0.9, ['d1']), claim('b', 0.7, ['d1']), claim('c', 0.5, ['d2'])], 'H');
  assert.deepEqual(s, {pro: 1.4, con: 0, lineages: 2});
});

test('knowledge graph builds from read_model and filters by time', () => {
  const k = buildKnowledge(state);
  assert.equal(k.questions.length, 3);
  assert.equal(k.hypotheses.length, 6);
  assert.ok(k.claims.length > 20);
  assert.ok(k.claims.every(c => c.links.length > 0));
  const early = scoreHypothesis(k.claims, 'SYN-H1', '2026-02-01'), now = scoreHypothesis(k.claims, 'SYN-H1');
  assert.ok(now.pro + now.con > early.pro + early.con);
  const pos = layoutKnowledge(k);
  assert.ok(k.claims.every(c => pos.has(`c:${c.id}`)) && k.hypotheses.every(h => pos.has(`h:${h.id}`)));
});

test('executed tests linked to hypotheses become NEXO claims; unknown links are dropped', () => {
  const rm = knowledgeReadModel();
  rm.tests = {T1: {id: 'T1', hypothesis_id: 'SYN-H2', verdict: 'REFUTED', review_state: 'SURVIVED', datasets: [{name: 'x', version: '1'}]}, T2: {id: 'T2', hypothesis_id: 'NOPE', verdict: 'SUPPORTED'}};
  rm.claims.BAD = {claim_id: 'BAD', supports: ['NOPE']};
  const k = buildKnowledge({read_model: rm});
  const t1 = k.claims.find(c => c.id === 'test:T1');
  assert.equal(t1.links[0].stance, 'CONTRADICTS');
  assert.equal(t1.weight, 0.8);
  assert.ok(!k.claims.some(c => c.id === 'test:T2'));
  assert.deepEqual(k.claims.find(c => c.id === 'BAD').links, []);
});

test('empty source yields an empty graph without throwing', () => {
  assert.deepEqual(buildKnowledge({}).hypotheses, []);
});

test('#/teia opens the knowledge graph and the cosmic web moves to #/teia/cosmos', () => {
  assert.deepEqual(workspaceRoute('#/teia'), {page: 'web'});
  assert.deepEqual(workspaceRoute('#/teia/cosmos'), {page: 'cosmos'});
});
