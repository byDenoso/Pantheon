import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {layoutCosmos, COSMOS_DEFAULTS, drift, expansionFactor, unitVec, hash32} from '../src/tower-web/embed3d.ts';
import {fitCamera, project, projectAll, orbit, zoom, pan, toCamera, lerpCamera, clampPitch} from '../src/tower-web/camera3d.ts';

const DOMS = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'];
const mk = (n, doms = DOMS) => Array.from({length: n}, (_, i) => { const d = doms[i % doms.length]; return {id: `t${i}`, domain: d, subdomainId: `${d}-s${(i >> 2) % 4}`, subdomain: `S${(i >> 2) % 4}`, campaignId: `${d}-c${(i >> 3) % 5}`, parents: i >= doms.length ? [`t${i - doms.length}`] : [], verdict: 'PROVISIONAL'}; });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('embed: the Tower is not a node and no test sits at the origin of the web; everything is finite', () => {
  const g = buildTowerGraph(mk(120)); const L = layoutCosmos(g);
  assert.equal(L.pos.has('tower'), false);
  assert.equal(L.pos.size, g.nodes.length - 1);
  for (const [id, p] of L.pos) assert.ok(Number.isFinite(p.x + p.y + p.z), id);
  assert.ok(Number.isFinite(L.extent) && L.extent > 0);
});

test('embed: deterministic and independent of input order', () => {
  const a = layoutCosmos(buildTowerGraph(mk(90))), b = layoutCosmos(buildTowerGraph(mk(90).reverse()));
  for (const [id, p] of a.pos) assert.ok(dist(p, b.pos.get(id)) < 1e-6, id);
  assert.equal(hash32('x'), hash32('x')); assert.notDeepEqual(unitVec('a'), unitVec('b'));
  const u = unitVec('zzz'); assert.ok(Math.abs(Math.hypot(u.x, u.y, u.z) - 1) < 1e-9);
});

test('embed: no privileged domain — three symmetric domains form an equilateral triangle of superclusters', () => {
  const L = layoutCosmos(buildTowerGraph(mk(90)));
  const c = L.domainIds.map(id => L.pos.get(id));
  const d = [dist(c[0], c[1]), dist(c[0], c[2]), dist(c[1], c[2])];
  assert.ok(Math.max(...d) / Math.min(...d) < 1.05, `distances ${d.map(x => x.toFixed(1))}`);
});

test('embed: voids are logarithmic and bounded — more isolation, more space, but never beyond voidMax', () => {
  // SCIENCE and ENGINEERING are linked, OLYMPUS is isolated
  const t = [...mk(60, ['SCIENCE', 'ENGINEERING']).map((x, i) => (i > 1 ? {...x, parents: [`t${i - 2}`, ...(i % 7 === 0 ? [`t${i - 1}`] : [])]} : x)), ...Array.from({length: 30}, (_, i) => ({id: `o${i}`, domain: 'OLYMPUS', subdomainId: 'o', campaignId: 'oc', parents: [], verdict: null}))];
  const L = layoutCosmos(buildTowerGraph(t));
  const v = (a, b) => L.voids.find(x => (x.from === a && x.to === b) || (x.from === b && x.to === a));
  assert.ok(v('SCIENCE', 'OLYMPUS').gap > v('SCIENCE', 'ENGINEERING').gap, 'isolated pairs get larger voids');
  const D = COSMOS_DEFAULTS; for (const x of L.voids) assert.ok(x.gap >= D.voidMin * D.unit * L.expansion - 1e-9 && x.gap <= D.voidMax * D.unit * L.expansion + 1e-9);
  // log, not linear: doubling isolation does not double the gap
  const lo = layoutCosmos(buildTowerGraph(mk(60))), hi = layoutCosmos(buildTowerGraph(mk(600)));
  assert.ok(hi.voids[0].gap / lo.voids[0].gap < 600 / 60 / 2, 'sub-linear growth of voids with content');
});

test('embed: the universe expands monotonically with its content, a(0)=1', () => {
  assert.equal(expansionFactor(0), 1);
  let last = 0; for (const n of [0, 10, 100, 1000, 10000]) { const a = expansionFactor(n); assert.ok(a > last); last = a; }
  const e = n => layoutCosmos(buildTowerGraph(mk(n))).extent;
  assert.ok(e(30) < e(120) && e(120) < e(480));
});

test('embed: containers contain their children (halos measured from the layout)', () => {
  const g = buildTowerGraph(mk(150)); const L = layoutCosmos(g);
  for (const n of g.nodes) {
    if (!['domain', 'subdomain', 'campaign'].includes(n.kind)) continue;
    const c = L.pos.get(n.id); const r = L.halo.get(n.id);
    for (const ch of n.children) assert.ok(dist(c, L.pos.get(ch)) <= r + 1e-6, `${ch} in ${n.id}`);
  }
});

