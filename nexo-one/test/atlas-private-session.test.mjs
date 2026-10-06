import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateSession, createSerializer, createSessionBarrier} from '../src/atlas/privateSession.ts';
import {defer, fakeChannelPair, fakeRoot, fakeTarget, flush, FUTURE, json, mockFetch, SYN_DATA} from './helpers/atlas-mock.mjs';

const PRIV = {contract: 'ATLAS_PRIVATE_V1', data: SYN_DATA};
const SESS_OK = {configured: true, authenticated: true, expiresAt: FUTURE()};
const SESS_NO = {configured: true, authenticated: false};
const LOGIN_OK = () => ({authenticated: true, expiresAt: FUTURE()});
const OUT = {authenticated: false};

function setup(handlers, extra = {}) {
  const calls = [];
  const fetch = mockFetch(handlers, calls);
  const win = fakeTarget();
  const root = fakeRoot();
  const ctl = createPrivateSession({fetch, win, root, serial: createSerializer(null), barrier: createSessionBarrier(), ...extra});
  return {ctl, calls, win, root, snap: () => ctl.getSnapshot()};
}
const noData = s => assert.equal(s.data, null, 'private data must be null');

test('start: unauthenticated -> signedOut, no private request is made', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO)});
  t.ctl.start(); await flush();
  assert.equal(t.snap().phase, 'signedOut');
  assert.equal(t.calls.some(c => c.url.includes('atlas-private')), false);
});

test('start: authenticated session loads private data', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush();
  assert.equal(t.snap().phase, 'authenticated');
  assert.deepEqual(t.snap().data, SYN_DATA);
});

test('not configured and not deployed are surfaced without data', async () => {
  let t = setup({'GET /api/atlas-session': () => json({configured: false, authenticated: false})});
  t.ctl.start(); await flush();
  assert.equal(t.snap().notice, 'not_configured');
  t = setup({}); t.ctl.start(); await flush();
  assert.equal(t.snap().notice, 'not_deployed'); noData(t.snap());
});

test('login success loads data; wrong code keeps data null and shows notice', async () => {
  const bad = setup({'POST /api/atlas-session': () => json({error: 'AUTH_REQUIRED'}, 401), 'GET /api/atlas-session': () => json(SESS_NO)});
  bad.ctl.start(); await flush();
  await bad.ctl.login('synthetic-code-1');
  assert.equal(bad.snap().notice, 'invalid'); noData(bad.snap());
  const ok = setup({'GET /api/atlas-session': () => json(SESS_NO), 'POST /api/atlas-session': () => json(LOGIN_OK()), 'GET /api/atlas-private': () => json(PRIV)});
  ok.ctl.start(); await flush();
  await ok.ctl.login('synthetic-code-1');
  assert.equal(ok.snap().phase, 'authenticated');
});

test('rate limit carries retryAfter', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO), 'POST /api/atlas-session': () => json({error: 'RATE_LIMITED', retryAfter: 900}, 429)});
  t.ctl.start(); await flush(); await t.ctl.login('synthetic-code-1');
  assert.equal(t.snap().notice, 'rate_limited'); assert.equal(t.snap().retryAfter, 900);
});

test('401 on the private fetch clears state; 503 on the private fetch clears state; no fallback request', async () => {
  for (const [status, err, notice] of [[401, 'AUTH_REQUIRED', 'invalid'], [503, 'PRIVATE_SOURCE_UNAVAILABLE', 'unavailable']]) {
    const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json({error: err}, status)});
    t.ctl.start(); await flush();
    assert.equal(t.snap().phase, 'signedOut'); assert.equal(t.snap().notice, notice); noData(t.snap());
    assert.deepEqual([...new Set(t.calls.map(c => c.url))].sort(), ['/api/atlas-private', '/api/atlas-session']);
  }
});

test('LATE private response after logout is dropped (data never reappears)', async () => {
  const priv = defer();
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => priv.promise, 'DELETE /api/atlas-session': () => json(OUT)});
  t.ctl.start(); await flush();
  await t.ctl.logout();
  priv.resolve(json(PRIV)); await flush();
  assert.equal(t.snap().phase, 'signedOut'); noData(t.snap());
});

