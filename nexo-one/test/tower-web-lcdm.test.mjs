import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {layoutCosmos} from '../src/tower-web/embed3d.ts';
import {buildScene} from '../src/tower-web/scene.ts';
import {createTowerLcdm, PHYSICS_MODEL, PHYSICS_NOTE} from '../src/tower-web/lcdm.ts';

const mk = (n, domains = ['SCIENCE', 'ENGINEERING', 'OLYMPUS']) => Array.from({length: n}, (_, i) => { const d = domains[i % domains.length]; return {id: `t${i}`, domain: d, subdomainId: `${d}-s${(i >> 2) % 4}`, campaignId: `${d}-c${(i >> 3) % 5}`, parents: i >= 3 ? [`t${i - 3}`] : [], verdict: ['CONFIRMED', 'REFUTED', null][i % 3]}; });
// the web itself no longer has dust; the motion model still supports tracer particles, so these tests feed it a tracer cloud (a copy of the node positions)
const setup = (n = 150, domains) => {
  const g = buildTowerGraph(mk(n, domains)); const layout = layoutCosmos(g); const scene = buildScene(g, layout);
  const co = {xyz: scene.xyz, dust: {xyz: Float32Array.from(scene.xyz)}, cpos: new Map(g.nodes.filter(x => x.kind !== 'test' && layout.pos.has(x.id)).map(x => [x.id, {...layout.pos.get(x.id)}]))};
  const anchors = layout.domainIds.map(id => layout.pos.get(id));
  const lcdm = createTowerLcdm({nodes: co.xyz, dust: co.dust.xyz, containers: co.cpos, anchors, center: layout.center, extent: layout.extent});
  return {g, layout, co, anchors, lcdm};
};
const run = (l, secs, gate) => { for (let t = 0; t < secs; t += 0.04) l.step(0.04, gate); };
const dist = (p, c) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
const meanNearest = (dust, A) => { let s = 0; const n = dust.length / 3; for (let i = 0; i < n; i += 1) { let b = Infinity; for (const a of A) b = Math.min(b, Math.hypot(dust[3 * i] - a.x, dust[3 * i + 1] - a.y, dust[3 * i + 2] - a.z)); s += b; } return s / n; };

test('lcdm: scale factor follows the flat-ΛCDM background, bounded, and the disclosure is explicit', () => {
  const s = setup(60); assert.equal(PHYSICS_MODEL, 'illustrative-flat-lcdm-toy'); assert.match(PHYSICS_NOTE, /ilustrativo/); assert.match(PHYSICS_NOTE, /sem massas inferidas/); assert.match(PHYSICS_NOTE, /peso visual igual/);
  const a0 = s.lcdm.state.scaleFactor; assert.equal(s.lcdm.state.expansion, 1);
  let prev = a0; for (let k = 0; k < 40; k += 1) { run(s.lcdm, 5); assert.ok(s.lcdm.state.scaleFactor >= prev); prev = s.lcdm.state.scaleFactor; }
  assert.ok(prev > a0 && prev <= 1.2); assert.ok(s.lcdm.state.expansion > 1 && s.lcdm.state.expansion <= 1.04 + 1e-9); assert.ok(s.lcdm.state.hubble > 0);
});

test('lcdm: voids grow (domains recede from the centre of mass) while the layout memory stays comoving', () => {
  const s = setup(60); const ids = s.layout.domainIds; const before = ids.map(id => ({...s.co.cpos.get(id)})); const pristine = ids.map(id => ({...s.layout.pos.get(id)}));
  run(s.lcdm, 120);
  ids.forEach((id, i) => { assert.ok(dist(s.co.cpos.get(id), s.layout.center) > dist(before[i], s.layout.center) - 1e-6); assert.deepEqual({...s.layout.pos.get(id)}, pristine[i], 'layout.pos (warm-start memory) is never mutated'); });
  const a = s.co.cpos.get(ids[0]), b = s.co.cpos.get(ids[1]); assert.ok(dist(a, b) > dist(before[0], before[1]), 'the void between two domains widened');
  // bound by the 4% ceiling
  ids.forEach((id, i) => assert.ok(dist(s.co.cpos.get(id), s.layout.center) <= dist(before[i], s.layout.center) * 1.0401 + 1e-6));
});

