import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrivateSession, createSessionBarrier, createSerializer} from '../src/atlas/privateSession.ts';
import {createFrameBridge} from '../src/atlas/privateFrameBridge.ts';
import {FRAME} from '../src/atlas/frameProtocol.ts';

const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const tick = () => new Promise(r => setImmediate(r));
function controller({now = () => Date.now()} = {}) {
  const source = deferred(), timers = new Set(), calls = [];
  const expiresAt = new Date(now() + 60_000).toISOString();
  const ctl = createPrivateSession({now, barrier: createSessionBarrier(), serial: createSerializer(),
    timer: {set: fn => {timers.add(fn); return fn;}, clear: fn => timers.delete(fn)},
    fetch: async (url, init = {}) => {
      calls.push([url, init.method]);
      if (url === '/api/atlas-private') return source.promise;
      if (init.method === 'POST') return Response.json({authenticated: true, expiresAt});
      return Response.json({configured: true, authenticated: false});
    },
  });
  return {ctl, source, calls, timers, expiresAt};
}

test('guarded UI may load after successful PIN while runtime is pending, never before', async () => {
  const {ctl, source, calls, expiresAt} = controller();
  ctl.start(); await tick();
  assert.equal(ctl.getSnapshot().phase, 'signedOut');
  assert.equal(calls.some(([url]) => url === '/api/atlas-private'), false);
  const login = ctl.login('synthetic-test-passcode'); await tick();
  assert.equal(ctl.getSnapshot().phase, 'authenticated');
  assert.equal(ctl.getSnapshot().data, null);
  assert.equal(ctl.getSnapshot().expiresAt, expiresAt);
  source.resolve(Response.json({contract: 'ATLAS_PRIVATE_V1', data: {synthetic: 'private'}}));
  await login;
  assert.deepEqual(ctl.getSnapshot().data, {synthetic: 'private'});
  ctl.dispose();
});

test('logout, expiry and disposal during loading discard late private data', async () => {
  for (const end of ['logout', 'expiry', 'dispose']) {
    const {ctl, source, timers} = controller();
    const login = ctl.login('synthetic-test-passcode'); await tick();
    assert.equal(ctl.getSnapshot().phase, 'authenticated');
    if (end === 'logout') await ctl.logout();
    if (end === 'expiry') for (const fn of [...timers]) fn();
    if (end === 'dispose') ctl.dispose();
    source.resolve(Response.json({contract: 'ATLAS_PRIVATE_V1', data: {late: true}})); await login;
    assert.equal(ctl.getSnapshot().data, null, end);
    assert.notEqual(ctl.getSnapshot().phase, 'authenticated', end);
    ctl.dispose();
  }
});

test('source failure tears down the early loading frame and clears expiry timer', async () => {
  const {ctl, source, timers} = controller();
  const login = ctl.login('synthetic-test-passcode'); await tick();
  source.resolve(Response.json({error: 'PRIVATE_SOURCE_UNAVAILABLE'}, {status: 503})); await login;
  assert.equal(ctl.getSnapshot().phase, 'signedOut');
  assert.equal(ctl.getSnapshot().notice, 'source_unavailable');
  assert.equal(ctl.getSnapshot().expiresAt, null);
  assert.equal(timers.size, 0);
  ctl.dispose();
});

test('frame and runtime can arrive in either order; origin/source and teardown remain enforced', () => {
  for (const order of ['frame-first', 'data-first']) {
    let listener, data = null, ready = 0; const sent = [];
    const frame = {postMessage: (body, origin) => sent.push({body, origin})};
    const bridge = createFrameBridge({win: {addEventListener: (_, fn) => {listener = fn;}, removeEventListener: () => {}},
      origin: 'https://private.example', getFrameWindow: () => frame, getData: () => data, getLocale: () => 'pt-BR',
      onReady: () => ready++, onLogout() {}, onError() {},
    });
    const event = {origin: 'https://private.example', source: frame, data: {channel: FRAME, type: 'READY'}};
    listener({...event, origin: 'https://other.example'});
    listener({...event, source: {}});
    assert.equal(ready, 0);
    if (order === 'frame-first') {listener(event); assert.equal(sent.length, 0);}
    data = {private: 'synthetic'}; bridge.notifyData();
    if (order === 'data-first') {assert.equal(sent.length, 0); listener(event);}
    assert.deepEqual(sent.map(x => x.body.type), ['LOCALE', 'RUNTIME']);
    assert.equal(sent[1].body.data, data);
    assert.ok(sent.every(x => x.origin === 'https://private.example'));
    bridge.dispose();
    assert.equal(bridge.notifyData(), false);
    assert.equal(sent.at(-1).body.type, 'TEARDOWN');
  }
});

test('startup omits retired cockpit and public generic preamble removed without removing limits', () => {
  const host = readFileSync('src/private-legacy/Host.tsx', 'utf8');
  assert.doesNotMatch(host, /LegacyApp/);
  assert.doesNotMatch(host, /import App from|import \{NexoStoreProvider\}/);
  const view = readFileSync('src/atlas/ui/PublicQuestionView.tsx', 'utf8');
  assert.doesNotMatch(view, /Cada resultado vale|Each result applies/);
  assert.match(view, /pick\(brief\.limits, locale\)/);
});