test('LATE session response after dispose (route change) is dropped and does not touch state', async () => {
  const sess = defer();
  const t = setup({'GET /api/atlas-session': () => sess.promise, 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush();
  t.ctl.dispose();
  sess.resolve(json(SESS_OK)); await flush();
  noData(t.snap());
  assert.equal(t.calls.some(c => c.url.includes('atlas-private')), false, 'no private request after dispose');
});

test('LATE private response after dispose is dropped', async () => {
  const priv = defer();
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => priv.promise});
  t.ctl.start(); await flush();
  t.ctl.dispose(); priv.resolve(json(PRIV)); await flush();
  noData(t.snap());
});

test('in-flight requests are aborted on dispose and on logout', async () => {
  let signal;
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': (_i, s) => { signal = s; return new Promise(() => {}); }, 'DELETE /api/atlas-session': () => json(OUT)});
  t.ctl.start(); await flush();
  assert.equal(signal.aborted, false);
  await t.ctl.logout();
  assert.equal(signal.aborted, true);
});

test('logout during login: login result dropped; DELETE is serialized AFTER the POST (no stale data, no early DELETE)', async () => {
  const post = defer();
  const order = [];
  const t = setup({
    'GET /api/atlas-session': () => json(SESS_NO),
    'POST /api/atlas-session': () => { order.push('POST'); return post.promise; },
    'DELETE /api/atlas-session': () => { order.push('DELETE'); return json(OUT); },
    'GET /api/atlas-private': () => json(PRIV),
  });
  t.ctl.start(); await flush();
  const lp = t.ctl.login('synthetic-code-1'); await flush();
  const op = t.ctl.logout(); await flush();
  assert.deepEqual(order, ['POST'], 'DELETE must wait for the POST');
  post.resolve(json(LOGIN_OK())); await Promise.all([lp, op]); await flush();
  assert.deepEqual(order, ['POST', 'DELETE']);
  assert.equal(t.snap().phase, 'signedOut'); noData(t.snap());
  assert.equal(t.snap().revocation, 'revoked');
  assert.equal(t.calls.some(c => c.url.includes('atlas-private')), false);
});

test('NO compensating logout: an abandoned login (dispose) never issues DELETE', async () => {
  const post = defer();
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO), 'POST /api/atlas-session': () => post.promise, 'DELETE /api/atlas-session': () => json(OUT)});
  t.ctl.start(); await flush();
  const lp = t.ctl.login('synthetic-code-1'); await flush();
  t.ctl.dispose();
  post.resolve(json(LOGIN_OK())); await lp; await flush();
  assert.equal(t.calls.some(c => c.method === 'DELETE'), false);
});

test('an old logout result cannot overwrite a newer session', async () => {
  const del = defer();
  const t = setup({
    'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV),
    'DELETE /api/atlas-session': () => del.promise, 'POST /api/atlas-session': () => json(LOGIN_OK()),
  });
  t.ctl.start(); await flush();
  const out = t.ctl.logout(); await flush();
  assert.equal(t.snap().revocation, 'pending');
  await t.ctl.login('synthetic-code-1'); // refused while revocation pending
  assert.equal(t.snap().phase, 'signedOut');
  del.resolve(json(OUT)); await out;
  assert.equal(t.snap().revocation, 'revoked'); noData(t.snap());
});

test('logout clears data immediately; unconfirmed revocation is reported, retry works', async () => {
  let n = 0;
  const t = setup({
    'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV),
    'DELETE /api/atlas-session': () => (++n === 1 ? json({error: 'AUTH_UNAVAILABLE'}, 503) : json(OUT)),
  });
  t.ctl.start(); await flush();
  const p = t.ctl.logout();
  noData(t.snap()); assert.equal(t.snap().revocation, 'pending');
  await p;
  assert.equal(t.snap().revocation, 'unconfirmed'); assert.equal(t.snap().revocationReason, 'AUTH_UNAVAILABLE'); noData(t.snap());
  await t.ctl.retryRevocation();
  assert.equal(t.snap().revocation, 'revoked');
});

test('204 / HTML on logout is "unconfirmed", never "revoked"', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => json(undefined, 204)});
  t.ctl.start(); await flush(); await t.ctl.logout();
  assert.equal(t.snap().revocation, 'unconfirmed');
});