test('lcdm: dust clusters toward equal-weight anchors, bounded, no NaN, deterministic', () => {
  const s = setup(80); const d0 = meanNearest(s.co.dust.xyz, s.anchors); run(s.lcdm, 120);
  assert.ok(s.lcdm.state.clustering > 0 && s.lcdm.state.clustering < 0.5, `clustering ${s.lcdm.state.clustering}`);
  assert.ok(s.co.dust.xyz.every(Number.isFinite) && s.co.xyz.every(Number.isFinite));
  const A = s.lcdm; assert.ok(A.state.particleSteps > 0);
  const t = setup(80); run(t.lcdm, 120); assert.deepEqual(Array.from(t.co.dust.xyz.slice(0, 300)), Array.from(s.co.dust.xyz.slice(0, 300)));
  // every particle stays within its cap of its initial position's anchor distance (never past the anchor)
  const u = setup(80); const o = u.co.dust.xyz.slice(); run(u.lcdm, 300);
  const R = u.layout.extent; let worst = 0; for (let i = 0; i < o.length; i += 3) worst = Math.max(worst, Math.hypot(u.co.dust.xyz[i] - o[i], u.co.dust.xyz[i + 1] - o[i + 1], u.co.dust.xyz[i + 2] - o[i + 2]));
  assert.ok(worst < R * 0.5, `no particle flies off (${worst} vs ${R})`); assert.ok(d0 > 0);
});

test('lcdm: paused / hidden / reduced-motion do nothing; reset restores the initial state; anchors have equal weight', () => {
  const s = setup(60); const snap = Array.from(s.co.dust.xyz.slice(0, 90));
  for (const gate of [{paused: true}, {hidden: true}, {reducedMotion: true}]) { assert.equal(s.lcdm.step(0.05, gate), false); run(s.lcdm, 5, gate); }
  assert.deepEqual(Array.from(s.co.dust.xyz.slice(0, 90)), snap); assert.equal(s.lcdm.state.particleSteps, 0);
  run(s.lcdm, 30); assert.notDeepEqual(Array.from(s.co.dust.xyz.slice(0, 90)), snap);
  s.lcdm.reset(); assert.deepEqual(Array.from(s.co.dust.xyz.slice(0, 90)), snap); assert.equal(s.lcdm.state.expansion, 1);
  // equal weight: the same geometry with 10x more tests in one domain's records gives the same anchor recession (anchors carry no mass)
  const g = [setup(60, ['A', 'B']).lcdm.state, setup(60, ['A', 'B']).lcdm.state]; assert.deepEqual(g[0], g[1]);
  const big = setup(150, ['A']); run(big.lcdm, 10); assert.ok(Number.isFinite(big.lcdm.state.scaleFactor), 'a single domain works');
  const none = createTowerLcdm({nodes: new Float32Array(0), dust: new Float32Array(0), containers: new Map(), anchors: [{x: 0, y: 0, z: 0}], center: {x: 0, y: 0, z: 0}, extent: 10}); run(none, 5); assert.ok(none.state.fixedSteps > 0);
});

test('lcdm: scale factor can be carried across a generation (no jump back)', () => {
  const s = setup(60); run(s.lcdm, 120); const a = s.lcdm.state.scaleFactor; assert.ok(a > 0.66);
  const t = createTowerLcdm({nodes: s.co.xyz, dust: s.co.dust.xyz, containers: s.co.cpos, anchors: s.anchors, center: s.layout.center, extent: s.layout.extent, initialScaleFactor: a});
  assert.equal(t.state.scaleFactor, a); assert.ok(Math.abs(t.state.expansion - s.lcdm.state.expansion) < 1e-9, 'recession continues, it does not restart at 1');
  const dom = s.layout.domainIds[0]; assert.ok(dist(s.co.cpos.get(dom), s.layout.center) > dist(s.layout.pos.get(dom), s.layout.center), 'positions already reflect the carried expansion');
});
