import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameBridge, RefreshError} from '../src/atlas/privateFrameBridge.ts';
import {FRAME, HOST, parseFromFrame, parseToFrame} from '../src/atlas/frameProtocol.ts';
import {createRefreshBroker, applyRefresh} from '../src/private-legacy/refresh.ts';
import {createRuntimeHolder, validateRuntime} from '../src/private-legacy/runtime.ts';
import {refreshPrivateRuntime} from '../src/atlas/privateRefresh.ts';
import {fakeTarget} from './helpers/atlas-mock.mjs';
import {makeRuntime, FP, FP2} from './helpers/synthetic-runtime.mjs';

const O = 'https://atlas.example.test';
const tick = () => new Promise(r => setTimeout(r, 0));

// ---- protocol ----
test('protocol: REFRESH / RUNTIME_REFRESH / REFRESH_FAILED are parsed strictly (opaque ids only)', () => {
  assert.deepEqual(parseFromFrame({channel: FRAME, type: 'REFRESH', id: 'r1-abc_9'}), {channel: FRAME, type: 'REFRESH', id: 'r1-abc_9'});
  for (const id of ['', 'a b', 'x'.repeat(65), '../x', 5, undefined, 'https://evil']) assert.equal(parseFromFrame({channel: FRAME, type: 'REFRESH', id}), null, String(id));
  assert.equal(parseToFrame({channel: HOST, type: 'RUNTIME_REFRESH', id: 'r1', data: {a: 1}}).type, 'RUNTIME_REFRESH');
  assert.equal(parseToFrame({channel: HOST, type: 'RUNTIME_REFRESH', id: 'bad id', data: {}}), null);
  assert.equal(parseToFrame({channel: HOST, type: 'REFRESH_FAILED', id: 'r1', code: 'NETWORK'}).code, 'NETWORK');
  assert.equal(parseToFrame({channel: HOST, type: 'REFRESH_FAILED', id: 'r1'}), null);
  assert.equal(parseToFrame({channel: FRAME, type: 'RUNTIME_REFRESH', id: 'r1', data: {}}), null);
});

// ---- parent bridge ----
function setup(over = {}) {
  const win = fakeTarget(); const posted = []; const frameWin = {postMessage: (m, o) => posted.push([m, o])};
  const calls = {errors: [], refreshed: []};
  const b = createFrameBridge({win, origin: O, getFrameWindow: () => frameWin, getData: () => ({}), onLogout() {}, onError: c => calls.errors.push(c), onRefreshed: d => calls.refreshed.push(d), ...over});
  return {win, posted, frameWin, calls, b, emit: e => win.emit('message', e)};
}
const ask = (t, id = 'r1') => t.emit({origin: O, source: t.frameWin, data: {channel: FRAME, type: 'REFRESH', id}});

test('REFRESH: parent revalidates + refetches, answers only the trusted frame, same-origin target, echoing the id', async () => {
  let n = 0; const fresh = {gen: 2};
  const t = setup({onRefresh: async () => { n += 1; return fresh; }});
  ask(t); await tick();
  assert.equal(n, 1);
  assert.deepEqual(t.posted, [[{channel: HOST, type: 'RUNTIME_REFRESH', id: 'r1', data: fresh}, O]]);
  assert.deepEqual(t.calls.refreshed, [fresh]);
  // untrusted senders never trigger a refetch
  t.emit({origin: 'https://evil.example.test', source: t.frameWin, data: {channel: FRAME, type: 'REFRESH', id: 'r2'}});
  t.emit({origin: O, source: {postMessage() {}}, data: {channel: FRAME, type: 'REFRESH', id: 'r3'}});
  await tick(); assert.equal(n, 1);
});

test('REFRESH is single-flight: concurrent asks share one revalidation, each gets its own id', async () => {
  let n = 0; let release; const gate = new Promise(r => { release = r; });
  const t = setup({onRefresh: async () => { n += 1; await gate; return {gen: 2}; }});
  ask(t, 'a'); ask(t, 'b'); await tick(); assert.equal(n, 1);
  release(); await tick(); await tick();
  assert.deepEqual(t.posted.map(([m]) => m.id).sort(), ['a', 'b']);
});

test('transient failure => REFRESH_FAILED to the frame (honest unavailable); fatal failure => whole area torn down via onError, nothing sent', async () => {
  const t1 = setup({onRefresh: async () => { throw new RefreshError('NETWORK', false); }});
  ask(t1); await tick();
  assert.deepEqual(t1.posted, [[{channel: HOST, type: 'REFRESH_FAILED', id: 'r1', code: 'NETWORK'}, O]]); assert.deepEqual(t1.calls.errors, []);
  for (const code of ['AUTH_REQUIRED', 'PRIVATE_SOURCE_UNAVAILABLE']) {
    const t = setup({onRefresh: async () => { throw new RefreshError(code, true); }});
    ask(t); await tick(); assert.deepEqual(t.posted, []); assert.deepEqual(t.calls.errors, [code]);
  }
  const t3 = setup({onRefresh: async () => { throw new Error('boom'); }});
  ask(t3); await tick(); assert.deepEqual(t3.calls.errors, ['REFRESH_FAILED']);
  const t4 = setup(); ask(t4); await tick();
  assert.deepEqual(t4.posted, [[{channel: HOST, type: 'REFRESH_FAILED', id: 'r1', code: 'REFRESH_UNSUPPORTED'}, O]]);
});