test('invariant: data is null in every non-authenticated snapshot (all transitions)', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => json(OUT)});
  const seen = [];
  t.ctl.subscribe(() => seen.push(t.snap()));
  t.ctl.start(); await flush(); await t.ctl.logout(); t.ctl.dispose();
  assert.ok(seen.length > 3);
  for (const s of seen) if (s.phase !== 'authenticated') noData(s);
});

test('pagehide hides + wipes synchronously; pageshow(persisted) revalidates; non-persisted pageshow does nothing', async () => {
  let authed = true;
  const t = setup({'GET /api/atlas-session': () => json({configured: true, authenticated: authed, expiresAt: authed ? FUTURE() : null}), 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush();
  assert.equal(t.snap().phase, 'authenticated');
  t.win.emit('pagehide');
  assert.equal(t.root.get('data-atlas-private'), 'hidden'); noData(t.snap());
  const before = t.calls.length;
  t.win.emit('pageshow', {persisted: false}); await flush();
  assert.equal(t.calls.length, before);
  authed = false;
  t.win.emit('pageshow', {persisted: true}); await flush();
  assert.equal(t.root.get('data-atlas-private'), undefined);
  assert.equal(t.snap().phase, 'signedOut'); noData(t.snap());
  authed = true;
  t.win.emit('pagehide'); t.win.emit('pageshow', {persisted: true}); await flush();
  assert.equal(t.snap().phase, 'authenticated');
});

test('pagehide during an in-flight private fetch: late response is dropped', async () => {
  const priv = defer();
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => priv.promise});
  t.ctl.start(); await flush();
  t.win.emit('pagehide'); priv.resolve(json(PRIV)); await flush();
  noData(t.snap());
});

test('listeners are removed on dispose', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO)});
  t.ctl.start(); assert.equal(t.win.count('pagehide'), 1);
  t.ctl.dispose(); assert.equal(t.win.count('pagehide'), 0); assert.equal(t.win.count('pageshow'), 0);
});

test('session expiry timer wipes private data locally', async () => {
  let fire;
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO), 'POST /api/atlas-session': () => json({authenticated: true, expiresAt: new Date(Date.now() + 5000).toISOString()}), 'GET /api/atlas-private': () => json(PRIV)},
    {timer: {set: (fn) => { fire = fn; return 1; }, clear: () => {}}});
  t.ctl.start(); await flush(); await t.ctl.login('synthetic-code-1');
  assert.equal(t.snap().phase, 'authenticated');
  fire(); noData(t.snap()); assert.equal(t.snap().phase, 'signedOut');
});

test('already-expired expiresAt is never displayed as authenticated', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_NO), 'POST /api/atlas-session': () => json({authenticated: true, expiresAt: '2001-01-01T00:00:00Z'}), 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush(); await t.ctl.login('synthetic-code-1');
  assert.equal(t.snap().phase, 'signedOut'); noData(t.snap());
});

test('cross-tab: wipe message clears this tab immediately; sync message revalidates', async () => {
  const [a, b] = fakeChannelPair();
  let authed = true;
  const mk = ch => setup({'GET /api/atlas-session': () => json({configured: true, authenticated: authed, expiresAt: authed ? FUTURE() : null}), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => { authed = false; return json(OUT); }}, {channel: ch});
  const t1 = mk(a), t2 = mk(b);
  t1.ctl.start(); t2.ctl.start(); await flush();
  assert.equal(t2.snap().phase, 'authenticated');
  await t1.ctl.logout(); await flush();
  assert.equal(t2.snap().phase, 'signedOut'); noData(t2.snap());
});

test('serializer runs mutations strictly one at a time, even after a rejection', async () => {
  const s = createSerializer(null); const log = [];
  const d = defer();
  const p1 = s(async () => { log.push('a-start'); await d.promise; log.push('a-end'); throw new Error('x'); }).catch(() => {});
  const p2 = s(async () => { log.push('b'); });
  await flush(); assert.deepEqual(log, ['a-start']);
  d.resolve(); await Promise.all([p1, p2]);
  assert.deepEqual(log, ['a-start', 'a-end', 'b']);
});

