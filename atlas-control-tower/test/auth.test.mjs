import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAuthGateState,
  isPrivateRouteAccessible,
  classifyGoogleSession,
  isAllowedOrigin,
  PRODUCTION_PAGES_ORIGIN
} from '../src/core/auth.ts';

test('with no Google client id configured, the gate is AUTH_SETUP_REQUIRED regardless of session', () => {
  assert.equal(resolveAuthGateState(null, Date.now(), ''), 'AUTH_SETUP_REQUIRED');
  assert.equal(resolveAuthGateState({ email: 'a@b.com', expiresAt: Date.now() + 100000 }, Date.now(), ''), 'AUTH_SETUP_REQUIRED');
});

test('with a client id configured and no session, the gate is SIGNED_OUT, never SIGNED_IN', () => {
  assert.equal(resolveAuthGateState(null, Date.now(), 'client-123'), 'SIGNED_OUT');
});

test('an expired session is EXPIRED, not SIGNED_IN', () => {
  const state = resolveAuthGateState({ email: 'a@b.com', expiresAt: Date.now() - 1000 }, Date.now(), 'client-123');
  assert.equal(state, 'EXPIRED');
});

test('a real, unexpired session with a configured client id is SIGNED_IN', () => {
  const state = resolveAuthGateState({ email: 'a@b.com', expiresAt: Date.now() + 100000 }, Date.now(), 'client-123');
  assert.equal(state, 'SIGNED_IN');
});

test('isPrivateRouteAccessible is true only for SIGNED_IN', () => {
  assert.equal(isPrivateRouteAccessible({ email: 'a@b.com', expiresAt: Date.now() + 100000 }, Date.now(), 'client-123'), true);
  assert.equal(isPrivateRouteAccessible(null, Date.now(), 'client-123'), false);
  assert.equal(isPrivateRouteAccessible(null, Date.now(), ''), false);
});

test('classifyGoogleSession: absent claims -> 401 TOKEN_ABSENT', () => {
  assert.deepEqual(classifyGoogleSession(null, 'aud-1', ['a@b.com']), { status: 401, reason: 'TOKEN_ABSENT' });
});

test('classifyGoogleSession: wrong issuer -> 401', () => {
  const claims = { iss: 'evil.example', aud: 'aud-1', exp: 9999999999, email: 'a@b.com', email_verified: true };
  assert.equal(classifyGoogleSession(claims, 'aud-1', ['a@b.com']).status, 401);
});

test('classifyGoogleSession: wrong audience -> 401', () => {
  const claims = { iss: 'accounts.google.com', aud: 'someone-elses-app', exp: 9999999999, email: 'a@b.com', email_verified: true };
  assert.equal(classifyGoogleSession(claims, 'aud-1', ['a@b.com']).status, 401);
});

test('classifyGoogleSession: expired token -> 401', () => {
  const claims = { iss: 'accounts.google.com', aud: 'aud-1', exp: 1, email: 'a@b.com', email_verified: true };
  assert.equal(classifyGoogleSession(claims, 'aud-1', ['a@b.com'], 1000).status, 401);
});

test('classifyGoogleSession: unverified email -> 401', () => {
  const claims = { iss: 'accounts.google.com', aud: 'aud-1', exp: 9999999999, email: 'a@b.com', email_verified: false };
  assert.equal(classifyGoogleSession(claims, 'aud-1', ['a@b.com']).status, 401);
});

test('classifyGoogleSession: valid identity outside the allowlist -> 403, not 401', () => {
  const claims = { iss: 'accounts.google.com', aud: 'aud-1', exp: 9999999999, email: 'stranger@example.com', email_verified: true };
  assert.deepEqual(classifyGoogleSession(claims, 'aud-1', ['a@b.com']), { status: 403, reason: 'NOT_IN_ALLOWLIST' });
});

test('classifyGoogleSession: valid identity inside the allowlist -> 200, case-insensitive', () => {
  const claims = { iss: 'accounts.google.com', aud: 'aud-1', exp: 9999999999, email: 'A@B.com', email_verified: true };
  assert.deepEqual(classifyGoogleSession(claims, 'aud-1', ['a@b.com']), { status: 200, reason: 'OK' });
});

test('isAllowedOrigin: only the production Pages origin and explicit dev origins pass', () => {
  const allowed = [PRODUCTION_PAGES_ORIGIN, 'http://localhost:4173'];
  assert.equal(isAllowedOrigin(PRODUCTION_PAGES_ORIGIN, allowed), true);
  assert.equal(isAllowedOrigin('http://localhost:4173', allowed), true);
  assert.equal(isAllowedOrigin('https://evil.example', allowed), false);
  assert.equal(isAllowedOrigin(null, allowed), false);
  assert.equal(isAllowedOrigin(undefined, allowed), false);
});
