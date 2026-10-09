import test from 'node:test';
import assert from 'node:assert/strict';
import {requestHumanSession} from '../src/atlas/useHumanSession.ts';
const publicState = {configured: true, authenticated: false, access: 'PUBLIC', mode: 'PUBLIC_READ_ONLY'};
const privateState = {configured: true, authenticated: true, access: 'PRIVATE', mode: 'PRIVATE'};
const response = (value, code = 200) => new Response(JSON.stringify(value), {status: code, headers: {'content-type': 'application/json'}});
test('native session uses only the existing same-origin endpoint for GET, login and logout', async () => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    let call;
    const state = await requestHumanSession(async (path, options) => {call = {path, options}; return response(method === 'POST' ? privateState : publicState);}, method, 'synthetic-code');
    assert.equal(call.path, '/api/session'); assert.equal(call.options.method, method);
    assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
    assert.equal(state.authenticated, method === 'POST');
    if (method === 'POST') assert.deepEqual(JSON.parse(call.options.body), {password: 'synthetic-code'});
    else assert.equal(call.options.body, undefined);
  }
});
test('invalid native access codes never leave the client; mutations are not aborted ambiguously', async () => {
  for (const password of ['short', 'x'.repeat(129)]) {
    let calls = 0;
    await assert.rejects(requestHumanSession(async () => {calls++; return response(privateState);}, 'POST', password), /AUTH_REQUIRED/);
    assert.equal(calls, 0);
  }
  const controller = new AbortController(); let sent;
  await requestHumanSession(async (_, init) => {sent = init; return response(privateState);}, 'POST', 'synthetic-code', controller.signal);
  assert.equal(sent.signal, undefined);
});
test('native auth shape is validated; incomplete, redirected and HTML responses cannot unlock the page', async () => {
  for (const body of [{authenticated: true}, {...privateState, configured: false}, {...privateState, access: 'PUBLIC'}, {...publicState, mode: 'PRIVATE'}, []]) {
    await assert.rejects(requestHumanSession(async () => response(body), 'GET'), /AUTH_UNAVAILABLE/);
  }
  for (const value of [new Response('fallback', {headers: {'content-type': 'text/html'}}),
    new Response(' '.repeat(4097), {headers: {'content-type': 'application/json'}}),
    new Response(new Uint8Array([0xff]), {headers: {'content-type': 'application/json'}})]) {
    await assert.rejects(requestHumanSession(async () => value, 'GET'), /AUTH_UNAVAILABLE/);
  }
  const redirected = response(privateState); Object.defineProperty(redirected, 'redirected', {value: true});
  await assert.rejects(requestHumanSession(async () => redirected, 'GET'), /AUTH_UNAVAILABLE/);
});
test('logout requires authoritative signed-out data and a failed native endpoint never falls back', async () => {
  await assert.rejects(requestHumanSession(async () => response(privateState), 'DELETE'), /AUTH_UNAVAILABLE/);
  await assert.rejects(requestHumanSession(async () => response(publicState), 'POST', 'synthetic-code'), /AUTH_UNAVAILABLE/);
  let calls = 0;
  await assert.rejects(requestHumanSession(async () => {calls++; return response({error: 'AUTH_REQUIRED'}, 401);}, 'POST', 'synthetic-code'), /AUTH_REQUIRED/);
  assert.equal(calls, 1);
});