test('a refresh that settles after dispose or after the frame is gone is dropped (no stale delivery)', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const t = setup({onRefresh: async () => { await gate; return {gen: 2}; }});
  ask(t); t.b.dispose(); release(); await tick();
  assert.equal(t.posted.filter(([m]) => m.type === 'RUNTIME_REFRESH').length, 0); assert.deepEqual(t.calls.refreshed, []);
  let frame = {postMessage: () => assert.fail('must not post')}; let release2; const gate2 = new Promise(r => { release2 = r; });
  const win = fakeTarget(); const b = createFrameBridge({win, origin: O, getFrameWindow: () => frame, getData: () => ({}), onLogout() {}, onError() {}, onRefresh: async () => { await gate2; return {}; }});
  const f0 = frame; win.emit('message', {origin: O, source: f0, data: {channel: FRAME, type: 'REFRESH', id: 'z'}}); frame = null; release2(); await tick(); b.dispose();
});

// ---- parent refresh: session revalidation + fetch (api.ts contract client) ----
const jres = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
test('refreshPrivateRuntime: GET session then GET private, no-store, same-origin; returns the NEW data', async () => {
  const calls = [];
  const f = async (url, init) => { calls.push([url, init?.method ?? 'GET', init?.cache, init?.credentials]);
    return url === '/api/atlas-session' ? jres(200, {configured: true, authenticated: true, expiresAt: '2030-01-01T01:00:00.000Z'}) : jres(200, {contract: 'ATLAS_PRIVATE_V1', data: {marker: 'new'}}); };
  assert.deepEqual(await refreshPrivateRuntime(f), {marker: 'new'});
  assert.deepEqual(calls.map(c => c.slice(0, 2)), [['/api/atlas-session', 'GET'], ['/api/atlas-private', 'GET']]);
  assert.ok(calls.every(c => c[2] === 'no-store' && c[3] === 'same-origin'));
});

test('refreshPrivateRuntime: expired/unconfigured session or 401/503 are FATAL; only a network failure is transient', async () => {
  const run = async f => refreshPrivateRuntime(f).then(() => null, e => e);
  let e = await run(async () => jres(200, {configured: true, authenticated: false}));
  assert.equal(e.code, 'AUTH_REQUIRED'); assert.equal(e.fatal, true);
  e = await run(async () => jres(200, {configured: false, authenticated: false})); assert.equal(e.fatal, true);
  e = await run(async url => (url === '/api/atlas-session' ? jres(200, {configured: true, authenticated: true, expiresAt: '2030-01-01T01:00:00.000Z'}) : jres(401, {error: 'AUTH_REQUIRED'})));
  assert.equal(e.code, 'AUTH_REQUIRED'); assert.equal(e.fatal, true);
  e = await run(async url => (url === '/api/atlas-session' ? jres(200, {configured: true, authenticated: true, expiresAt: '2030-01-01T01:00:00.000Z'}) : jres(503, {error: 'PRIVATE_SOURCE_UNAVAILABLE'})));
  assert.equal(e.code, 'PRIVATE_SOURCE_UNAVAILABLE'); assert.equal(e.fatal, true);
  e = await run(async url => (url === '/api/atlas-session' ? jres(200, {configured: true, authenticated: true, expiresAt: '2030-01-01T01:00:00.000Z'}) : jres(200, {contract: 'ATLAS_PUBLIC_V1', data: {}})));
  assert.equal(e.code, 'CONTRACT'); assert.equal(e.fatal, true);
  e = await run(async () => { throw new TypeError('offline'); }); assert.equal(e.code, 'NETWORK'); assert.equal(e.fatal, false);
});

// ---- frame broker ----
const manual = () => { const q = []; return {set: (fn, ms) => { const h = {fn, ms}; q.push(h); return h; }, clear: h => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); }, q}; };
test('broker: posts REFRESH once (single-flight), resolves only on the matching settle, ignores other ids', async () => {
  const sent = []; const timers = manual();
  const br = createRefreshBroker({post: m => (sent.push(m), true), timers});
  const p1 = br.request(), p2 = br.request();
  assert.equal(sent.length, 1); assert.equal(sent[0].type, 'REFRESH'); const id = sent[0].id;
  assert.equal(br.has(id), true); br.settle('other', {ok: true}); assert.equal(br.has(id), true);
  br.settle(id, {ok: true}); await Promise.all([p1, p2]); assert.equal(br.has(id), false);
  br.request(); assert.equal(sent.length, 2, 'a new request after settle is a new one');
  assert.notEqual(sent[1].id, id);
});

