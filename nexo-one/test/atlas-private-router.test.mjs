import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeHolder, validateRuntime} from '../src/private-legacy/runtime.ts';
import {createPrivateFetch} from '../src/private-legacy/router.ts';
import {FP, FP2, makeRuntime} from './helpers/synthetic-runtime.mjs';

const O = 'https://atlas.example.test';
const load = (over, fp) => validateRuntime(makeRuntime(over, fp)).runtime;
const setup = over => { const h = createRuntimeHolder(); h.set(load(over)); const denied = []; return {h, denied, f: createPrivateFetch(h, O, (p, r) => denied.push([r, p]))}; };
const json = async r => JSON.parse(await r.text());

test('every legacy read path is answered from the same in-memory generation', async () => {
  const {f} = setup();
  assert.equal((await json(await f('/api/system'))).bus.fingerprint, FP);
  const worldText = await (await f('/api/world?stream=1&refresh=1')).text();
  assert.equal(worldText.endsWith('\n'), true);
  assert.equal(JSON.parse(worldText.trim()).fingerprint, FP);
  assert.equal((await json(await f(`${O}/api/atlas-private-assets/mcp/topology.json?readback=1`))).source.projection_fingerprint, FP);
  const pub = await json(await f('/api/atlas-private-assets/tower-projection/publication.json'));
  assert.equal(pub.manifest.projection_fingerprint, FP); assert.equal(pub.build_meta.projection_fingerprint, FP);
  assert.equal((await json(await f(new URL('/api/galaxy/latest.json?projection=x', O)))).provenance.source_fingerprint, FP);
  assert.equal((await json(await f('/api/atlas-private-assets/build-meta.json'))).projection_fingerprint, FP);
  assert.equal((await json(await f({url: `${O}/api/system`}))).bus.fingerprint, FP, 'Request-like input');
});

test('swapping the generation changes every adapter at once (no mixed generations)', async () => {
  const {h, f} = setup();
  h.set(load({}, FP2));
  for (const [p, pick] of [['/api/system', s => s.bus.fingerprint], ['/api/atlas-private-assets/build-meta.json', s => s.projection_fingerprint], ['/api/galaxy/latest.json', s => s.provenance.source_fingerprint]]) {
    assert.equal(pick(await json(await f(p))), FP2, p);
  }
});

test('absent sections answer 404 NOT_CONNECTED, never an empty success', async () => {
  const {f} = setup({topology: null, publication: null, galaxy: null});
  for (const p of ['/api/atlas-private-assets/mcp/topology.json', '/api/atlas-private-assets/tower-projection/publication.json', '/api/galaxy/latest.json', '/api/atlas-private-assets/build-meta.json']) {
    const r = await f(p); assert.equal(r.status, 404, p); assert.equal((await json(r)).error, 'NOT_CONNECTED');
  }
});

test('anything without an adapter is denied (501) and logged, never forwarded', async () => {
  const {f, denied} = setup();
  for (const p of ['/api/recall?q=x', '/api/mcp', '/api/session', '/vendor/g6.min.js', '/api/atlas-private']) {
    const r = await f(p); assert.equal(r.status, 501, p); assert.equal((await json(r)).error, 'PRIVATE_ADAPTER_MISSING');
  }
  assert.equal((await f('https://elsewhere.example.test/api/system')).status, 501);
  assert.equal((await f('/api/system', {method: 'POST'})).status, 501);
  assert.deepEqual(denied.map(d => d[0]), ['NO_ADAPTER', 'NO_ADAPTER', 'NO_ADAPTER', 'NO_ADAPTER', 'NO_ADAPTER', 'FOREIGN_ORIGIN', 'METHOD']);
});

test('after the generation is cleared, reads fail with 503 instead of stale data', async () => {
  const {h, f} = setup(); h.clear();
  for (const p of ['/api/system', '/api/world', '/api/galaxy/latest.json']) assert.equal((await f(p)).status, 503, p);
});

test('responses are fresh copies: mutating one cannot corrupt the generation', async () => {
  const {f} = setup();
  const a = await json(await f('/api/system')); a.bus.fingerprint = 'tampered';
  assert.equal((await json(await f('/api/system'))).bus.fingerprint, FP);
});
