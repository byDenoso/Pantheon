/** The Learning filament view.
 *  Every filament must trace back to something learning_v1 declares: a ladder
 *  stage, a declared domain, a declared cross-domain scope, or a pattern link
 *  that actually resolves to a published pattern. Nothing is inferred from
 *  wording, and the view states how much of the corpus declares nothing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const item = (id, stage, extra = {}) => ({
 id, stage, relationType: 'X', status: 'SUPPORTED', notes: '',
 domainA: extra.domainA || '', evidenceRefs: JSON.stringify(extra.ev || {}),
 metadata: extra.metadata || {}
});

const report = () => ({
 total: 10,
 crossDomain: 1,
 ladder: [
  {id: 'OBSERVATION', label: 'Observação', count: 5, available: true, items: [
   item('observation:A', 'OBSERVATION', {domainA: 'ENGINEERING', ev: {pattern_id: 'PAT-ONE'}}),
   item('observation:B', 'OBSERVATION', {domainA: 'ENGINEERING', ev: {new_pattern_id: 'PAT-TWO'}}),
   item('observation:C', 'OBSERVATION', {domainA: 'CROSS_DOMAIN',
    ev: {domain_a: 'ENGINEERING', domain_b: 'SCIENCE', relation_scope: 'CROSS_DOMAIN', relation_type: 'TRANSFERABLE_METHOD'}}),
   item('observation:D', 'OBSERVATION', {ev: {pattern_id: 'PAT-MISSING'}}),
   item('observation:E', 'OBSERVATION', {})
  ]},
  {id: 'PATTERN', label: 'Padrão', count: 2, available: true, items: [
   item('pattern:PAT-ONE', 'PATTERN', {domainA: 'ENGINEERING'}),
   item('pattern:PAT-TWO', 'PATTERN', {domainA: 'SCIENCE'})
  ]},
  {id: 'LESSON', label: 'Lição', count: 2, available: true, items: [
   item('lesson:L', 'LESSON', {domainA: 'ENGINEERING'}),
   item('lesson:L2', 'LESSON', {domainA: 'CONTINUITY'})
  ]},
  {id: 'STRATEGY', label: 'Estratégia', count: 1, available: true, items: [item('strategy:S', 'STRATEGY', {domainA: 'CONTINUITY'})]},
  {id: 'POLICY', label: 'Política', count: 1, available: true, items: [item('policy:P', 'POLICY', {})]}
 ],
 emergent: [], unresolvedEvidence: []
});

test('the learning graph is rooted on Learning and carries the five ladder stages', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = buildLearningGraph(report());
 assert.equal(g.focus, 'system:LEARNING');
 assert.ok(g.nodes.some(n => n.id === 'system:LEARNING' && n.type === 'SYSTEM'));
 for (const stage of ['OBSERVATION', 'PATTERN', 'LESSON', 'STRATEGY', 'POLICY']) {
  assert.ok(g.nodes.some(n => n.id === `learning-stage:${stage}`), `stage ${stage} missing`);
 }
 // the ladder is a declared progression, drawn as such
 assert.ok(g.edges.some(e => e.source === 'learning-stage:OBSERVATION' && e.target === 'learning-stage:PATTERN'));
 assert.ok(g.edges.some(e => e.source === 'learning-stage:STRATEGY' && e.target === 'learning-stage:POLICY'));
});

test('a pattern link becomes a filament only when it resolves to a published pattern', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = buildLearningGraph(report());
 const lineage = g.edges.filter(e => e.type === 'LINEAGE');
 assert.equal(lineage.length, 2, 'exactly the two resolvable pattern links must be drawn');
 assert.ok(lineage.some(e => e.source === 'observation:A' && e.target === 'pattern:PAT-ONE'));
 assert.ok(lineage.some(e => e.source === 'observation:B' && e.target === 'pattern:PAT-TWO'));
 assert.ok(!g.edges.some(e => String(e.target).includes('PAT-MISSING')),
  'a dangling pattern id must not be drawn as a relation');
 assert.ok(!g.nodes.some(n => n.id === 'observation:E'),
  'an item that declares no relation must not be added as a floating body');
});

test('cross-domain filaments exist only where both ends declare their domain', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const {classifyEdge} = await import('../ui/filaments.mjs');
 const g = buildLearningGraph(report());
 const byId = new Map(g.nodes.map(n => [n.id, n]));

 // the explicitly declared bridge is drawn, carries its scope and stays derived
 const bridge = g.edges.find(e => e.type === 'BRIDGE');
 assert.ok(bridge, 'the declared CROSS_DOMAIN record produced no bridge');
 assert.equal(bridge.relationScope, 'CROSS_DOMAIN');
 assert.equal(bridge.authority, 'DERIVED_NOT_EVIDENCE');
 assert.deepEqual([bridge.source, bridge.target].sort(),
  ['learning-domain:ENGINEERING', 'learning-domain:SCIENCE']);
 assert.equal(g.edges.filter(e => e.type === 'BRIDGE').length, 1, 'one declared bridge, one filament');

 // nothing else may become cross-domain unless the source declared both domains
 const cross = g.edges.filter(e => classifyEdge(byId.get(e.source), byId.get(e.target), e) === 'cross-domain');
 for (const e of cross) {
  const a = byId.get(e.source), b = byId.get(e.target);
  const declared = n => (n.domains?.length ? n.domains : n.domain ? [n.domain] : []);
  assert.ok(e.relationScope === 'CROSS_DOMAIN' || (declared(a).length && declared(b).length),
   `${e.id} was promoted to cross-domain without both ends declaring a domain`);
 }
 // a lineage link whose two records name different domains is a real transfer
 assert.ok(cross.some(e => e.type === 'LINEAGE'),
  'a pattern link across two declared domains must read as cross-domain');
});

test('domain hubs exist only for domains the source actually declares', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = buildLearningGraph(report());
 const hubs = g.nodes.filter(n => n.id.startsWith('learning-domain:')).map(n => n.id);
 assert.ok(hubs.includes('learning-domain:ENGINEERING'));
 assert.ok(hubs.includes('learning-domain:SCIENCE'));
 assert.ok(hubs.includes('learning-domain:CONTINUITY'));
 assert.ok(!hubs.some(h => /CROSS_DOMAIN/.test(h)),
  'CROSS_DOMAIN is a scope marker, not a domain of its own');
 for (const hub of g.nodes.filter(n => n.id.startsWith('learning-domain:'))) {
  assert.ok(hub.domain, `${hub.id} must declare its domain so classification stays honest`);
  assert.ok(hub.count > 0, `${hub.id} must carry the number of records that declared it`);
 }
});

test('a domain named by a declared bridge is never dropped for being rare', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const r = report();
 // SCIENCE is named by a single record, but it is one end of a declared bridge
 const science = r.ladder[1].items.filter(i => i.domainA === 'SCIENCE');
 assert.equal(science.length, 1, 'fixture should keep SCIENCE rare');
 const g = buildLearningGraph(r);
 assert.ok(g.nodes.some(n => n.id === 'learning-domain:SCIENCE'),
  'a bridge end must earn a hub, or the declared bridge silently disappears');
 assert.ok(g.edges.some(e => e.type === 'BRIDGE'));
 // a rare domain that no bridge names still stays off the canvas
 const noBridge = buildLearningGraph({...r, ladder: r.ladder.map(s => ({...s,
  items: (s.items || []).filter(i => !String(i.evidenceRefs).includes('CROSS_DOMAIN'))}))});
 assert.ok(!noBridge.nodes.some(n => n.id === 'learning-domain:SCIENCE'),
  'without a bridge, a single-record domain stays in the counters only');
});

test('the view reports how much of the corpus declares no domain at all', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = buildLearningGraph(report());
 assert.equal(g.stats.items, 11);
 assert.equal(g.stats.lineage, 2);
 assert.equal(g.stats.crossDomain, 1);
 assert.equal(g.stats.undeclaredDomain, 3, 'observation:D, observation:E and policy:P declare no domain');
 assert.ok(g.stats.declaredDomains >= 3);
});

test('every learning edge is derived, never scientific evidence', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = buildLearningGraph(report());
 assert.ok(g.edges.length > 0);
 for (const e of g.edges) {
  assert.equal(e.authority, 'DERIVED_NOT_EVIDENCE', `${e.id} claims a stronger authority`);
 }
 const source = read('ui/learning-graph.mjs');
 assert.doesNotMatch(source, /SCIENCE_CANONICAL/);
});

test('an empty or unavailable projection yields no invented graph', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const empty = buildLearningGraph({total: 0, ladder: [], emergent: [], unresolvedEvidence: []});
 assert.equal(empty.edges.filter(e => e.type === 'LINEAGE').length, 0);
 assert.equal(empty.stats.items, 0);
 assert.equal(buildLearningGraph(null).nodes.length, 0);
 assert.equal(buildLearningGraph(undefined).edges.length, 0);
});

test('the learning web is drawn on the map, not in a side panel', () => {
 const app = read('app.mjs');
 assert.match(app, /buildLearningGraph/, 'focusing Learning must build the declared web');
 assert.match(app, /system:LEARNING/);
 assert.match(app, /learningView\(rawGraph\)/, 'the map payload must be swapped for the web');
 // the old tab panel is gone; the map is the only surface
 assert.equal(fs.existsSync(new URL('../ui/learning-view.mjs', import.meta.url)), false,
  'the Learning tab panel must not linger as dead code');
 assert.doesNotMatch(read('index.html'), /learning-filaments/);
});

test('the renderer can be stopped so a replaced panel does not leak a loop', async () => {
 globalThis.ResizeObserver = class {observe() {} disconnect() {}};
 globalThis.devicePixelRatio = 1;
 const frames = [];
 globalThis.requestAnimationFrame = cb => {frames.push(cb); return frames.length};
 globalThis.cancelAnimationFrame = () => {};
 delete globalThis.matchMedia;
 const ctx = new Proxy({}, {get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient')
  ? () => ({addColorStop() {}})
  : k === 'measureText' ? (s => ({width: String(s).length * 6})) : (() => {}), set: () => true});
 const canvas = {width: 0, height: 0, clientWidth: 800, clientHeight: 420, style: {},
  getContext: () => ctx, addEventListener() {}};
 const {Graph3D} = await import('../graph3d.mjs');
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(buildLearningGraph(report()), 'system:LEARNING');
 assert.equal(typeof g.stop, 'function', 'Graph3D must expose stop()');
 g.stop();
 assert.equal(g.stopped, true);
 const before = frames.length;
 g.kick(500);
 assert.equal(frames.length, before, 'a stopped renderer must not schedule new frames');
});

test('label keep-out regions stay overridable per renderer instance', async () => {
 const graph3d = read('graph3d.mjs');
 assert.match(graph3d, /const reserved=this\.reserved\|\|\[/,
  'the reserved regions must be overridable per renderer instance');
 assert.match(graph3d, /const topGuard=this\.reserved\?/,
  'the top guard exists for the map mode chip and must relax without it');
 assert.match(graph3d, /y<topGuard/, 'the label bounds check must use the configurable guard');
});

test('the learning graph stays small enough to read', async () => {
 const {buildLearningGraph} = await import('../ui/learning-graph.mjs');
 const {buildFilaments} = await import('../ui/filaments.mjs');
 const g = buildLearningGraph(report());
 assert.ok(g.nodes.length <= 36, `learning view drew ${g.nodes.length} bodies`);
 const filaments = buildFilaments(g, {});
 assert.ok(filaments.length <= 35, `learning view drew ${filaments.length} filaments`);
 for (const f of filaments) assert.ok(g.edges.some(e => e.id === f.edge.id));
});
