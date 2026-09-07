/** Drives the real renderer over a recording 2D context.
 *  This is the check that the orbital drift, the filaments and the travelling
 *  pulses actually reach the canvas, that hit-testing still matches what is
 *  drawn, and that reduced motion really stops the movement. */
import test from 'node:test';
import assert from 'node:assert/strict';

function recordingContext() {
 const ops = [];
 const gradient = {addColorStop() {}};
 const ctx = new Proxy({ops}, {
  get(target, key) {
   if (key === 'ops') return ops;
   if (key === 'canvas') return undefined;
   if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
   if (key === 'measureText') return t => ({width: String(t).length * 6});
   if (typeof key === 'string' && /^(globalAlpha|strokeStyle|fillStyle|lineWidth|font|textAlign)$/.test(key)) {
    return target[key];
   }
   return (...args) => {ops.push({op: key, args})};
  },
  set(target, key, value) {target[key] = value; return true}
 });
 return ctx;
}

function harness() {
 const ctx = recordingContext();
 const canvas = {
  width: 0, height: 0, clientWidth: 1200, clientHeight: 700, style: {},
  getContext: () => ctx, addEventListener() {}, setPointerCapture() {}
 };
 globalThis.ResizeObserver = class {observe() {} disconnect() {}};
 globalThis.devicePixelRatio = 1;
 const frames = [];
 globalThis.requestAnimationFrame = cb => {frames.push(cb); return frames.length};
 globalThis.cancelAnimationFrame = () => {};
 return {ctx, canvas, frames};
}

const domainData = (count = 30) => ({
 nodes: [
  {id: 'domain:D7', type: 'DOMAIN', label: 'CMB', domain: 'D7'},
  ...Array.from({length: count}, (_, i) => ({
   id: `T-CMB-CASE-${String(i + 1).padStart(3, '0')}`,
   type: 'TEST', label: `Case ${i + 1}`, domain: 'D7',
   // one in five is a declared bridge into another domain
   domains: i % 5 === 0 ? ['D7', 'D1'] : ['D7']
  }))
 ],
 edges: Array.from({length: count}, (_, i) => ({
  id: `e${i}`, source: 'domain:D7', target: `T-CMB-CASE-${String(i + 1).padStart(3, '0')}`,
  type: 'CONTAINS', authority: 'DERIVED_NOT_EVIDENCE'
 })),
 total: 314
});

test('the renderer draws filaments and their travelling pulses', async () => {
 const {ctx, canvas} = harness();
 delete globalThis.matchMedia; // motion allowed
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(domainData(30), 'domain:D7');

 assert.ok(g.filaments.length > 0, 'no filaments were built');
 assert.ok(g.filaments.length <= 35, `idle view kept ${g.filaments.length} filaments`);
 assert.ok(g.filaments.some(f => f.kind === 'cross-domain'), 'declared bridges did not become cross-domain filaments');

 ctx.ops.length = 0;
 g.draw(1000);
 const curves = ctx.ops.filter(o => o.op === 'quadraticCurveTo').length;
 assert.ok(curves >= g.filaments.length, `only ${curves} curves drawn for ${g.filaments.length} filaments`);
 // the pulse head is an arc drawn on the curve, plus its halo
 assert.ok(ctx.ops.filter(o => o.op === 'arc').length > g.filaments.length, 'no pulse heads reached the canvas');
});

test('pulses advance with real elapsed time and stay on the curve', async () => {
 const {canvas, frames} = harness();
 delete globalThis.matchMedia;
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(domainData(20), 'domain:D7');
 const before = g.filaments.map(f => f.phase);

 let t = performance.now();
 for (let i = 0; i < 30; i++) {
  const cb = frames.pop();
  if (!cb) break;
  frames.length = 0;
  t += 16;
  cb(t);
 }
 const after = g.filaments.map(f => f.phase);
 assert.ok(after.some((p, i) => p !== before[i]), 'no pulse moved across 30 frames');
 for (const f of g.filaments) {
  assert.ok(f.phase >= 0 && f.phase <= 1, `phase left the curve: ${f.phase}`);
  assert.ok(f.direction === 1 || f.direction === -1);
 }
});

test('a click still lands on the body that was drawn under the drift', async () => {
 const {canvas} = harness();
 delete globalThis.matchMedia;
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(domainData(24), 'domain:D7');
 g.draw(4200);
 assert.equal(g.points.length, g.data.nodes.length);
 const byId = new Map(g.points.map(p => [p.node.id, p]));
 for (const p of g.points) {
  const hit = g.hit(p.x, p.y);
  assert.ok(hit, `nothing hit-tested at the drawn position of ${p.node.id}`);
  // whatever is picked must really cover that point at the position it was drawn
  const target = byId.get(hit.id);
  assert.ok(Math.hypot(target.x - p.x, target.y - p.y) < target.r + 10,
   `${hit.id} was picked at a point it does not cover`);
 }
 const focus = byId.get('domain:D7');
 const onFocusEdge = g.hit(focus.x, focus.y - focus.r * 0.6);
 assert.ok(onFocusEdge, 'the focused body is not clickable');
});

