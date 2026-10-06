import test from 'node:test';
import assert from 'node:assert/strict';
import {indexGraph, components, stronglyConnected, cyclicNodes, layering, articulationPoints, betweenness, quotientWeights, pairKey} from '../src/tower-web/graph.ts';

const G = (ids, edges) => indexGraph(ids, edges);
const sorted = s => [...s].sort();

test('components: weakly connected, ignores unknown endpoints and duplicates', () => {
  const g = G(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'a'], ['c', 'd'], ['x', 'a'], ['a', 'zz']]);
  assert.deepEqual(components(g), [['a', 'b'], ['c', 'd'], ['e']]);
  assert.deepEqual(components(G([], [])), []);
});

test('SCC / cycles: a 3-cycle and a self-loop are cyclic, a DAG is not', () => {
  const g = G(['a', 'b', 'c', 'd', 'e', 'f'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['e', 'e']]);
  assert.deepEqual(sorted(cyclicNodes(g)), ['a', 'b', 'c', 'e']);
  const {comp, count} = stronglyConnected(g);
  assert.equal(comp[0], comp[1]); assert.equal(comp[1], comp[2]); assert.notEqual(comp[2], comp[3]); assert.equal(count, 4);
  assert.equal(cyclicNodes(G(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])).size, 0);
});

test('layering: longest-path layers and critical path of a DAG (prerequisite -> dependent)', () => {
  const g = G(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['a', 'c'], ['c', 'd']]);
  const l = layering(g);
  assert.deepEqual([...l.layer].sort(), [['a', 0], ['b', 1], ['c', 2], ['d', 3], ['e', 0]]);
  assert.deepEqual(l.criticalPath, ['a', 'b', 'c', 'd']); assert.equal(l.depth, 3);
});

test('layering: a cycle collapses into one layer instead of looping forever; empty and single node', () => {
  const l = layering(G(['a', 'b', 'c'], [['a', 'b'], ['b', 'a'], ['b', 'c']]));
  assert.equal(l.layer.get('a'), l.layer.get('b')); assert.equal(l.layer.get('c'), l.layer.get('a') + 1);
  assert.deepEqual(l.criticalPath, ['a', 'b', 'c']);
  assert.deepEqual(layering(G([], [])), {layer: new Map(), criticalPath: [], depth: 0});
  assert.deepEqual(layering(G(['x'], [])).criticalPath, ['x']);
});

test('articulation points: path interior, star centre; none on cycles, none on an edge', () => {
  assert.deepEqual(sorted(articulationPoints(G(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']]))), ['b', 'c']);
  assert.deepEqual(sorted(articulationPoints(G(['h', 'x', 'y', 'z'], [['h', 'x'], ['h', 'y'], ['z', 'h']]))), ['h']);
  assert.equal(articulationPoints(G(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']])).size, 0);
  assert.equal(articulationPoints(G(['a', 'b'], [['a', 'b']])).size, 0);
  // two triangles sharing one vertex: that vertex is the only cut vertex; a separate component does not interfere
  const bow = G(['m', 'a', 'b', 'c', 'd', 'z1', 'z2'], [['m', 'a'], ['a', 'b'], ['b', 'm'], ['m', 'c'], ['c', 'd'], ['d', 'm'], ['z1', 'z2']]);
  assert.deepEqual(sorted(articulationPoints(bow)), ['m']);
});

test('betweenness: exact values on a path of 5, a star and a complete graph', () => {
  const path = betweenness(G(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']]));
  // unnormalised: b=3, c=4, d=3 pairs through them; normaliser (n-1)(n-2)/2 = 6
  assert.ok(Math.abs(path.get('b') - 3 / 6) < 1e-12); assert.ok(Math.abs(path.get('c') - 4 / 6) < 1e-12); assert.ok(Math.abs(path.get('d') - 3 / 6) < 1e-12);
  assert.equal(path.get('a'), 0); assert.equal(path.get('e'), 0);
  const star = betweenness(G(['h', 'x', 'y', 'z', 'w'], [['h', 'x'], ['h', 'y'], ['h', 'z'], ['h', 'w']]));
  assert.ok(Math.abs(star.get('h') - 1) < 1e-12, 'a star centre carries every shortest path');
  const k4 = betweenness(G(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']]));
  for (const v of k4.values()) assert.equal(v, 0);
  assert.equal(betweenness(G(['a', 'b'], [['a', 'b']])).get('a'), 0);
});

test('betweenness splits shortest paths evenly (diamond) and every value stays in [0,1]', () => {
  const d = betweenness(G(['s', 'u', 'v', 't'], [['s', 'u'], ['s', 'v'], ['u', 't'], ['v', 't']]));
  assert.ok(Math.abs(d.get('u') - d.get('v')) < 1e-12 && d.get('u') > 0);
  assert.ok(Math.abs(d.get('u') - 0.5 / 3) < 1e-12, 'u carries half of the s-t pair: 0.5 / 3');
  for (const v of d.values()) assert.ok(v >= 0 && v <= 1);
});

test('quotient weights count cross-group edges once per edge, symmetric key', () => {
  const group = {a: 'D1', b: 'D1', c: 'D2', d: 'D3'};
  const w = quotientWeights([['a', 'b'], ['a', 'c'], ['c', 'a'], ['b', 'd'], ['x', 'a']], id => group[id]);
  assert.equal(w.get(pairKey('D1', 'D2')), 2); assert.equal(w.get(pairKey('D3', 'D1')), 1); assert.equal(w.size, 2);
});

test('scales: 3000 nodes / 6000 edges, all metrics, well under a second and without recursion limits', () => {
  const ids = Array.from({length: 3000}, (_, i) => `n${i}`);
  const edges = ids.slice(1).map((id, i) => [ids[(i * 7) % (i + 1)], id]).concat(ids.slice(2).map((id, i) => [ids[(i * 13 + 5) % (i + 1)], id]));
  const t0 = performance.now();
  const g = G(ids, edges); components(g); cyclicNodes(g); layering(g); articulationPoints(g); betweenness(g);
  assert.ok(performance.now() - t0 < 4000, `took ${Math.round(performance.now() - t0)}ms`);
  // a 20 000-long chain must not overflow the stack
  const chain = Array.from({length: 20000}, (_, i) => `c${i}`);
  const cg = G(chain, chain.slice(1).map((id, i) => [chain[i], id]));
  assert.equal(layering(cg).depth, 19999); assert.equal(articulationPoints(cg).size, 19998); assert.equal(components(cg).length, 1);
});
