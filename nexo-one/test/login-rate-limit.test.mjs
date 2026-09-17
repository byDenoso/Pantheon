import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {sessionRoute} from '../server/auth/session-route.mjs';
import {clearLoginFailures} from '../server/auth/login-rate-limit.mjs';

const salt='3'.repeat(32);
const password='test-only-pin-value';
const env={
  NEXO_SESSION_SECRET:'test-only-secret-at-least-32-characters',
  NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`
};
const baseNow=Date.parse('2026-09-16T21:00:00Z');
const req=(method,key='198.51.100.20')=>({method,headers:{origin:'https://nexo-one.example',host:'nexo-one.example','x-forwarded-for':key,cookie:''}});

test('fifth failed login locks the key for fifteen minutes',()=>{
  clearLoginFailures('198.51.100.20');
  for(let i=0;i<4;i++) assert.equal(sessionRoute(req('POST'),env,baseNow+i,{password:'wrong'}).status,401);
  assert.equal(sessionRoute(req('POST'),env,baseNow+4,{password:'wrong'}).status,401);
  const locked=sessionRoute(req('POST'),env,baseNow+5,{password});
  assert.equal(locked.status,429);
  assert.equal(locked.body.error,'RATE_LIMITED');
  const afterWindow=sessionRoute(req('POST'),env,baseNow+15*60*1000+10,{password});
  assert.equal(afterWindow.status,200);
});

test('successful login clears accumulated failures',()=>{
  const key='198.51.100.21';
  clearLoginFailures(key);
  for(let i=0;i<4;i++) assert.equal(sessionRoute(req('POST',key),env,baseNow+i,{password:'wrong'}).status,401);
  assert.equal(sessionRoute(req('POST',key),env,baseNow+10,{password}).status,200);
  assert.equal(sessionRoute(req('POST',key),env,baseNow+20,{password:'wrong'}).status,401);
});

test('secure production cookie remains HttpOnly SameSite strict and Secure',()=>{
  const key='198.51.100.22';
  clearLoginFailures(key);
  const login=sessionRoute(req('POST',key),env,baseNow,{password});
  assert.equal(login.status,200);
  assert.match(login.setCookie,/HttpOnly/);
  assert.match(login.setCookie,/SameSite=Strict/);
  assert.match(login.setCookie,/Secure/);
});