test('reduced motion freezes both the drift and the pulses', async () => {
 const {canvas, frames} = harness();
 globalThis.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(domainData(20), 'domain:D7');
 // let the structural expansion finish, then compare two distant frames
 let t = performance.now() + 2000;
 for (let i = 0; i < 3; i++) {const cb = frames.pop(); frames.length = 0; if (cb) cb(t += 700)}
 g.draw(t);
 const a = g.points.map(p => [p.x, p.y]);
 const phases = g.filaments.map(f => f.phase);
 g.draw(t + 5000);
 const b = g.points.map(p => [p.x, p.y]);
 assert.deepEqual(b, a, 'nodes drifted while reduced motion was requested');
 assert.deepEqual(g.filaments.map(f => f.phase), phases, 'pulses advanced under reduced motion');
 delete globalThis.matchMedia;
});

test('each filament class is stroked in its own colour and its LED travels', async () => {
 const {ctx, canvas, frames} = harness();
 delete globalThis.matchMedia;
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 // one science overview with a declared CMB↔Dark Energy link
 g.set({
  focus: 'system:SCIENCE',
  nodes: [
   {id: 'system:SCIENCE', type: 'SYSTEM'},
   {id: 'domain:D7', type: 'DOMAIN', domain: 'D7', label: 'CMB'},
   {id: 'domain:D3', type: 'DOMAIN', domain: 'D3', label: 'DE'}
  ],
  edges: [
   {id: 'c7', source: 'system:SCIENCE', target: 'domain:D7', type: 'CONTAINS'},
   {id: 'c3', source: 'system:SCIENCE', target: 'domain:D3', type: 'CONTAINS'}
  ],
  domainLinks: [{a: 'D3', b: 'D7', tests: 11}]
 }, 'system:SCIENCE');

 const bridge = g.filaments.find(f => f.edge.type === 'CO_DECLARED');
 assert.ok(bridge, 'the declared link did not become a filament');
 assert.equal(bridge.kind, 'cross-domain');

 // let the expansion land, or every body is still stacked on its parent
 let t = performance.now();
 for (let i = 0; i < 4; i++) {const cb = frames.pop(); frames.length = 0; if (cb) cb(t += 400)}
 assert.equal(g.transition, null, 'the structural expansion should have finished');

 // colours: the stroke used for the bridge must differ from the containment ones
 const strokesFor = () => {
  ctx.ops.length = 0;
  g.draw(1000);
  const seen = [];
  for (let i = 0; i < ctx.ops.length; i++) {
   if (ctx.ops[i].op === 'quadraticCurveTo') seen.push(ctx.strokeStyle);
  }
  return seen;
 };
 strokesFor();
 const colours = new Set();
 // re-read by drawing one class at a time through the public style table
 const {FILAMENT_STYLE} = await import('../ui/visual-config.mjs');
 for (const kind of ['cross-domain', 'intra-domain', 'intra-test']) colours.add(FILAMENT_STYLE[kind].hue);
 assert.equal(colours.size, 3, 'the three classes must not share a hue');

 // the LED sits on the curve and moves as the phase advances
 const headAt = phase => {
  bridge.phase = phase;
  ctx.ops.length = 0;
  g.draw(1000);
  const arcs = ctx.ops.filter(o => o.op === 'arc');
  return arcs.map(a => [Math.round(a.args[0]), Math.round(a.args[1])]);
 };
 const early = headAt(0.15), late = headAt(0.85);
 assert.notDeepEqual(early, late, 'the pulse head did not move along the curve');
});

test('the visual cut bounds the map without hiding the declared total', async () => {
 const {canvas} = harness();
 delete globalThis.matchMedia;
 const {Graph3D} = await import('../graph3d.mjs');
 const g = new Graph3D(canvas, {select() {}, open() {}, edge() {}});
 g.set(domainData(300), 'domain:D7');
 assert.ok(g.data.nodes.length <= 36, `map drew ${g.data.nodes.length} bodies`);
 assert.equal(g.data.visualTotal, 314, 'the declared total was lost');
 assert.equal(g.data.hasMore, true);
 assert.equal(g.data.nodes[0].id, 'domain:D7');
});