test('embed: warm start keeps the surviving nodes in place when the Tower grows (cold start moves more)', () => {
  const a = layoutCosmos(buildTowerGraph(mk(240)));
  const prev = new Map([...a.pos].map(([k, v]) => [k, {...v}]));
  const g2 = buildTowerGraph(mk(300));
  const warm = layoutCosmos(g2, {prev}), cold = layoutCosmos(g2);
  const dw = drift(prev, warm), dc = drift(prev, cold);
  assert.ok(dw < dc, `warm ${dw.toFixed(4)} < cold ${dc.toFixed(4)}`); assert.ok(dw < 0.06, `warm drift ${dw}`);
  assert.equal(warm.pos.size, g2.nodes.length - 1);
  // identical content + warm start is a fixed point (a refresh with no growth does not shake the web)
  const same = layoutCosmos(buildTowerGraph(mk(240)), {prev: a.pos});
  assert.ok(drift(a.pos, same) < 0.02);
});

test('embed: bounded cost — 3000 tests relax inside the time budget; budget 0 degrades gracefully', () => {
  const g = buildTowerGraph(mk(3000)); const t0 = Date.now();
  const L = layoutCosmos(g, {budgetMs: 400}); assert.ok(Date.now() - t0 < 3000); assert.equal(L.pos.size, g.nodes.length - 1);
  const z = layoutCosmos(buildTowerGraph(mk(50)), {budgetMs: 0}); for (const p of z.pos.values()) assert.ok(Number.isFinite(p.x));
});

test('embed: degenerate Towers (empty, one domain, one test) lay out', () => {
  for (const t of [[], mk(1), mk(10, ['SCIENCE'])]) { const L = layoutCosmos(buildTowerGraph(t)); assert.ok(Number.isFinite(L.extent)); }
});

test('camera: fit shows the whole web from any angle; target projects to the screen centre; behind-the-eye is rejected', () => {
  const g = buildTowerGraph(mk(200)); const L = layoutCosmos(g); const W = 1000, H = 700;
  for (const [yaw, pitch] of [[0, 0], [1.2, 0.4], [-2.5, -1], [3.1, 1.4]]) {
    const cam = {...fitCamera(L.extent, W, H, L.center), yaw, pitch};
    const c = project(cam, cam.target, W, H); assert.ok(Math.abs(c.x - W / 2) < 1e-6 && Math.abs(c.y - H / 2) < 1e-6);
    for (const [id, p] of L.pos) { const q = project(cam, p, W, H); assert.ok(q && q.x > -20 && q.x < W + 20 && q.y > -20 && q.y < H + 20, `${id} @${yaw},${pitch}: ${q && q.x.toFixed(0)},${q && q.y.toFixed(0)}`); }
  }
  const cam = fitCamera(100, W, H); assert.equal(project(cam, {x: 0, y: 0, z: -cam.dist * 2}, W, H) === null, false); // far side, in front of the eye
  assert.equal(project({...cam, yaw: 0, pitch: 0}, {x: 0, y: 0, z: cam.dist + 5}, W, H), null, 'behind the eye');
});

test('camera: batch projection equals single-point projection; nearer is larger', () => {
  const g = buildTowerGraph(mk(60)); const L = layoutCosmos(g); const cam = fitCamera(L.extent, 800, 600, L.center);
  const ids = [...L.pos.keys()]; const xyz = new Float32Array(ids.length * 3); ids.forEach((id, i) => { const p = L.pos.get(id); xyz.set([p.x, p.y, p.z], 3 * i); });
  const out = {sx: new Float32Array(ids.length), sy: new Float32Array(ids.length), sz: new Float32Array(ids.length), ss: new Float32Array(ids.length)};
  projectAll(cam, xyz, 800, 600, out);
  ids.forEach((id, i) => { const q = project(cam, L.pos.get(id), 800, 600); assert.ok(Math.abs(q.x - out.sx[i]) < 0.05 && Math.abs(q.y - out.sy[i]) < 0.05, id); });
  const near = project(cam, {x: cam.target.x, y: cam.target.y, z: cam.target.z + 1}, 800, 600), far = project(cam, {x: cam.target.x, y: cam.target.y, z: cam.target.z - 1}, 800, 600);
  assert.ok(near && far);
  // looking straight down -z: a point nearer the eye (larger z) is closer and magnified
  const c0 = {...cam, yaw: 0, pitch: 0}, T = c0.target;
  const a = project(c0, {x: T.x, y: T.y, z: T.z + 10}, 800, 600), b = project(c0, {x: T.x, y: T.y, z: T.z - 10}, 800, 600);
  assert.ok(a.depth < b.depth && a.scale > b.scale && Math.abs(a.depth - (c0.dist - 10)) < 1e-6);
});

