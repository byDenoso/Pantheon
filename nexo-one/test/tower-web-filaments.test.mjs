import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {gridify, layoutCosmos} from '../src/tower-web/embed3d.ts';
import {buildScene} from '../src/tower-web/scene.ts';
import {AXIS, buildFilaments, bundleClass, cloudSigma, DUST, routeOf, SEGMENTS, strandCount, updateFilaments} from '../src/tower-web/filaments.ts';

const mk = n => Array.from({length: n}, (_, i) => { const d = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'][i % 3]; return {id: `t${String(i).padStart(3, '0')}`, domain: d, subdomainId: `${d}-s${(i >> 2) % 4}`, campaignId: `${d}-c${(i >> 3) % 5}`, parents: [...(i >= 3 ? [`t${String(i - 3).padStart(3, '0')}`] : []), ...(i % 17 === 16 ? [`t${String(i - 1).padStart(3, '0')}`] : [])], contestOf: i % 40 === 39 ? `t${String(i - 6).padStart(3, '0')}` : null, verdict: null}; });
const setup = (n = 150) => { const g = buildTowerGraph(mk(n)); const s = buildScene(g, gridify(layoutCosmos(g))); return {g, s}; };
const P = (a, i) => [a[3 * i], a[3 * i + 1], a[3 * i + 2]]; const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const toSeg = (p, a, b) => { const ab = b.map((x, i) => x - a[i]), l2 = ab.reduce((s, x) => s + x * x, 0) || 1e-12; const t = Math.max(0, Math.min(1, p.reduce((s, x, i) => s + (x - a[i]) * ab[i], 0) / l2)); return dist(p, a.map((x, i) => x + ab[i] * t)); };
const toPolyline = (p, pts) => { let m = Infinity; for (let k = 1; k < pts.length; k += 1) m = Math.min(m, toSeg(p, pts[k - 1], pts[k])); return m; };

test('filaments: strands exist only for real edges; counts follow the level of detail; everything is finite', () => {
  const {s} = setup(); for (const lod of ['low', 'high']) {
    const f = buildFilaments(s, lod), S = SEGMENTS[lod], per = (S + 1) * 2; assert.equal(f.range.length, s.edges.length * 2); let v = 0, strands = 0;
    s.edges.forEach((e, i) => { const k = strandCount(s, e, lod); assert.ok(k >= 1); assert.equal(f.range[2 * i], v, 'ranges are contiguous: no vertex outside an edge'); assert.equal(f.range[2 * i + 1], k * per); v += k * per; strands += k; });
    assert.equal(v, f.side.length); assert.equal(f.strands, strands); assert.equal(f.pos.length, v * 3); assert.equal(f.index.length, strands * S * 6); assert.ok(f.index.every(i => i < v));
    assert.ok(f.pos.every(Number.isFinite) && f.tan.every(Number.isFinite) && f.axis.every(Number.isFinite) && f.dust.every(Number.isFinite) && f.width.every(w => w > 0) && f.gain.every(g => g > 0 && g <= 1));
    assert.equal(f.axis.length, s.edges.length * (AXIS + 1) * 3);
  }
  assert.ok(buildFilaments(s, 'low').pos.length < buildFilaments(s, 'high').pos.length / 4, 'low detail is several times lighter');
  const g0 = buildTowerGraph([]); const empty = buildFilaments(buildScene(g0, gridify(layoutCosmos(g0))), 'high'); assert.equal(empty.strands, 0); assert.equal(empty.dust.length, 0);
});

test('routes: a real link runs along the real hierarchy, from one test up to the common ancestor and down to the other; no invented node or hop', () => {
  const {s, g} = setup(300); let cross = 0, same = 0, far = 0;
  const parentOf = i => (s.nodes[i].parent ? s.index.get(s.nodes[i].parent) : undefined);
  s.edges.forEach(e => {
    const r = routeOf(s, e); assert.equal(r[0], e.a); assert.equal(r[r.length - 1], e.b); assert.equal(new Set(r).size, r.length, 'no node twice');
    if (e.kind === 0) { assert.deepEqual(r, [e.a, e.b]); return; }
    let jumps = 0; for (let k = 1; k < r.length; k += 1) { const up = parentOf(r[k - 1]) === r[k], down = parentOf(r[k]) === r[k - 1]; if (!up && !down) { jumps += 1; assert.equal(s.nodes[r[k - 1]].kind, 'domain'); assert.equal(s.nodes[r[k]].kind, 'domain'); } }
    const sameDomain = s.nodes[e.a].domain === s.nodes[e.b].domain; assert.equal(jumps, sameDomain ? 0 : 1, 'only a link between two domains hops, and only from domain to domain');
    if (!sameDomain) cross += 1; else if (s.nodes[e.a].parent === s.nodes[e.b].parent) { same += 1; assert.deepEqual(r, [e.a, parentOf(e.a), e.b], 'same campaign: through that campaign'); } else far += 1;
    for (const i of r.slice(1, -1)) assert.notEqual(s.nodes[i].kind, 'test', 'only containers in between');
  });
  assert.ok(cross > 0 && same + far > 0, `the fixture has links inside and across domains (${cross}/${same}/${far})`); assert.ok(g.links.length > 0);
});

test('geometry: every strand leaves and arrives exactly at the two nodes of its edge; curves are smooth; links hug the hierarchy corridor', () => {
  const {s} = setup(); const f = buildFilaments(s, 'high'), S = f.segments, per = (S + 1) * 2; let hug = 0, links = 0;
  s.edges.forEach((e, i) => {
    const a = P(s.xyz, e.a), b = P(s.xyz, e.b), len = dist(a, b), tol = 1e-3 * (1 + len); const first = f.range[2 * i], n = f.range[2 * i + 1] / per;
    assert.ok(dist(P(f.axis, i * (AXIS + 1)), a) < tol && dist(P(f.axis, i * (AXIS + 1) + AXIS), b) < tol, 'the axis joins the two nodes');
    for (let k = 0; k < n; k += 1) { const v0 = first + k * per; assert.ok(dist(P(f.pos, v0), a) < tol, 'starts at node a'); assert.ok(dist(P(f.pos, v0 + per - 1), b) < tol, 'ends at node b');
      let maxTurn = 0; for (let q = 0; q <= S; q += 1) { assert.deepEqual(P(f.pos, v0 + 2 * q), P(f.pos, v0 + 2 * q + 1), 'both ribbon sides share the centre line'); assert.deepEqual([f.side[v0 + 2 * q], f.side[v0 + 2 * q + 1]], [-1, 1]); const t = P(f.tan, v0 + 2 * q); assert.ok(Math.abs(Math.hypot(...t) - 1) < 1e-3, 'unit tangent'); if (q > 0) { const p = P(f.tan, v0 + 2 * q - 2); maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, t[0] * p[0] + t[1] * p[1] + t[2] * p[2])))); } }
      assert.ok(maxTurn < 1.4, `no sharp spike: the largest turn between two samples is ${maxTurn.toFixed(2)} rad`); }
    const route = routeOf(s, e); if (e.kind !== 0 && route.length >= 4) { links += 1; const pts = route.map(j => P(s.xyz, j)); const mid = P(f.axis, i * (AXIS + 1) + AXIS / 2), chordMid = a.map((x, j) => (x + b[j]) / 2); if (toPolyline(mid, pts) < toPolyline(chordMid, pts) + 1e-6) hug += 1; }
  });
  assert.ok(links > 10); assert.ok(hug >= links * 0.7, `most links bend toward their corridor instead of following the straight chord (${hug}/${links})`);
});

