import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemory, HISTORY_MAX} from '../src/tower-web/memory.ts';
import {classify, STRUCTURES} from '../src/tower-web/structure.ts';
import {buildTowerGraph} from '../src/tower-web/model.ts';

const P = (x = 0) => new Map([['a', {x, y: 0, z: 0}]]);
test('memory: first view has no births; later generations report newcomers and deaths; same generation counts once', () => {
  const m = createMemory();
  assert.deepEqual(m.newcomers(['a', 'b']), [], 'nothing is born without a before');
  assert.equal(m.commit('g1', P(), new Set(['a', 'b'])).born, 0);
  assert.deepEqual(m.newcomers(['a', 'b', 'c']), ['c']);
  const p = m.commit('g2', P(1), new Set(['a', 'c'])); assert.deepEqual([p.born, p.died, p.tests], [1, 1, 2]);
  assert.equal(m.commit('g2', P(2), new Set(['a', 'c'])), null); assert.equal(m.history().length, 2); assert.equal(m.positions().get('a').x, 2);
});
test('memory: positions are copied (no aliasing), history is capped, clear() forgets everything', () => {
  const m = createMemory(); const src = P(); m.commit('g', src, new Set(['a'])); src.get('a').x = 99; assert.equal(m.positions().get('a').x, 0);
  for (let i = 0; i < HISTORY_MAX + 20; i += 1) m.commit(`g${i}`, P(), new Set(['a']));
  assert.equal(m.history().length, HISTORY_MAX);
  m.clear(); assert.equal(m.positions(), undefined); assert.equal(m.ids(), undefined); assert.deepEqual(m.history(), []); assert.deepEqual(m.newcomers(['z']), []);
});
test('structure: knots/filaments/walls/voids from graph structure only', () => {
  const T = (id, parents = []) => ({id, domain: 'SCIENCE', subdomainId: 's', campaignId: 'c', parents, verdict: null});
  // chain a-b-c-d (b,c articulation), star hub h with 4 leaves, isolated z, triangle-ish wall w1..w3 fully linked
  const t = [T('a'), T('b', ['a']), T('c', ['b']), T('d', ['c']), T('h'), T('l1', ['h']), T('l2', ['h']), T('l3', ['h']), T('l4', ['h']), T('z'),
    T('w1'), T('w2', ['w1']), T('w3', ['w1', 'w2']), T('w4', ['w1', 'w2', 'w3'])];
  const s = classify(buildTowerGraph(t));
  assert.equal(s.get('test:z'), 'void'); assert.equal(s.get('test:h'), 'knot'); assert.equal(s.get('test:b'), 'knot');
  assert.equal(s.get('test:a'), 'filament'); assert.equal(s.get('test:l1'), 'filament'); assert.equal(s.get('test:w4'), 'wall');
  assert.ok([...s.values()].every(v => STRUCTURES.includes(v)));
  assert.equal(classify(buildTowerGraph([])).size, 0);
});

test('memory: the ΛCDM scale factor is carried in memory and cleared with it', () => {
  const m = createMemory(); assert.equal(m.scale(), undefined); m.setScale(0.8); m.setScale(NaN); assert.equal(m.scale(), 0.8); m.clear(); assert.equal(m.scale(), undefined);
});

test('memory: camera and selection are carried across a generation, copied (not aliased) and cleared with the rest', () => {
  const m = createMemory(); assert.equal(m.view(), undefined);
  const cam = {yaw: 1, pitch: 0.2, dist: 50, focal: 400, target: {x: 1, y: 2, z: 3}}; m.setView({cam, selected: 'test:a'}); cam.target.x = 99; cam.yaw = 7;
  assert.deepEqual(m.view(), {cam: {yaw: 1, pitch: 0.2, dist: 50, focal: 400, target: {x: 1, y: 2, z: 3}}, selected: 'test:a'});
  m.clear(); assert.equal(m.view(), undefined);
});