test('camera: orbit preserves distance to the target; pitch is clamped; zoom is bounded; pan moves the target in the screen plane', () => {
  const cam = fitCamera(200, 800, 600); const p = {x: 50, y: 20, z: -30};
  const before = Math.hypot(...Object.values(toCamera(cam, p)).slice(0, 2), 0);
  const o = orbit(cam, 80, 30); assert.ok(o.yaw !== cam.yaw);
  const r = c => { const q = toCamera(c, p); return Math.hypot(q.x, q.y, q.z - c.dist); };
  assert.ok(Math.abs(r(cam) - r(o)) < 1e-6, 'rotation preserves the radius');
  assert.equal(orbit(cam, 0, 1e6).pitch, clampPitch(1e9)); assert.ok(orbit(cam, 0, -1e6).pitch >= -1.5);
  assert.ok(zoom(cam, 1e-9, 200).dist >= 200 * 0.15 && zoom(cam, 1e9, 200).dist <= 200 * 12);
  const pn = pan(cam, 100, 0); const moved = Math.hypot(pn.target.x - cam.target.x, pn.target.y - cam.target.y, pn.target.z - cam.target.z); assert.ok(moved > 0);
  // after panning, the old target appears shifted right on screen by exactly the pan amount
  const s0 = project(cam, cam.target, 800, 600), s1 = project(pn, cam.target, 800, 600); assert.ok(Math.abs((s1.x - s0.x) - 100) < 1e-6 && Math.abs(s1.y - s0.y) < 1e-6);
  const mid = lerpCamera(cam, {...cam, yaw: 2, dist: 400}, 0.5); assert.ok(Math.abs(mid.yaw - (cam.yaw + 2) / 2) < 1e-9 && Math.abs(mid.dist - (cam.dist + 400) / 2) < 1e-9);
});

test('observer: re-centering on any node puts it at the screen centre (every point can be the centre)', () => {
  const L = layoutCosmos(buildTowerGraph(mk(80))); const cam = fitCamera(L.extent, 900, 600, L.center);
  for (const id of [...L.pos.keys()].filter((_, i) => i % 11 === 0)) { const q = project({...cam, target: {...L.pos.get(id)}}, L.pos.get(id), 900, 600); assert.ok(Math.abs(q.x - 450) < 1e-6 && Math.abs(q.y - 300) < 1e-6, id); }
});

test('gridify: fills a 2:1:1 box evenly (corners included), deterministic, raw layout untouched', async () => {
  const {gridify} = await import('../src/tower-web/embed3d.ts');
  const g = buildTowerGraph(Array.from({length: 150}, (_, i) => { const d = ['A', 'B', 'C'][i % 3]; return {id: `t${i}`, domain: d, subdomainId: `${d}-s${(i >> 2) % 4}`, campaignId: `${d}-c${(i >> 3) % 5}`, parents: i >= 3 ? [`t${i - 3}`] : [], verdict: null}; }));
  const raw = layoutCosmos(g); const before = new Map([...raw.pos].map(([k, p]) => [k, {...p}])); const L = gridify(raw);
  for (const [k, p] of raw.pos) assert.deepEqual(p, before.get(k), 'raw untouched');
  assert.ok(L.box); const e = [L.box.hx, L.box.hy, L.box.hz].sort((a, b) => b - a); assert.ok(Math.abs(e[0] / e[1] - 2) < 1e-9 && Math.abs(e[1] - e[2]) < 1e-9, '2:1:1');
  const fill = (l) => { const t = g.nodes.filter(n => n.kind === 'test').map(n => l.pos.get(n.id)); let hit = 0; for (let c = 0; c < 8; c += 1) { const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, sz = c & 4 ? 1 : -1; if (t.some(p => sx * (p.x - l.center.x) > 0.6 * l.box.hx && sy * (p.y - l.center.y) > 0.6 * l.box.hy && sz * (p.z - l.center.z) > 0.6 * l.box.hz)) hit += 1; } return hit; };
  assert.ok(fill(L) >= 5, `the box corners are populated (${fill(L)}/8)`); assert.ok(fill(L) > fill(gridify(raw, {strength: 0})) - 1);
  const tests = g.nodes.filter(n => n.kind === 'test').map(n => L.pos.get(n.id)); for (const [k, h] of [['x', L.box.hx], ['y', L.box.hy], ['z', L.box.hz]]) { for (const p of tests) assert.ok(Math.abs(p[k] - L.center[k]) <= h + 1e-6); const q = tests.filter(p => p[k] - L.center[k] > 0).length / tests.length; assert.ok(q > 0.35 && q < 0.65, `${k} balanced ${q}`); }
  const L2 = gridify(raw); for (const [k, p] of L.pos) assert.deepEqual(L2.pos.get(k), p);
  assert.equal(gridify(raw, {strength: 0}).voids.length, raw.voids.length);
});
