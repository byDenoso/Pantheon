import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError, fetchLocale, fetchPrivate, fetchPublic, fetchSession, isIsoTime, isObj, login, logoutStrict} from '../src/atlas/api.ts';
import {json, raw, SYN_DATA} from './helpers/atlas-mock.mjs';

const once = res => async () => res;

test('isObj rejects arrays, null and primitives', () => {
  assert.equal(isObj({}), true);
  for (const v of [[], null, 'x', 1, undefined]) assert.equal(isObj(v), false);
});

test('isIsoTime validates real timestamps only', () => {
  assert.equal(isIsoTime('2030-01-01T00:00:00Z'), true);
  assert.equal(isIsoTime('2030-01-01T00:00:00.123+02:00'), true);
  for (const v of ['', 'soon', '2030-13-45T99:99:99Z', 1, null, `2030-01-01T00:00:00Z${'x'.repeat(40)}`, '2030-01-01']) assert.equal(isIsoTime(v), false, String(v));
});

test('logoutStrict: only 200 + JSON + {authenticated:false} confirms revocation', async () => {
  assert.deepEqual(await logoutStrict(once(json({authenticated: false}))), {revoked: true});
  assert.deepEqual(await logoutStrict(once(json({authenticated: false}, 200, 'Application/JSON'))), {revoked: true});
});

test('logoutStrict: request is DELETE, same-origin, no-store, no redirect, keepalive', async () => {
  let seen;
  await logoutStrict(async (url, init) => { seen = {url, init}; return json({authenticated: false}); });
  assert.equal(seen.url, '/api/atlas-session');
  assert.equal(seen.init.method, 'DELETE');
  assert.equal(seen.init.credentials, 'same-origin');
  assert.equal(seen.init.cache, 'no-store');
  assert.equal(seen.init.redirect, 'error');
  assert.equal(seen.init.keepalive, true);
});

test('logoutStrict: everything else is NOT confirmed', async () => {
  const cases = {
    '204': json(undefined, 204),
    '201 json': json({authenticated: false}, 201),
    '202 json': json({authenticated: false}, 202),
    'html fallback': raw('<html>spa</html>', 200, 'text/html'),
    'text/plain': raw('{"authenticated":false}', 200, 'text/plain'),
    'invalid json': raw('{oops', 200, 'application/json'),
    'array body': json([{authenticated: false}]),
    'authenticated true': json({authenticated: true}),
    'missing field': json({}),
    'string false': json({authenticated: 'false'}),
    'redirected': json({authenticated: false}, 200, 'application/json', {redirected: true}),
    'opaque': json({authenticated: false}, 200, 'application/json', {type: 'opaque'}),
    '500': json({error: 'X'}, 500),
  };
  for (const [name, res] of Object.entries(cases)) {
    const r = await logoutStrict(async () => res);
    assert.equal(r.revoked, false, name);
    assert.equal(r.reason, 'CONTRACT', name);
  }
});

test('logoutStrict: 503 AUTH_UNAVAILABLE, ORIGIN_NOT_ALLOWED and network errors are mapped', async () => {
  assert.deepEqual(await logoutStrict(once(json({error: 'AUTH_UNAVAILABLE'}, 503))), {revoked: false, reason: 'AUTH_UNAVAILABLE', status: 503});
  assert.equal((await logoutStrict(once(json({error: 'ORIGIN_NOT_ALLOWED'}, 403)))).reason, 'ORIGIN_NOT_ALLOWED');
  assert.deepEqual(await logoutStrict(async () => { throw new TypeError('x'); }), {revoked: false, reason: 'NETWORK', status: 0});
});

test('login validates input length and response shape', async () => {
  await assert.rejects(login(once(json({})), 'short'), e => e.code === 'CONTRACT');
  await assert.rejects(login(once(json({})), 'x'.repeat(129)), e => e.code === 'CONTRACT');
  const ok = await login(once(json({authenticated: true, expiresAt: '2030-01-01T00:00:00Z'})), 'synthetic-code-1');
  assert.equal(ok.authenticated, true);
  for (const body of [{authenticated: true}, {authenticated: true, expiresAt: 'later'}, {authenticated: false, expiresAt: '2030-01-01T00:00:00Z'}, []]) {
    await assert.rejects(login(once(json(body)), 'synthetic-code-1'), e => e.code === 'CONTRACT');
  }
});

test('login sends the code only in the JSON body, never in the URL', async () => {
  let seen;
  await login(async (url, init) => { seen = {url, init}; return json({authenticated: true, expiresAt: '2030-01-01T00:00:00Z'}); }, 'synthetic-code-2');
  assert.equal(seen.url, '/api/atlas-session');
  assert.equal(seen.url.includes('synthetic'), false);
  assert.equal(JSON.parse(seen.init.body).pin, 'synthetic-code-2');
});

