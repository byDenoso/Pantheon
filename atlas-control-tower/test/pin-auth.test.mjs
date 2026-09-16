import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinSession, parseCookies, pinSessionCookie, verifyAccessPin, verifyPinSession } from '../lib/pin-auth.mjs';

function withPin(pin, run) {
  const previous = process.env.NEXO_ACCESS_PIN;
  process.env.NEXO_ACCESS_PIN = pin;
  try { return run(); }
  finally {
    if (previous === undefined) delete process.env.NEXO_ACCESS_PIN;
    else process.env.NEXO_ACCESS_PIN = previous;
  }
}

test('PIN verification fails closed when server configuration is absent', () => {
  const previous = process.env.NEXO_ACCESS_PIN;
  delete process.env.NEXO_ACCESS_PIN;
  try { assert.deepEqual(verifyAccessPin('1234'), { ok: false, reason: 'PIN_AUTH_NOT_CONFIGURED' }); }
  finally { if (previous !== undefined) process.env.NEXO_ACCESS_PIN = previous; }
});

test('PIN verification accepts only the configured server-side value', () => withPin('4826', () => {
  assert.equal(verifyAccessPin('4826').ok, true);
  assert.deepEqual(verifyAccessPin('4827'), { ok: false, reason: 'INVALID_PIN' });
  assert.deepEqual(verifyAccessPin('nope'), { ok: false, reason: 'INVALID_PIN' });
}));

test('signed PIN session validates, expires, and rejects tampering', () => withPin('4826', () => {
  const token = createPinSession(10_000);
  assert.equal(verifyPinSession(token, 10_001).ok, true);
  assert.equal(verifyPinSession(token, 10_000 + 12 * 60 * 60 + 1).reason, 'SESSION_EXPIRED');
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyPinSession(tampered, 10_001).reason, 'INVALID_SESSION');
}));

test('session cookie is HttpOnly and parseable without exposing the PIN', () => withPin('4826', () => {
  const token = createPinSession(10_000);
  const cookie = pinSessionCookie(token);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(cookie.includes('4826'), false);
  assert.equal(parseCookies(cookie).nexo_atlas_session, token);
}));