test('mass follows real structure: a trunk has more strands the more tests hang below it; threads and single links stay thin', () => {
  const {s} = setup(300); const trunks = s.edges.filter(e => bundleClass(s, e) === 0);
  for (const a of trunks) for (const b of trunks) if (s.nodes[a.b].leaves >= s.nodes[b.b].leaves) assert.ok(strandCount(s, a, 'high') >= strandCount(s, b, 'high'));
  const byKind = k => s.edges.filter(e => bundleClass(s, e) === k).map(e => strandCount(s, e, 'high')); assert.ok(Math.max(...byKind(0)) >= 3 * Math.max(...byKind(1)) && Math.max(...byKind(0)) >= 3 * Math.max(...byKind(2)));
  assert.ok(Math.max(...byKind(0)) <= 18, 'capped'); for (const e of s.edges) assert.ok(strandCount(s, e, 'low') <= strandCount(s, e, 'high'));
  s.edges.forEach(e => assert.equal(bundleClass(s, e), e.kind !== 0 ? 2 : s.nodes[e.a].kind !== 'test' && s.nodes[e.b].kind !== 'test' ? 0 : 1));
});

test('cloud: every density puff belongs to a real edge and stays inside the corridor of that edge; three scales; the cloud respects its budget', () => {
  const {s} = setup(); for (const lod of ['low', 'high']) {
    const f = buildFilaments(s, lod), S = f.segments, per = (S + 1) * 2; let d = 0, worst = 0, wide = 0, fine = 0;
    s.edges.forEach((e, i) => { assert.equal(f.dustRange[2 * i], d); const n = f.dustRange[2 * i + 1]; assert.ok(n >= strandCount(s, e, lod), 'each strand carries at least one grain');
      const sig = cloudSigma(s, e); for (let g = d; g < d + n; g += 1) { assert.ok(f.dustSize[g] > 0 && f.dustSize[g] <= sig * 2.4 + 1e-6, 'a puff is never wider than its corridor allows'); if (f.dustSize[g] > sig) wide += 1; else if (f.dustSize[g] < sig * 0.4) fine += 1; }
      for (let g = d; g < d + n; g += Math.max(1, n >> 3)) { const p = P(f.dust, g); let m = Infinity; for (let v = f.range[2 * i]; v < f.range[2 * i] + f.range[2 * i + 1] - 2; v += 2) m = Math.min(m, toSeg(p, P(f.pos, v), P(f.pos, v + 2))); worst = Math.max(worst, m / sig); }
      d += n; });
    assert.equal(d, f.dustSize.length); assert.equal(f.dust.length, d * 3); assert.ok(d <= DUST[lod].budget * 1.15 + f.strands, `budget (${d})`); assert.ok(worst < 3.5, `puffs stay within the corridor of their own edge (${worst.toFixed(2)} sigma)`);
    assert.ok(f.dustGain.every(x => x > 0 && x <= 1)); assert.ok(wide > d * 0.02 && wide < d * 0.3 && fine > d * 0.25, `a few wide puffs, many fine ones (${wide}/${fine}/${d})`); assert.equal(f.dustGain.length, d);
  }
  assert.ok(buildFilaments(s, 'low').dustSize.length < buildFilaments(s, 'high').dustSize.length);
  const big = setup(1500).s; assert.ok(buildFilaments(big, 'low').dustSize.length <= DUST.low.budget * 1.15 + buildFilaments(big, 'low').strands, 'a dense web is scaled down to the budget');
});

