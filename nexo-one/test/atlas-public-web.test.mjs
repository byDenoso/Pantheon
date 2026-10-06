import test from 'node:test';
import assert from 'node:assert/strict';
import {HARD_LIMITS, QUALITY, buildWeb, initialQuality, mulberry32, nextQuality, project} from '../src/atlas/web/webModel.ts';
import {guardItem, guardItems, loadPublic, MAX_ITEMS} from '../src/atlas/publicItems.ts';
import {flattenData} from '../src/atlas/flatten.ts';
import {json, raw} from './helpers/atlas-mock.mjs';

const bi = s => ({'pt-BR': `${s} pt`, en: `${s} en`});
const item = (id = 'syn-1', over = {}) => ({id, kind: 'method', title: bi('t'), plain: bi('p'), technical: bi('x'), ...over});

test('web is deterministic, respects node/arc limits and hard caps for every quality', () => {
  for (const [k, q] of Object.entries(QUALITY)) {
    const a = buildWeb(7, q), b = buildWeb(7, q);
    assert.deepEqual(a, b, k);
    assert.ok(a.nodes.length <= Math.min(q.nodes, HARD_LIMITS.nodes), k);
    assert.ok(a.arcs.length <= Math.min(q.arcs, HARD_LIMITS.arcs), k);
    for (const [i, j] of a.arcs) { assert.ok(i !== j && i < a.nodes.length && j < a.nodes.length); }
  }
  assert.ok(buildWeb(1, {nodes: 99999, arcs: 99999, dprCap: 1, glow: false}).nodes.length <= HARD_LIMITS.nodes);
});
test('PRNG and projection are finite', () => {
  const r = mulberry32(1); for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
  const p = project({x: 1, y: 1, z: 1, r: 1}, 1, 800, 600);
  assert.ok(Number.isFinite(p.sx) && Number.isFinite(p.sy) && p.depth > 0);
});
test('adaptive quality only ever steps down and initial quality scales with device', () => {
  assert.equal(nextQuality('high', 3), 'high'); assert.equal(nextQuality('high', 20), 'medium'); assert.equal(nextQuality('medium', 20), 'low'); assert.equal(nextQuality('low', 99), 'low');
  assert.equal(initialQuality(400, 8, 8), 'low'); assert.equal(initialQuality(1400, 2, 8), 'low'); assert.equal(initialQuality(1400, 8, 8), 'high'); assert.equal(initialQuality(800, 8, 8), 'medium');
});

test('public item guard is an allowlist: malformed, unknown kind, missing locale or duplicate ids are dropped', () => {
  assert.ok(guardItem(item()));
  for (const bad of [null, [], 'x', item('a', {kind: 'secret'}), item('', {}), item('a', {title: {'pt-BR': 'só pt'}}), item('a', {plain: {'pt-BR': '', en: ''}}), item('a', {technical: undefined})]) {
    assert.equal(guardItem(bad), null);
  }
  assert.equal(Object.keys(guardItem({...item(), leak: 'x', links: ['y']})).includes('leak'), false);
  assert.equal(guardItems([item('a'), item('a'), item('b')]).length, 2);
  assert.equal(guardItems(Array.from({length: 500}, (_, i) => item(`i${i}`))).length, MAX_ITEMS);
});

test('empty API list → empty state; outage/static hosting → unavailable (no fallback content)', async () => {
  assert.deepEqual(await loadPublic(async () => json({contract: 'ATLAS_PUBLIC_V1', items: [], links: []})), {status: 'empty', items: [], tests: []});
  assert.equal((await loadPublic(async () => raw('<html/>', 200))).status, 'unavailable');
  assert.equal((await loadPublic(async () => { throw new TypeError('net'); })).status, 'unavailable');
  assert.equal((await loadPublic(async () => json({contract: 'ATLAS_PUBLIC_V1', items: [{garbage: 1}], links: []}))).status, 'empty');
  assert.equal((await loadPublic(async () => json({contract: 'ATLAS_PUBLIC_V1', items: [item()], links: []}))).status, 'ready');
});

test('private data flattening is bounded in depth, rows and string length', () => {
  const deep = {a: {b: {c: {d: {e: {f: 1}}}}}};
  assert.ok(flattenData(deep).rows.every(r => r.path.split('.').length <= 5));
  const wide = Object.fromEntries(Array.from({length: 1000}, (_, i) => [`k${i}`, i]));
  const f = flattenData(wide); assert.equal(f.rows.length, 200); assert.equal(f.omitted, 800);
  assert.ok(flattenData({s: 'x'.repeat(5000)}).rows[0].value.length <= 301);
  assert.deepEqual(flattenData({}).rows, []);
});
