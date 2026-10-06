import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {layoutTower, voidGap, DEFAULTS} from '../src/tower-web/layout.ts';

const T = (id, domain, sub, camp, parents = [], extra = {}) => ({id, domain, subdomainId: sub, subdomain: sub && `Sub ${sub}`, campaignId: camp, parents, verdict: 'PROVISIONAL', ...extra});
const sample = () => [
  T('t1', 'SCIENCE', 's1', 'c1'), T('t2', 'SCIENCE', 's1', 'c1', ['t1']), T('t3', 'SCIENCE', 's1', 'c2', ['t2']), T('t4', 'SCIENCE', 's2', 'c3', ['t3']),
  T('t5', 'ENGINEERING', 'e1', 'k1'), T('t6', 'ENGINEERING', 'e1', 'k1', ['t5', 't3']), T('t7', 'OLYMPUS', null, null), T('t8', 'OLYMPUS', null, null, ['t7']),
];

test('model: hierarchy Tower > Domain > Subdomain > Campaign > Test, with explicit "not published" buckets (never invented)', () => {
  const g = buildTowerGraph(sample());
  assert.deepEqual(g.counts, {domains: 3, subdomains: 4, campaigns: 5, tests: 8, dependencies: 6, contests: 0});
  const t6 = g.byId.get('test:t6'); assert.equal(g.byId.get(t6.parent).kind, 'campaign');
  const olympus = [...g.byId.values()].filter(n => n.domain === 'OLYMPUS' && n.kind !== 'domain' && n.kind !== 'test');
  assert.equal(olympus.length, 2); assert.ok(olympus.every(n => n.unpublished), 'missing subdomain/campaign => explicit unpublished buckets');
  assert.equal(g.byId.get('tower').leaves, 8);
  assert.equal(g.edges.filter(e => e.kind === 'contains').length, g.nodes.length - 1, 'containment is a spanning tree');
  // cross-domain dependency t3 -> t6 is the only SCIENCE/ENGINEERING link
  assert.equal([...g.domainLinks.values()].reduce((s, v) => s + v, 0), 1);
});

test('model: unresolved parents are counted, duplicates and self-references dropped, contest edges kept', () => {
  const g = buildTowerGraph([T('a', 'SCIENCE', 's', 'c', ['ghost', 'a']), T('a', 'SCIENCE', 's', 'c'), T('b', 'SCIENCE', 's', 'c', [], {contestOf: 'a'}), T('c', 'SCIENCE', 's', 'c', [], {contestOf: 'nobody'})]);
  assert.equal(g.counts.tests, 3); assert.equal(g.unresolved, 2); assert.equal(g.counts.dependencies, 0); assert.equal(g.counts.contests, 1);
});

test('model: metrics reflect the dependency structure (critical path, articulation, layers) and are absent-safe', () => {
  const g = buildTowerGraph(sample());
  // t4 and t6 both end a 4-long chain; the tie is broken deterministically by id
  assert.equal(g.metrics.layer.get('test:t4'), g.metrics.layer.get('test:t6'));
  assert.deepEqual(g.metrics.criticalPath, ['test:t1', 'test:t2', 'test:t3', 'test:t4']);
  assert.ok(g.metrics.articulation.has('test:t3') && g.metrics.articulation.has('test:t2'));
  assert.equal(g.metrics.layer.get('test:t6'), 3);
  assert.equal(g.metrics.componentCount, 2);
  const empty = buildTowerGraph([]); assert.equal(empty.counts.tests, 0); assert.deepEqual(empty.metrics.criticalPath, []);
});

test('void gap is logarithmic: min at 0, max at isoMax, monotonic, concave, bounded; unbounded isolation cannot exceed max', () => {
  const g = (v) => voidGap(v, 1000, 0.03, 0.3);
  assert.equal(g(0), 0.03); assert.ok(Math.abs(g(1000) - 0.3) < 1e-12); assert.equal(g(1e9), g(1000));
  let prev = -1; for (const v of [0, 1, 2, 5, 10, 50, 100, 500, 1000]) { assert.ok(g(v) >= prev); prev = g(v); }
  // log scale: 10x more isolation adds a roughly constant amount, not 10x more void
  assert.ok(g(10) - g(1) < g(100) - g(10) + 0.03 && (g(100) - g(10)) / (g(10) - g(1)) < 1.5);
  assert.ok(g(500) < 0.3 && (g(500) - g(50)) < (g(50) - g(0)));
  assert.equal(voidGap(5, 0, 0.03, 0.3), 0.03); assert.equal(voidGap(-3, 10, 0.03, 0.3), 0.03); assert.equal(voidGap(NaN, 10, 0.03, 0.3), 0.03);
});

