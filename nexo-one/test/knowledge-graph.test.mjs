import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnowledge, claimWeight, layoutKnowledge, planKnowledge, sceneLabels, satellites, claimsByHypothesis, overlaps, scoreHypothesis, CLAIM_BUDGET, PAGE_N, TOP_N} from '../src/knowledge/model.ts';
import {workspaceRoute} from '../src/private-workspace/model.ts';
import {knowledgeReadModel, knowledgeStressReadModel} from './helpers/knowledge.fixture.mjs';

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

// ---- scale: progressive disclosure, layout and label geometry --------------------------------------------------------
const stress = buildKnowledge({read_model: knowledgeStressReadModel()});
const VIEW = {w: 1440, h: 900 - 52 - 190}; // canvas under the toolbar, minus the legend strip
const fitScale = scene => Math.min(VIEW.w / (scene.box.x1 - scene.box.x0), VIEW.h / (scene.box.y1 - scene.box.y0));
const nodeBox = (n, k) => ({x0: (n.x - n.r) * k, y0: (n.y - n.r) * k, x1: (n.x + n.r) * k, y1: (n.y + n.r) * k});
const noOverlap = (boxes, what) => { for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${what}: ${i} and ${j} overlap`); };

test('stress fixture has the real shape: 26 questions, 109 hypotheses, 630 claims, one 70-hypothesis group', () => {
  assert.equal(stress.questions.length, 26);
  assert.equal(stress.hypotheses.length, 109);
  assert.equal(stress.claims.length, 630);
  assert.ok(stress.claims.every(c => c.links.length > 0));
  const big = stress.hypotheses.filter(h => h.question === 'Q-UNASSIGNED');
  assert.equal(big.length, 70);
  assert.ok(big.every(h => h.label.length > 80 && /^HYP-T-DE-ANISO-SRS26-\d+$/.test(h.id)));
});

test('overview draws top hypotheses, one cluster per group, at most 80 claims', () => {
  const scene = planKnowledge(stress, {aspect: VIEW.w / VIEW.h});
  assert.ok(scene.claims.length > 0 && scene.claims.length <= CLAIM_BUDGET);
  assert.equal(scene.groups.length, 4, 'tiny questions and the unassigned group wait in the tray');
  assert.ok(scene.tray && !scene.tray.open && scene.tray.label.includes('(10)'));
  for (const g of scene.groups) {
    assert.ok(g.top.length <= TOP_N && g.members.length === 0);
    assert.equal(g.top.length + g.rest.length, g.total);
    assert.equal(scene.nodes.has(`k:${g.id}`), g.rest.length > 0);
  }
  const perGroup = new Map(); for (const c of scene.claims) perGroup.set(c.group, (perGroup.get(c.group) ?? 0) + 1);
  assert.ok([...perGroup.values()].every(n => n <= 12));
  const top3 = new Set(scene.groups.flatMap(g => g.top.slice(0, 3)));
  assert.ok(scene.claims.every(c => top3.has(c.host)), 'claims hang only on the top three hypotheses of a group');
});

test('ranking puts PROMOTED and ACTIVE first', () => {
  const scene = planKnowledge(stress, {aspect: 1.8});
  const rank = s => s === 'PROMOTED' ? 0 : s === 'ACTIVE' || s === 'READY' ? 1 : 2, status = new Map(stress.hypotheses.map(h => [h.id, h.status]));
  for (const g of scene.groups) { const order = scene.ranked.get(g.id).map(h => rank(status.get(h.id))); assert.deepEqual(order, [...order].sort((a, b) => a - b)); }
});

test('layout is deterministic and group boxes never intersect, in every disclosure state', () => {
  const states = [{}, {tray: true}, {tray: true, expanded: new Set(['Q-UNASSIGNED', 'SYN-Q-EXP']), pages: new Map([['Q-UNASSIGNED', 1]])}, {aspect: 0.46, compact: true, tray: true}];
  for (const st of states) {
    const a = planKnowledge(stress, {aspect: 1.6, ...st}), b = planKnowledge(stress, {aspect: 1.6, ...st});
    assert.equal(JSON.stringify([...a.nodes]), JSON.stringify([...b.nodes]), 'same input, same coordinates');
    noOverlap([...a.groups.map(g => g.box), ...(a.tray ? [a.tray.box] : [])], 'boxes');
    for (const g of a.groups) for (const n of a.nodes.values()) if (n.group === g.id && n.kind !== 'claim') assert.ok(n.x >= g.box.x0 && n.x <= g.box.x1 && n.y >= g.box.y0 && n.y <= g.box.y1, `${n.key} outside its group`);
  }
});

test('a cluster expands in place to at most 24 members per page, with a pager', () => {
  const scene = planKnowledge(stress, {aspect: 1.6, tray: true, expanded: new Set(['Q-UNASSIGNED']), pages: new Map([['Q-UNASSIGNED', 2]])});
  const g = scene.groups.find(x => x.id === 'Q-UNASSIGNED');
  assert.equal(g.rest.length, 62); assert.equal(g.pages, 3); assert.equal(g.page, 2);
  assert.equal(g.members.length, 62 - 2 * PAGE_N); assert.ok(g.members.length <= PAGE_N);
  assert.ok(scene.nodes.has('p:Q-UNASSIGNED'));
  assert.ok(g.members.every(id => scene.nodes.has(`h:${id}`)));
  assert.ok(scene.claims.length <= CLAIM_BUDGET, 'expanding never adds claims to the overview');
  assert.equal(scene.where.get(g.members[0]).restIndex, 2 * PAGE_N);
});

test('labels at fit are at least 11px, never overlap each other or a node, and most top hypotheses keep text', () => {
  for (const st of [{}, {tray: true}, {tray: true, expanded: new Set(['Q-UNASSIGNED'])}]) {
    const scene = planKnowledge(stress, {aspect: VIEW.w / VIEW.h, ...st}), k = fitScale(scene);
    const labels = sceneLabels(stress, scene, {scale: k});
    assert.ok(labels.size > 4);
    assert.ok([...labels.values()].every(l => l.size >= 11 && l.lines.length <= 2 && l.lines.every(t => t.length <= 31)));
    noOverlap([...labels.values()].map(l => l.box), 'labels');
    for (const l of labels.values()) for (const n of scene.nodes.values()) if (n.key !== l.key) assert.ok(!overlaps(l.box, nodeBox(n, k)), `label ${l.key} covers ${n.key}`);
    if (!st.tray) { const top = scene.groups.flatMap(g => g.top), shown = top.filter(id => labels.has(`h:${id}`)).length; assert.ok(shown >= top.length * 0.8, `${shown}/${top.length} top hypotheses labelled`); }
    for (const g of scene.groups) assert.ok(labels.get(g.hub.key)?.title, 'every question hub has a title');
  }
});

test('focus: a selected hypothesis gets up to 36 satellites and always a label; drawn claims are skipped', () => {
  const scene = planKnowledge(stress, {aspect: 1.6}), by = claimsByHypothesis(stress);
  const id = [...by.entries()].filter(([h]) => scene.nodes.has(`h:${h}`)).sort((a, b) => b[1].length - a[1].length)[0][0];
  const sat = satellites(scene, id, by.get(id), 36);
  assert.equal(sat.length, Math.min(36, by.get(id).length));
  const rest = satellites(scene, id, by.get(id), 36, new Set(sat.map(n => n.id)));
  assert.equal(rest.length, Math.min(36, by.get(id).length - sat.length));
  assert.ok(rest.every(n => !sat.some(m => m.id === n.id)));
  const labels = sceneLabels(stress, scene, {scale: 0.3, focus: new Set([id]), extra: sat});
  assert.ok(labels.has(`h:${id}`), 'focused node is labelled even when crowded');
});

test('filters feed the scene: only-with-evidence drops hypotheses without visible claims', () => {
  const by = claimsByHypothesis(stress);
  const scene = planKnowledge(stress, {aspect: 1.6, tray: true, hypothesis: h => (by.get(h.id)?.length ?? 0) > 0});
  const drawn = scene.groups.reduce((s, g) => s + g.top.length + g.rest.length, 0);
  assert.equal(drawn, stress.hypotheses.filter(h => by.has(h.id)).length);
  assert.ok(drawn < stress.hypotheses.length);
});

test('the small fixture keeps every question visible without a tray, and legacy layoutKnowledge still places everything', () => {
  const k = buildKnowledge(state), scene = planKnowledge(k, {aspect: 1.6});
  assert.equal(scene.groups.length, 3); assert.equal(scene.tray, null);
  assert.ok(scene.groups.every(g => g.rest.length === 0));
  noOverlap(scene.groups.map(g => g.box), 'small boxes');
  const legacy = layoutKnowledge(stress);
  assert.ok(stress.hypotheses.every(h => legacy.has(`h:${h.id}`)));
});

test('the knowledge-framework document supplies questions and journal status survives the PEER filter', async () => {
  const {excludePeerFromPrivateAtlas} = await import('../server/atlas/private-tower-input.mjs');
  const kf = {questions: [{id: 'Q-X', label: 'Pergunta do documento', roadmap_id: 'R1'}], claims: [{claim_id: 'C1', source: 'LITERATURE', label: 'a', publication_status: 'REFEREED', journal_tier: 'A', evidence_type: 'COLLABORATION', supports: ['H1']}]};
  const records = excludePeerFromPrivateAtlas({work: [], tests: [], hypotheses: [], claims: [], campaigns: [], roadmaps: [], lessons: [], artifacts: [], events: [], interdomain: [], coverage: {capabilities: {}}, capabilities: {}, knowledgeFramework: kf});
  assert.equal(records.knowledgeFramework.claims[0].publication_status, 'REFEREED');
  const k = buildKnowledge({read_model: {knowledge: {questions: kf.questions}, hypotheses: {H1: {hypothesis_id: 'H1', question_id: 'Q-X', proposition: 'h'}}, claims: {C1: kf.claims[0]}}});
  assert.equal(k.questions.find(q => q.id === 'Q-X').label, 'Pergunta do documento');
  assert.equal(k.claims[0].weight, 1);
});