test('failed cross-tab logout keeps both tabs wiped, including later sync and bfcache restore', async () => {
  const [a, b] = fakeChannelPair();
  const handlers = {'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => json({error: 'AUTH_UNAVAILABLE'}, 503)};
  const first = setup(handlers, {channel: a}), second = setup(handlers, {channel: b});
  first.ctl.start(); second.ctl.start(); await flush();
  await first.ctl.logout(); await flush();
  for (const t of [first, second]) {
    assert.equal(t.snap().phase, 'signedOut'); noData(t.snap());
    assert.equal(t.snap().revocation, 'unconfirmed');
    t.win.emit('pagehide'); t.win.emit('pageshow', {persisted: true});
  }
  a.postMessage({t: 'sync'}); await flush();
  noData(first.snap()); noData(second.snap());
  first.ctl.dispose(); second.ctl.dispose();
});

test('bfcache or sync while DELETE is pending cannot re-display private data after successful logout', async () => {
  const d = defer(); const [a, b] = fakeChannelPair();
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => d.promise}, {channel: b});
  t.ctl.start(); await flush(); const before = t.calls.length;
  const out = t.ctl.logout(); await flush();
  t.win.emit('pagehide'); t.win.emit('pageshow', {persisted: true}); a.postMessage({t: 'sync'}); await flush();
  noData(t.snap()); assert.equal(t.snap().revocation, 'pending');
  assert.equal(t.calls.slice(before).filter(c => c.method === 'GET').length, 0);
  d.resolve(json(OUT)); await out; await flush();
  noData(t.snap()); assert.equal(t.snap().phase, 'signedOut'); assert.equal(t.snap().revocation, 'revoked');
  t.ctl.dispose();
});

test('sign-out barrier survives route remount and receives pending revocation completion', async () => {
  const barrier = createSessionBarrier(), serial = createSerializer(null), d = defer();
  const handlers = {'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => d.promise};
  const first = setup(handlers, {barrier, serial}); first.ctl.start(); await flush();
  const out = first.ctl.logout(); await flush(); first.ctl.dispose();
  const second = setup(handlers, {barrier, serial}); second.ctl.start(); await flush();
  noData(second.snap()); assert.equal(second.snap().revocation, 'pending'); assert.equal(second.calls.length, 0);
  d.resolve(json({error: 'AUTH_UNAVAILABLE'}, 503)); await out; await flush();
  assert.equal(second.snap().revocation, 'unconfirmed'); noData(second.snap());
  second.ctl.dispose();
});

test('logout outcome still reaches peer after initiating private route unmounts', async () => {
  const [a, b] = fakeChannelPair(), d = defer();
  const handlers = {'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => d.promise};
  const first = setup(handlers, {channel: a}), second = setup(handlers, {channel: b});
  first.ctl.start(); second.ctl.start(); await flush();
  const out = first.ctl.logout(); await flush(); first.ctl.dispose();
  assert.equal(a.closed, false, 'keep revocation channel alive until DELETE completes');
  d.resolve(json(OUT)); await out; await flush();
  assert.equal(second.snap().revocation, 'revoked'); noData(second.snap()); assert.equal(a.closed, true);
  second.ctl.dispose();
});

test('fresh explicit sign-in releases failed-logout barrier', async () => {
  const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => json({error: 'AUTH_UNAVAILABLE'}, 503), 'POST /api/atlas-session': () => json(LOGIN_OK())});
  t.ctl.start(); await flush(); await t.ctl.logout(); await t.ctl.login('synthetic-code-1');
  assert.equal(t.snap().phase, 'authenticated'); assert.deepEqual(t.snap().data, SYN_DATA); t.ctl.dispose();
});

test('cross-tab outcome for an older logout cannot confirm a newer pending logout', async () => {
  const [a, b] = fakeChannelPair(); const t = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV)}, {channel: b});
  t.ctl.start(); await flush();
  a.postMessage({t: 'wipe', operation: 'older'}); a.postMessage({t: 'wipe', operation: 'newer'});
  a.postMessage({t: 'revocation', operation: 'older', revoked: true}); await flush();
  assert.equal(t.snap().revocation, 'pending'); noData(t.snap());
  a.postMessage({t: 'revocation', operation: 'newer', revoked: false, reason: 'NETWORK'}); await flush();
  assert.equal(t.snap().revocation, 'unconfirmed'); t.ctl.dispose();
});

