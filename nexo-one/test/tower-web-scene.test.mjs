import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {gridify, layoutCosmos} from '../src/tower-web/embed3d.ts';
import {fitCamera, orbit} from '../src/tower-web/camera3d.ts';
import {ALL_KINDS, buildScene, DEGREE_CAP, hitTest, NO_FILTER, projectScene, sampleEdges, searchNodes, SELECTED_SIZE, DIM, sizeOf, styleOf, visibility} from '../src/tower-web/scene.ts';
import {BIRTH_MS, drawFallback, drawOverlay, FALLBACK_WIDTHS} from '../src/tower-web/draw2d.ts';
import {AXIS, buildFilaments} from '../src/tower-web/filaments.ts';
import {BLUE, BLUE_LIT, contrast, TOKENS, WEB_BLUE} from '../src/tower-web/palette.ts';

const mk = (n, extra = () => ({})) => Array.from({length: n}, (_, i) => { const d = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'][i % 3]; return {id: `t${String(i).padStart(3, '0')}`, name: `Ensaio ${i}`, domain: d, subdomainId: `${d}-s${(i >> 2) % 4}`, campaignId: `${d}-c${(i >> 3) % 5}`, parents: i >= 3 ? [`t${String(i - 3).padStart(3, '0')}`] : [], verdict: null, createdAt: i % 10 === 0 ? null : new Date(Date.UTC(2030, 0, 1 + i)).toISOString(), ...extra(i)}; });
const setup = (n = 200, extra) => { const g = buildTowerGraph(mk(n, extra)); const layout = gridify(layoutCosmos(g)); const s = buildScene(g, layout); return {g, layout, s, cam: fitCamera(layout.extent, 900, 600, layout.center), w: 900, h: 600}; };
const mockCtx = () => { const calls = {}, styles = new Set(); const ctx = new Proxy({}, {get: (t, p) => (p in t ? t[p] : p === 'measureText' ? () => ({width: 40}) : () => { calls[p] = (calls[p] ?? 0) + 1; }), set: (t, p, v) => { if (p === 'fillStyle' || p === 'strokeStyle') styles.add(String(v)); t[p] = v; return true; }}); return {ctx, calls, styles}; };
const frame = (x, over = {}) => { const v = visibility(x.s, NO_FILTER), e = sampleEdges(x.s, v.node, 1e9); return {cam: x.cam, w: x.w, h: x.h, dpr: 1, theme: 'dark', style: styleOf(x.s, v.node, e.edge, null), selected: null, hover: null, births: new Map(), labels: true, box: true, labelLevel: 2, ...over}; };

test('scene: one point per published node, one segment per real edge; the Tower root is never a node or an endpoint', () => {
  const {g, s} = setup();
  assert.equal(s.nodes.length, g.nodes.length - 1); assert.ok(!s.index.has('tower')); assert.ok(s.nodes.every(n => n.kind !== 'root'));
  const hierarchy = g.edges.filter(e => e.kind === 'contains' && e.source !== 'tower').length;
  assert.equal(s.edges.length, hierarchy + g.links.length, 'no edge is added (no trunks, no nearest-neighbour edges) and none is dropped');
  const real = new Set([...g.edges, ...g.links].map(e => e.id)); for (const e of s.edges) assert.ok(real.has(e.id), `edge ${e.id} exists in the graph`);
  const deg = new Uint16Array(s.nodes.length); for (const e of s.edges) { deg[e.a] += 1; deg[e.b] += 1; } assert.deepEqual(Array.from(s.degree), Array.from(deg), 'degree = real incident edges');
  s.adj.forEach((a, i) => assert.equal(a.length, s.degree[i]));
});

test('scene: point size comes from the real degree, 1.5-3 px for ordinary nodes, 3-5 px for hubs, capped', () => {
  assert.equal(sizeOf(0), 1.5); assert.equal(sizeOf(4), 3); assert.ok(sizeOf(5) > 3 && sizeOf(5) < 5); assert.equal(sizeOf(DEGREE_CAP), 5); assert.equal(sizeOf(10000), 5);
  for (let d = 1; d < 40; d += 1) assert.ok(sizeOf(d) >= sizeOf(d - 1), 'monotone');
  const {s} = setup(); s.size.forEach((v, i) => { assert.equal(v, Math.fround(sizeOf(s.degree[i]))); assert.ok(v >= 1.5 && v <= 5); }); assert.ok(SELECTED_SIZE >= 5 && SELECTED_SIZE <= 7);
});

test('filters change visibility, never positions; counts are visible/total; clearing restores everything', () => {
  const {s} = setup(); const before = Float32Array.from(s.xyz);
  const all = visibility(s, NO_FILTER); assert.equal(all.visible, s.nodes.length); assert.equal(all.total, s.nodes.length);
  const onlyTests = visibility(s, {...NO_FILTER, kinds: new Set(['test'])}); assert.equal(onlyTests.visible, 200); assert.ok(s.nodes.every((n, i) => (n.kind === 'test') === (onlyTests.node[i] === 1)));
  const hubs = visibility(s, {...NO_FILTER, minDegree: 5}); assert.ok(hubs.visible > 0 && hubs.visible < all.visible); assert.ok(s.nodes.every((_, i) => (s.degree[i] >= 5) === (hubs.node[i] === 1)));
  assert.equal(visibility(s, {...NO_FILTER, kinds: new Set()}).visible, 0);
  assert.deepEqual(Array.from(s.xyz), Array.from(before)); assert.equal(visibility(s, {kinds: ALL_KINDS, minDegree: 0, cut: null}).visible, all.visible);
  // edges need both endpoints
  const e = sampleEdges(s, onlyTests.node, 1e9); s.edges.forEach((x, i) => assert.equal(e.edge[i], x.kind === 0 ? 0 : 1)); assert.equal(e.sampled, false); assert.equal(e.shown, e.total);
  const off = sampleEdges(s, all.node, 1e9, null, {hierarchy: false, depends: true}); assert.equal(off.total, s.edges.filter(x => x.kind !== 0).length);
});

test('replay: only tests with a published creation date <= the cut are shown; undated tests stay out; containers follow their tests', () => {
  const {s, g} = setup(); const dated = s.nodes.filter(n => n.kind === 'test' && n.born !== null); assert.equal(dated.length, 180, '1 in 10 has no published date');
  const cut = Date.UTC(2030, 0, 40); const v = visibility(s, {...NO_FILTER, cut});
  s.nodes.forEach((n, i) => { if (n.kind === 'test') assert.equal(v.node[i], n.born !== null && n.born <= cut ? 1 : 0); });
  s.nodes.forEach((n, i) => { if (n.kind === 'test') return; const has = (id) => { const x = g.byId.get(id); return x.kind === 'test' ? x.born !== null && x.born <= cut : x.children.some(has); }; assert.equal(v.node[i], has(n.id) ? 1 : 0, n.id); });
  assert.equal(visibility(s, {...NO_FILTER, cut: 0}).visible, 0); assert.ok(visibility(s, {...NO_FILTER, cut: Date.UTC(2031, 0, 1)}).visible < s.nodes.length, 'undated tests never enter the replay');
});

test('sampling under load is deterministic by edge id, reports shown/total and always keeps the edges of the selected node', () => {
  const {s} = setup(400); const v = visibility(s, NO_FILTER); const hub = s.degree.indexOf(Math.max(...s.degree));
  const a = sampleEdges(s, v.node, 100, hub), b = sampleEdges(s, v.node, 100, hub);
  assert.ok(a.sampled); assert.equal(a.total, s.edges.length); assert.ok(a.shown < a.total && a.shown > 40 && a.shown < 100 + s.degree[hub] + 60, `shown ${a.shown}`); assert.deepEqual(Array.from(a.edge), Array.from(b.edge));
  s.edges.forEach((e, i) => { if (e.a === hub || e.b === hub) assert.equal(a.edge[i], 1, 'selected node keeps its edges'); });
  assert.equal(Array.from(a.edge).reduce((x, y) => x + y, 0), a.shown);
  // the same edge ids are kept on a rebuilt scene (hash of id, not of array position)
  const again = setup(400).s; const c = sampleEdges(again, visibility(again, NO_FILTER).node, 100, hub); assert.deepEqual(again.edges.filter((_, i) => c.edge[i]).map(e => e.id), s.edges.filter((_, i) => a.edge[i]).map(e => e.id));
});

test('style: a selection keeps the node and its real neighbours at full strength and dims the rest; hidden stays hidden', () => {
  const {s} = setup(); const v = visibility(s, NO_FILTER), e = sampleEdges(s, v.node, 1e9); const i = s.index.get('test:t050');
  const plain = styleOf(s, v.node, e.edge, null); assert.ok(plain.node.every(x => x === 1)); assert.ok(s.edges.every((x, k) => plain.edge[k] === (x.kind === 0 ? 0.5 : 1)));
  const f = styleOf(s, v.node, e.edge, i); const near = new Set([i, ...s.adj[i]]);
  f.node.forEach((x, k) => assert.equal(x, near.has(k) ? 1 : Math.fround(DIM))); s.edges.forEach((x, k) => { if (x.a === i || x.b === i) assert.equal(f.edge[k], 1); else assert.ok(f.edge[k] <= 0.4 + 1e-6 && f.edge[k] > 0, 'the rest of the cloud stays as dimmed context'); });
  const few = visibility(s, {...NO_FILTER, kinds: new Set(['domain'])}); const h = styleOf(s, few.node, sampleEdges(s, few.node, 1e9).edge, null); assert.equal(h.node.filter(x => x > 0).length, 3); assert.ok(h.edge.every(x => x === 0));
});

test('search: existing labels and ids only, accent/case-insensitive, prefix first, bounded; nothing is invented', () => {
  const {s} = setup(200, i => (i === 7 ? {name: 'Órbita de calibração'} : {}));
  assert.deepEqual(searchNodes(s, ''), []); assert.deepEqual(searchNodes(s, '   '), []); assert.deepEqual(searchNodes(s, 'zzz-nao-existe'), []);
  const o = searchNodes(s, 'orbita'); assert.equal(o.length, 1); assert.equal(s.nodes[o[0]].id, 'test:t007');
  const byId = searchNodes(s, 'T04'); assert.ok(byId.length > 0 && byId.length <= 8); assert.ok(byId.every(i => s.nodes[i].id.startsWith('test:t04')));
  assert.equal(s.nodes[searchNodes(s, 'scien')[0]].kind, 'domain', 'prefix match on a label, domains before deeper kinds');
  assert.equal(searchNodes(s, 'ensaio', 5).length, 5);
  const hidden = visibility(s, {...NO_FILTER, kinds: new Set(['domain'])}); const r = searchNodes(s, 'ensaio 1', 8, hidden.node); assert.ok(r.length > 0, 'filtered nodes are still findable (listed after visible ones)');
});

test('hit test: nearest to the eye within reach (>= 8 px for touch), respects the visibility mask', () => {
  const x = setup(); projectScene(x.s, x.cam, x.w, x.h); const {sx, sy, sz} = x.s.proj; let exact = 0;
  for (let i = 0; i < x.s.nodes.length; i += 9) { const j = hitTest(x.s, sx[i], sy[i]); assert.notEqual(j, null); assert.ok(Math.hypot(sx[j] - sx[i], sy[j] - sy[i]) <= 8.01); assert.ok(sz[j] <= sz[i] + 1e-6); if (j === i) exact += 1; }
  assert.ok(exact > 10); assert.equal(hitTest(x.s, -500, -500), null);
  const i = 20, mask = new Uint8Array(x.s.nodes.length).fill(1); mask[i] = 0; assert.notEqual(hitTest(x.s, sx[i], sy[i], mask), i);
  assert.equal(hitTest(x.s, sx[i] + 7, sy[i]) !== null, true, 'a small point is pickable 7 px away');
  const sig = x.s.sig; projectScene(x.s, x.cam, x.w, x.h); assert.equal(x.s.sig, sig); projectScene(x.s, orbit(x.cam, 40, 10), x.w, x.h); assert.notEqual(x.s.sig, sig);
});

test('palette: white/black and one blue family; interface blue #1E5BFF, web light #0285FF; text contrast >= 4.5:1; marks >= 3:1', () => {
  assert.equal(BLUE, '#1E5BFF'); assert.equal(WEB_BLUE, '#0285FF'); assert.deepEqual([TOKENS.light.bg, TOKENS.dark.bg, TOKENS.light.blue, TOKENS.dark.blue, TOKENS.dark.mark, TOKENS.light.mark], ['#FFFFFF', '#000000', BLUE, BLUE, WEB_BLUE, BLUE]);
  for (const th of ['light', 'dark']) { const t = TOKENS[th]; for (const bg of [t.bg, t.surface]) {
    for (const k of ['text', 'secondary', 'accentText', 'ring']) assert.ok(contrast(t[k], bg) >= 4.5, `${th} ${k} on ${bg}: ${contrast(t[k], bg).toFixed(2)}`);
    assert.ok(contrast(t.mark, bg) >= 3 && contrast(t.blue, bg) >= 3, `${th} marks and highlights are graphics, >= 3:1`); } }
  assert.ok(contrast(BLUE, '#000000') < 4.5, 'which is why text on black uses the lit blue'); assert.equal(TOKENS.dark.accentText, BLUE_LIT); assert.equal(TOKENS.light.accentText, BLUE);
  assert.notEqual(TOKENS.light.text, TOKENS.light.accentText, 'body text is ink, not blue'); assert.notEqual(TOKENS.dark.text, TOKENS.dark.accentText);
  // every token is black, white, grey-blue or blue: blue is the largest channel and red the smallest
  for (const th of ['light', 'dark']) for (const [k, hex] of Object.entries(TOKENS[th])) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; assert.ok(b >= g && g >= r, `${th}.${k} ${hex} is in the blue family`); }
  // no warm hue anywhere in the web sources: every colour literal is grey or blue-green dominant
  const dir = new URL('../src/tower-web/', import.meta.url);
  for (const f of ['palette.ts', 'scene.ts', 'filaments.ts', 'gl3d.ts', 'draw2d.ts', 'TowerCosmos.tsx', 'tower-cosmos.css', 'lcdm.ts']) {
    const src = readFileSync(new URL(f, dir), 'utf8'); assert.ok(!/\b(?:gold\w*|dourad\w*|orange|laranja|amber|cyan|ciano)\b/i.test(src), `${f} mentions a colour outside the palette`);
    for (const m of src.matchAll(/#([0-9a-fA-F]{6})\b/g)) { const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; assert.ok(r <= g + 2 && r <= b + 2, `${f}: #${m[1]} is warm`); assert.ok(b >= g - 2, `${f}: #${m[1]} leans green, not blue`); }
  }
  assert.ok(!readdirSync(dir).some(f => ['draw3d.ts', 'dust.ts'].includes(f)), 'the gold density renderer is gone');
});

test('fallback canvas draws the same scene with the same tokens: one curved stroke per real edge in a few batches, points, no per-node colour, no decoration', () => {
  const x = setup(); const fil = buildFilaments(x.s, 'low'); for (const theme of ['dark', 'light']) {
    const {ctx, calls, styles} = mockCtx(); drawFallback(ctx, x.s, frame(x, {theme}), fil);
    assert.ok(calls.fillRect === 1, 'one background fill'); assert.ok(calls.fill <= 7 && calls.fill >= 1, `points in <= 6 batches (+selected): ${calls.fill}`); assert.ok(calls.stroke >= 1 && calls.stroke <= FALLBACK_WIDTHS.length * 6 * 2, `filaments in a bounded number of strokes: ${calls.stroke}`); const paths = (calls.moveTo - calls.arc) / 2; assert.ok(paths > x.s.edges.length * 0.9 && paths <= x.s.edges.length, 'one corridor per real edge (drawn as a wide soft stroke and a core stroke), none extra'); assert.equal(calls.lineTo, paths * 2 * AXIS, 'each stroke follows the sampled, smooth axis of its edge');
    assert.ok(calls.arc >= x.s.nodes.length * 0.9); assert.deepEqual([...styles].sort(), [TOKENS[theme].bg, TOKENS[theme].mark].sort());
    assert.equal(calls.createRadialGradient, undefined); assert.equal(calls.drawImage, undefined);
  }
  const none = mockCtx(); const v = visibility(x.s, {...NO_FILTER, kinds: new Set()}); drawFallback(none.ctx, x.s, frame(x, {style: styleOf(x.s, v.node, sampleEdges(x.s, v.node, 1e9).edge, null)}), fil); assert.equal(none.calls.lineTo, undefined); assert.equal(none.calls.arc, undefined); assert.equal(none.calls.fill, undefined);
});

test('overlay: thin ring on the selection, labels for domains / selection / its neighbours, short birth pulse that ends', () => {
  const x = setup(); const i = x.s.index.get('test:t050');
  const a = mockCtx(); assert.equal(drawOverlay(a.ctx, x.s, frame(x), true), false); assert.equal(a.calls.clearRect, 1); assert.ok(a.calls.fillText >= 3, 'domain labels'); assert.equal(a.calls.arc, undefined, 'no ring without selection/hover');
  const b = mockCtx(); drawOverlay(b.ctx, x.s, frame(x, {selected: i, hover: i + 1}), false); assert.equal(b.calls.clearRect, undefined); assert.equal(b.calls.arc, 2); assert.ok(b.calls.fillText > a.calls.fillText);
  const c = mockCtx(); assert.equal(drawOverlay(c.ctx, x.s, frame(x, {births: new Map([[i, 100], [i + 2, 300]])}), true), true); assert.equal(c.calls.arc, 2);
  assert.equal(drawOverlay(mockCtx().ctx, x.s, frame(x, {births: new Map([[i, BIRTH_MS]])}), true), false); assert.ok(BIRTH_MS <= 1000, 'the pulse is short');
  const d = mockCtx(); drawOverlay(d.ctx, x.s, frame(x, {labels: false, box: false}), true); assert.equal(d.calls.fillText, undefined); assert.equal(d.calls.stroke, undefined);
  const e = mockCtx(); drawOverlay(e.ctx, x.s, frame(x, {labelLevel: 0}), true); assert.ok(e.calls.fillText <= a.calls.fillText);
});

test('source hygiene: no statement is swallowed by an end-of-line comment (dense one-line style makes this easy to do)', () => {
  const dir = new URL('../src/tower-web/', import.meta.url);
  for (const f of readdirSync(dir).filter(x => /\.tsx?$/.test(x))) readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
    const at = line.search(/[;{})] \/\/ /); if (at < 0) return; const tail = line.slice(at + 5);
    assert.ok(!/[A-Za-z_\])!]\s*(?:=(?!=)|\+=)\s*[^=]|\b(?:const|let|return|if|for)\b.*[;{]\s*$|\);\s*$/.test(tail) || !/;/.test(tail), `${f}:${i + 1} has code after a comment: ${tail.slice(0, 90)}`);
  });
});