test('deterministic (hash of the edge id), and the geometry follows the nodes when the illustrative motion moves them', () => {
  const a = setup(), b = setup(); const fa = buildFilaments(a.s, 'high'), fb = buildFilaments(b.s, 'high'); assert.deepEqual(Array.from(fa.pos.slice(0, 3000)), Array.from(fb.pos.slice(0, 3000))); assert.deepEqual(Array.from(fa.axis), Array.from(fb.axis)); assert.deepEqual(Array.from(fa.dust.slice(0, 900)), Array.from(fb.dust.slice(0, 900)));
  const before = Float32Array.from(fa.pos), dustBefore = Float32Array.from(fa.dust); for (let i = 0; i < a.s.xyz.length; i += 1) a.s.xyz[i] *= 1.04; updateFilaments(fa, a.s);
  const e = a.s.edges[5], per = (fa.segments + 1) * 2, v0 = fa.range[10], tol = 1e-3 * (1 + Math.hypot(...P(a.s.xyz, e.a))); assert.ok(dist(P(fa.pos, v0), P(a.s.xyz, e.a)) < tol); assert.ok(dist(P(fa.pos, v0 + per - 1), P(a.s.xyz, e.b)) < tol);
  let moved = 0; for (let i = 0; i < before.length; i += 3) if (Math.abs(fa.pos[i] - before[i]) > 1e-4) moved += 1; assert.ok(moved > before.length / 3 * 0.8); assert.notDeepEqual(Array.from(fa.dust.slice(0, 300)), Array.from(dustBefore.slice(0, 300))); assert.equal(fa.index.length, fb.index.length, 'same topology');
});