test('broker: failure/timeout/no parent => honest UNAVAILABLE rejection (never a silent success); abort rejects only that caller', async () => {
  const timers = manual(); const sent = [];
  const br = createRefreshBroker({post: m => (sent.push(m), true), timers, timeoutMs: 1234});
  const p = br.request(); assert.equal(timers.q[0].ms, 1234);
  timers.q[0].fn(); await assert.rejects(p, e => e.name === 'DataSourceError' && e.code === 'UNAVAILABLE' && /TIMEOUT/.test(e.message));
  const q = br.request(); br.settle(sent[1].id, {ok: false, code: 'NETWORK'}); await assert.rejects(q, /NETWORK/);
  const orphan = createRefreshBroker({post: () => false, timers}); await assert.rejects(orphan.request(), /sem área privada/);
  const ac = new AbortController(); const keep = br.request(); const dropped = br.request(ac.signal); ac.abort();
  await assert.rejects(dropped, {name: 'AbortError'}); br.settle(sent[2].id, {ok: true}); await keep;
  const pre = new AbortController(); pre.abort(); await assert.rejects(br.request(pre.signal), {name: 'AbortError'});
  const f = br.request(); br.failAll('CLOSED'); await assert.rejects(f, /CLOSED/);
});

// ---- atomic swap ----
const holderWith = (rt) => { const h = createRuntimeHolder(); h.set(validateRuntime(rt).runtime); return h; };
test('applyRefresh: valid newer generation replaces the holder in one step; changed fingerprint is reported', () => {
  const h = holderWith(makeRuntime()); const g0 = h.generation();
  const next = makeRuntime({generated_at: '2099-01-01T00:00:00Z'}, FP2);
  const r = applyRefresh(h, next);
  assert.equal(r.kind, 'accepted'); assert.equal(r.changed, true);
  assert.equal(h.get().fingerprint, FP2); assert.ok(h.generation() > g0); assert.equal(h.get(), r.runtime);
  const same = applyRefresh(h, makeRuntime({generated_at: '2099-02-01T00:00:00Z'}, FP2));
  assert.equal(same.kind, 'accepted'); assert.equal(same.changed, false);
});

test('applyRefresh: invalid/inconsistent data never replaces the holder; an older generation is stale (kept)', () => {
  const rt = makeRuntime(); const h = holderWith(rt); const before = h.get();
  const bad = applyRefresh(h, makeRuntime({access: 'PUBLIC'})); assert.deepEqual(bad, {kind: 'invalid', code: 'ACCESS'});
  assert.equal(applyRefresh(h, {...makeRuntime({}, FP2), fingerprint: FP}).kind, 'invalid');
  assert.equal(applyRefresh(h, null).kind, 'invalid');
  assert.equal(h.get(), before, 'holder untouched on invalid');
  const stale = applyRefresh(h, makeRuntime({generated_at: '2000-01-01T00:00:00Z'}, FP2)); assert.deepEqual(stale, {kind: 'stale'});
  assert.equal(h.get(), before);
  // first load into an empty holder
  const empty = createRuntimeHolder(); assert.equal(applyRefresh(empty, makeRuntime()).kind, 'accepted'); assert.ok(empty.get());
});

test('parent refuses older source generation before overwriting latest frame data',async()=>{
 const fetcher=async url=>url==='/api/atlas-session'?jres(200,{configured:true,authenticated:true,expiresAt:'2030-01-01T01:00:00.000Z'}):jres(200,{contract:'ATLAS_PRIVATE_V1',data:{generated_at:'2029-01-01T00:00:00.000Z'}});
 await assert.rejects(refreshPrivateRuntime(fetcher,{generated_at:'2030-01-01T00:00:00.000Z'}),e=>e.code==='STALE_GENERATION'&&e.fatal===false);
});

test('refresh refuses session expiry before read and expiry during read',async()=>{
 let time=0,reads=0;
 const f=async url=>{if(url==='/api/atlas-session')return jres(200,{configured:true,authenticated:true,expiresAt:'2030-01-01T00:00:00.000Z'});reads++;time=Date.parse('2030-01-01T00:00:00.000Z');return jres(200,{contract:'ATLAS_PRIVATE_V1',data:{}});};
 const expired=()=>Date.parse('2030-01-01T00:00:00.000Z');
 await assert.rejects(refreshPrivateRuntime(f,undefined,expired),e=>e.code==='AUTH_REQUIRED'&&e.fatal);assert.equal(reads,0);
 await assert.rejects(refreshPrivateRuntime(f,undefined,()=>time),e=>e.code==='AUTH_REQUIRED'&&e.fatal);assert.equal(reads,1);
});