test('restored session uses authoritative expiration, not another hour of local display', async () => {
  const now = Date.now(), expiresAt = new Date(now + 1000).toISOString(); let ms;
  const t = setup({'GET /api/atlas-session': () => json({...SESS_OK, expiresAt}), 'GET /api/atlas-private': () => json(PRIV)}, {now: () => now, timer: {set: (_fn, delay) => { ms = delay; return 1; }, clear: () => {}}});
  t.ctl.start(); await flush(); assert.equal(t.snap().expiresAt, expiresAt); assert.equal(ms, 1000); t.ctl.dispose();
});

test('expired session or private response never publishes an authenticated snapshot', async () => {
  for (const expiresDuringFetch of [false, true]) {
    let now = Date.now(); const expiresAt = new Date(now + (expiresDuringFetch ? 1000 : -1)).toISOString();
    const d = defer(); const t = setup({'GET /api/atlas-session': () => json({...SESS_OK, expiresAt}), 'GET /api/atlas-private': () => d.promise}, {now: () => now});
    const seen = []; t.ctl.subscribe(() => seen.push(t.snap())); t.ctl.start(); await flush();
    now += 2000; d.resolve(json(PRIV)); await flush();
    assert.ok(seen.every(s => s.phase !== 'authenticated')); noData(t.snap()); t.ctl.dispose();
  }
});

test('bfcache DOM stays hidden until session revalidation completes', async () => {
  const d = defer(); let reload = false;
  const t = setup({'GET /api/atlas-session': () => reload ? d.promise : json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush(); reload = true;
  t.win.emit('pagehide'); t.win.emit('pageshow', {persisted: true}); await flush();
  assert.equal(t.root.get('data-atlas-private'), 'hidden'); noData(t.snap());
  d.resolve(json(SESS_NO)); await flush();
  assert.equal(t.root.get('data-atlas-private'), undefined); noData(t.snap()); t.ctl.dispose();
});

test('a second pagehide keeps DOM hidden when an earlier bfcache revalidation settles', async () => {
  const d = defer(); let reload = false;
  const t = setup({'GET /api/atlas-session': () => reload ? d.promise : json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV)});
  t.ctl.start(); await flush(); reload = true;
  t.win.emit('pagehide'); t.win.emit('pageshow', {persisted: true}); await flush();
  t.win.emit('pagehide'); d.resolve(json(SESS_NO)); await flush();
  assert.equal(t.root.get('data-atlas-private'), 'hidden'); noData(t.snap()); t.ctl.dispose();
});

test('route remount clears a hidden DOM marker left by interrupted bfcache revalidation', async () => {
  const root = fakeRoot(), barrier = createSessionBarrier();
  const first = setup({'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV)}, {root, barrier});
  first.ctl.start(); await flush(); first.win.emit('pagehide'); first.ctl.dispose();
  assert.equal(root.get('data-atlas-private'), 'hidden');
  const second = setup({'GET /api/atlas-session': () => json(SESS_NO)}, {root, barrier});
  second.ctl.start(); await flush();
  assert.equal(root.get('data-atlas-private'), undefined); assert.equal(second.snap().phase, 'signedOut'); second.ctl.dispose();
});

test('new explicit login in one tab preserves the other tab’s sign-out choice until its own login', async () => {
  const [a, b] = fakeChannelPair();
  const handlers = {'GET /api/atlas-session': () => json(SESS_OK), 'GET /api/atlas-private': () => json(PRIV), 'DELETE /api/atlas-session': () => json({error: 'AUTH_UNAVAILABLE'}, 503), 'POST /api/atlas-session': () => json(LOGIN_OK())};
  const first = setup(handlers, {channel: a}), second = setup(handlers, {channel: b});
  first.ctl.start(); second.ctl.start(); await flush(); await first.ctl.logout(); await flush();
  await first.ctl.login('synthetic-code-1'); await flush();
  assert.equal(first.snap().phase, 'authenticated'); noData(second.snap()); assert.equal(second.snap().phase, 'signedOut');
  await second.ctl.login('synthetic-code-1'); await flush();
  assert.equal(second.snap().phase, 'authenticated'); first.ctl.dispose(); second.ctl.dispose();
});