test('error codes and retryAfter are parsed from the documented set only', async () => {
  const codes = ['AUTH_REQUIRED', 'AUTH_NOT_CONFIGURED', 'AUTH_UNAVAILABLE', 'ORIGIN_NOT_ALLOWED', 'PRIVATE_SOURCE_UNAVAILABLE'];
  for (const c of codes) await assert.rejects(fetchPrivate(once(json({error: c}, 401))), e => e instanceof ApiError && e.code === c);
  await assert.rejects(fetchPrivate(once(json({error: 'RATE_LIMITED', retryAfter: 900}, 429))), e => e.code === 'RATE_LIMITED' && e.retryAfter === 900);
  await assert.rejects(fetchPrivate(once(json({error: 'SOMETHING_ELSE'}, 500))), e => e.code === 'CONTRACT');
});

test('private payload requires contract id and non-array object data', async () => {
  const ok = await fetchPrivate(once(json({contract: 'ATLAS_PRIVATE_V1', data: SYN_DATA})));
  assert.deepEqual(ok.data, SYN_DATA);
  for (const body of [{contract: 'ATLAS_PRIVATE_V1', data: []}, {contract: 'OTHER', data: {}}, {data: {}}, {contract: 'ATLAS_PRIVATE_V1'}]) {
    await assert.rejects(fetchPrivate(once(json(body))), e => e.code === 'CONTRACT');
  }
});

test('static hosting (HTML/404 for /api) is NOT_DEPLOYED or CONTRACT, never parsed as data', async () => {
  await assert.rejects(fetchPrivate(once(raw('nf', 404))), e => e.code === 'NOT_DEPLOYED');
  await assert.rejects(fetchPrivate(once(raw('<html/>', 200))), e => e.code === 'CONTRACT');
  await assert.rejects(fetchSession(once(raw('<html/>', 200))), e => e.code === 'CONTRACT');
});

test('public payload is the empty contract by default', async () => {
  const p = await fetchPublic(once(json({contract: 'ATLAS_PUBLIC_V1', items: [], links: []})));
  assert.deepEqual(p.items, []);
  await assert.rejects(fetchPublic(once(json({contract: 'ATLAS_PUBLIC_V1', items: {}, links: []}))), e => e.code === 'CONTRACT');
});

test('locale endpoint: automatic mode omits lang, manual passes it; unknown locales rejected', async () => {
  const urls = [];
  const f = async url => { urls.push(url); return json({contract: 'ATLAS_LOCALE_V1', locale: 'en', source: 'browser', supported: ['pt-BR', 'en']}); };
  const r = await fetchLocale(f, null);
  await fetchLocale(f, 'pt-BR');
  assert.deepEqual(urls, ['/api/atlas-locale', '/api/atlas-locale?lang=pt-BR']);
  assert.deepEqual(r.supported, ['pt-BR', 'en']);
  await assert.rejects(fetchLocale(once(json({contract: 'ATLAS_LOCALE_V1', locale: 'fr', source: 'x', supported: []})), null), e => e.code === 'CONTRACT');
});

test('aborted requests surface ABORTED, not NETWORK', async () => {
  const ac = new AbortController(); ac.abort();
  await assert.rejects(fetchPrivate(async () => { throw Object.assign(new Error('a'), {name: 'AbortError'}); }, ac.signal), e => e.code === 'ABORTED');
});

test('authenticated session status requires authoritative server expiry', async () => {
  const expiresAt = '2030-01-01T00:00:00Z';
  assert.deepEqual(await fetchSession(once(json({configured:true,authenticated:true,expiresAt}))), {configured:true,authenticated:true,expiresAt});
  for(const body of [{configured:true,authenticated:true},{configured:true,authenticated:true,expiresAt:'unknown'},{configured:false,authenticated:true,expiresAt}]) await assert.rejects(fetchSession(once(json(body))), e=>e.code==='CONTRACT');
});

test('locale source and supported list must match the approved contract exactly', async () => {
  const valid = {contract: 'ATLAS_LOCALE_V1', locale: 'en', source: 'browser', supported: ['pt-BR', 'en']};
  for (const source of ['preference', 'browser', 'country', 'default']) {
    assert.equal((await fetchLocale(once(json({...valid, source})), null)).source, source);
  }
  for (const body of [{...valid, source: 'accept-language'}, {...valid, source: ''}, {...valid, source: null},
    {...valid, supported: undefined}, {...valid, supported: []}, {...valid, supported: ['en']},
    {...valid, supported: ['pt-BR', 'en', 'fr']}, {...valid, supported: ['pt-BR', 'pt-BR']}, {...valid, supported: ['en', 'pt-BR']}]) {
    await assert.rejects(fetchLocale(once(json(body)), null), e => e.code === 'CONTRACT');
  }
});