test('layout: every node placed, finite, deterministic and independent of input order', () => {
  const a = layoutTower(buildTowerGraph(sample()));
  const b = layoutTower(buildTowerGraph([...sample()].reverse()));
  const g = buildTowerGraph(sample());
  assert.equal(a.pos.size, g.nodes.length);
  for (const [id, p] of a.pos) { assert.ok([p.x, p.y, p.r, p.a].every(Number.isFinite), id); const q = b.pos.get(id); assert.ok(Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9, `order independent ${id}`); }
});

test('layout: sectors + voids tile the circle exactly; each void is within [gapMin, gapMax] and total voids within budget', () => {
  const l = layoutTower(buildTowerGraph(sample()));
  const covered = l.sectors.reduce((s, x) => s + (x.a1 - x.a0), 0) + l.voids.reduce((s, v) => s + v.gap, 0);
  assert.ok(Math.abs(covered - Math.PI * 2) < 1e-9, `covered ${covered}`);
  for (const v of l.voids) assert.ok(v.gap >= 0 && v.gap <= DEFAULTS.gapMax + 1e-12);
  assert.ok(l.voids.reduce((s, v) => s + v.gap, 0) <= Math.PI * 2 * DEFAULTS.gapBudget + 1e-9);
  for (let i = 1; i < l.sectors.length; i += 1) assert.ok(l.sectors[i].a0 >= l.sectors[i - 1].a1 - 1e-12, 'sectors do not overlap');
});

test('layout: a huge isolated domain pair cannot blow the void up (log scale + budget); one domain has no voids', () => {
  const many = [];
  for (let i = 0; i < 400; i += 1) many.push(T(`a${i}`, 'SCIENCE', 's', 'c'), T(`b${i}`, 'ENGINEERING', 's', 'c'), T(`c${i}`, 'OLYMPUS', 's', 'c'));
  const l = layoutTower(buildTowerGraph(many));
  for (const v of l.voids) assert.ok(v.gap <= DEFAULTS.gapMax + 1e-12);
  const one = layoutTower(buildTowerGraph([T('x', 'SCIENCE', 's', 'c')]));
  assert.equal(one.voids.length, 0); assert.equal(one.sectors.length, 1);
  assert.equal(layoutTower(buildTowerGraph([])).extent, 0);
});

test('layout: connected domains sit side by side (quotient ordering) and are separated by a smaller void than isolated ones', () => {
  const ts = [];
  for (let i = 0; i < 30; i += 1) ts.push(T(`s${i}`, 'SCIENCE', 's', 'c', i ? [`s${i - 1}`] : []), T(`e${i}`, 'ENGINEERING', 's', 'c', i ? [`e${i - 1}`] : []), T(`o${i}`, 'OLYMPUS', 's', 'c', i ? [`o${i - 1}`] : []));
  for (let i = 0; i < 12; i += 1) ts.push(T(`link${i}`, 'ENGINEERING', 's', 'c', [`s${i}`]));
  const l = layoutTower(buildTowerGraph(ts));
  const adj = (a, b) => l.voids.find(v => (v.from === a && v.to === b) || (v.from === b && v.to === a));
  assert.ok(adj('SCIENCE', 'ENGINEERING').gap < adj('OLYMPUS', 'ENGINEERING').gap || adj('SCIENCE', 'ENGINEERING').gap < adj('OLYMPUS', 'SCIENCE').gap, 'the linked pair has the smaller void');
  assert.ok(adj('SCIENCE', 'ENGINEERING').isolation < adj('OLYMPUS', 'SCIENCE').isolation);
});

test('layout: tests keep a minimum spacing inside a campaign arc (rows are added instead of overlapping)', () => {
  const ts = []; for (let i = 0; i < 300; i += 1) ts.push(T(`t${i}`, 'SCIENCE', 's', 'c', i % 5 ? [] : [`t${Math.max(0, i - 5)}`]));
  const g = buildTowerGraph(ts); const l = layoutTower(g);
  const pts = g.nodes.filter(n => n.kind === 'test').map(n => l.pos.get(n.id));
  let minD = Infinity; for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) minD = Math.min(minD, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  assert.ok(minD >= DEFAULTS.minSpacing * 0.8, `closest pair ${minD.toFixed(2)}`);
});
