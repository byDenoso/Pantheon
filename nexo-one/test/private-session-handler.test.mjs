import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {sessionRoute} from '../server/auth/session-route.mjs';

const now=Date.parse('2026-09-15T16:30:00Z');
const salt='2'.repeat(32);
const password='test-only-private-password';
const env={
  NEXO_SESSION_SECRET:'test-only-secret-at-least-32-characters',
  NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`
};
const req=(method,{origin='https://nexo-one.vercel.app',host='nexo-one.vercel.app',cookie=''}={})=>({method,headers:{origin,host,cookie}});

test('session route remains public read-only while private auth is not configured',()=>{
  const out=sessionRoute(req('GET'),{},now);
  assert.equal(out.status,200);
  assert.deepEqual(out.body,{configured:false,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'});
  assert.equal(out.setCookie,null);
});

test('session login is same-origin and emits a private HttpOnly session on valid password',()=>{
  const denied=sessionRoute(req('POST',{origin:'https://evil.example'}),env,now,{password});
  assert.equal(denied.status,403);
  assert.equal(denied.body.error,'ORIGIN_NOT_ALLOWED');

  const login=sessionRoute(req('POST'),env,now,{password});
  assert.equal(login.status,200);
  assert.equal(login.body.authenticated,true);
  assert.equal(login.body.access,'PRIVATE');
  assert.equal(login.body.mode,'PRIVATE');
  assert.match(login.setCookie,/^nexo_session=/);
  assert.match(login.setCookie,/HttpOnly; SameSite=Strict/);

  const token=login.setCookie.match(/^nexo_session=([^;]+)/)?.[1];
  const read=sessionRoute(req('GET',{cookie:`nexo_session=${token}`}),env,now);
  assert.deepEqual(read.body,{configured:true,authenticated:true,access:'PRIVATE',mode:'PRIVATE'});
});

test('invalid credentials fail closed and logout clears only same-origin sessions',()=>{
  const invalid=sessionRoute(req('POST'),env,now,{password:'wrong'});
  assert.equal(invalid.status,401);
  assert.equal(invalid.body.error,'AUTH_REQUIRED');
  assert.equal(invalid.setCookie,null);

  const crossOrigin=sessionRoute(req('DELETE',{origin:'https://evil.example'}),env,now);
  assert.equal(crossOrigin.status,403);

  const logout=sessionRoute(req('DELETE'),env,now);
  assert.equal(logout.status,200);
  assert.deepEqual(logout.body,{configured:true,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'});
  assert.match(logout.setCookie,/Max-Age=0/);
});
