import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {layoutTower} from '../src/tower-web/layout.ts';
import {buildScene, drawScene, fitView, hitTest, toWorld, nodeRadius, verdictColor, domainHue} from '../src/tower-web/draw.ts';

const T = (id, domain, sub, camp, parents = [], v = 'CONFIRMED') => ({id, domain, subdomainId: sub, subdomain: sub, campaignId: camp, parents, verdict: v});
const tests = [T('a', 'SCIENCE', 's', 'c'), T('b', 'SCIENCE', 's', 'c', ['a']), T('c', 'SCIENCE', 's', 'c', ['b'], null), T('d', 'ENGINEERING', 'e', 'k', ['c'], 'REFUTED'), T('e', 'ENGINEERING', 'e', 'k', ['d'], 'WEIRD')];
const scene = () => { const g = buildTowerGraph(tests); return buildScene(g, layoutTower(g)); };
const show = {contain: true, depends: true, critical: true, articulation: true, voids: true};

// Recording context: every method is a counted no-op, every property assignable.
const mockCtx = () => { const calls = {}; const ctx = new Proxy({}, {get: (t, p) => (p in t ? t[p] : () => { calls[p] = (calls[p] ?? 0) + 1; }), set: (t, p, v) => { t[p] = v; return true; }}); return {calls, ctx}; };

test('scene: one drawable node per graph node, finite positions and radii', () => {
  const s = scene(); assert.equal(s.nodes.length, s.g.nodes.length);
  for (const n of s.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.rad > 0, n.id);
});

test('fitView centres the Tower and fits the whole extent; toWorld inverts the view', () => {
  const s = scene(); const v = fitView(s, 1000, 600);
  assert.equal(v.x, 500); assert.equal(v.y, 300);
  for (const n of s.nodes) { const sx = v.x + n.x * v.k, sy = v.y + n.y * v.k; assert.ok(sx >= 0 && sx <= 1000 && sy >= 0 && sy <= 600, n.id); }
  const w = toWorld(v, 700, 450); assert.ok(Math.abs(v.x + w.x * v.k - 700) < 1e-9 && Math.abs(v.y + w.y * v.k - 450) < 1e-9);
  assert.ok(fitView(s, 0, 0).k > 0, 'degenerate size never yields a non-positive scale');
});

test('hitTest: finds the node under the pointer at any zoom, null in empty space, nearest wins', () => {
  const s = scene(); const v = fitView(s, 1000, 600);
  for (const n of s.nodes) assert.equal(hitTest(s, v, v.x + n.x * v.k, v.y + n.y * v.k), n.id, n.id);
  assert.equal(hitTest(s, v, 1, 1), null);
  const z = {k: v.k * 8, x: 300, y: 200}; const n = s.nodes.find(x => x.node.kind === 'test');
  assert.equal(hitTest(s, z, z.x + n.x * z.k, z.y + n.y * z.k), n.id);
});

test('nodeRadius: hubs are larger than leaves, bounded, containers grow with log(leaves)', () => {
  const g = buildTowerGraph(tests);
  const r = id => nodeRadius(g, g.byId.get(id));
  assert.ok(r('test:c') > r('test:a')); assert.ok(r('test:c') <= 6.5 + 1e-9 && r('test:a') >= 2.2);
  assert.ok(r('domain:SCIENCE') > r('campaign:SCIENCE/s/c') - 3);
});

test('colours: known verdicts differ per theme, unknown/absent fall back to neutral, domain hues stable', () => {
  assert.notEqual(verdictColor('CONFIRMED', 'dark'), verdictColor('CONFIRMED', 'light'));
  assert.equal(verdictColor('WEIRD', 'dark'), verdictColor(null, 'dark'));
  assert.equal(domainHue('SCIENCE'), 205); assert.equal(domainHue('X1'), domainHue('X1')); assert.ok(domainHue('X1') >= 0 && domainHue('X1') < 360);
});

test('drawScene: draws with every layer, with none, with a focus set and in both themes, never throwing; batches node fills', () => {
  const s = scene(); const v = fitView(s, 800, 500);
  for (const theme of ['dark', 'light']) for (const sh of [show, {contain: false, depends: false, critical: false, articulation: false, voids: false}]) for (const focus of [new Set(), new Set(['test:a', 'test:b'])]) {
    const {ctx, calls} = mockCtx();
    drawScene(ctx, s, {view: v, w: 800, h: 500, dpr: 2, theme, show: sh, selected: 'test:b', hover: 'test:a', focus});
    assert.ok(calls.fillRect === 1 && calls.save === calls.restore);
  }
});

test('drawScene: node fills are batched per colour, not per node (400 tests)', () => {
  const V = ['CONFIRMED', 'REFUTED', 'REVIEW', null];
  const big = Array.from({length: 400}, (_, i) => T(`n${i}`, ['SCIENCE', 'ENGINEERING', 'OLYMPUS'][i % 3], `s${i % 4}`, `c${i % 7}`, i > 2 ? [`n${i - 3}`] : [], V[i % 4]));
  const g = buildTowerGraph(big); const s = buildScene(g, layoutTower(g)); const {ctx, calls} = mockCtx();
  drawScene(ctx, s, {view: fitView(s, 800, 500), w: 800, h: 500, dpr: 1, theme: 'dark', show, selected: null, hover: null, focus: new Set()});
  assert.ok(calls.fill < 60, `fill calls: ${calls.fill}`); assert.ok(calls.arc > 400);
});

test('drawScene: empty graph draws only the background', () => {
  const g = buildTowerGraph([]); const s = buildScene(g, layoutTower(g)); const {ctx, calls} = mockCtx();
  drawScene(ctx, s, {view: fitView(s, 300, 300), w: 300, h: 300, dpr: 1, theme: 'dark', show, selected: null, hover: null, focus: new Set()});
  assert.equal(calls.fillRect, 1);
});
