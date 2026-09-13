import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { classifyGoogleSession, isAllowedOrigin, verifyGoogleIdToken, decodeJwtUnsafe, PRODUCTION_PAGES_ORIGIN } from '../lib/auth.mjs';

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, jwk: { ...jwk, kid: 'test-kid-1' } };
}

function signJwt(privateKey, kid, payload) {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const encodedHeader = base64Url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64Url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

test('classifyGoogleSession: absent claims -> 401 TOKEN_ABSENT', () => {
  assert.deepEqual(classifyGoogleSession(null, 'aud-1', ['a@b.com']), { status: 401, reason: 'TOKEN_ABSENT' });
});

test('classifyGoogleSession: valid identity outside allowlist -> 403, not 401', () => {
  const claims = { iss: 'accounts.google.com', aud: 'aud-1', exp: 9999999999, email: 'stranger@example.com', email_verified: true };
  assert.deepEqual(classifyGoogleSession(claims, 'aud-1', ['a@b.com']), { status: 403, reason: 'NOT_IN_ALLOWLIST' });
});

test('isAllowedOrigin accepts only the exact configured origins', () => {
  assert.equal(isAllowedOrigin(PRODUCTION_PAGES_ORIGIN, [PRODUCTION_PAGES_ORIGIN]), true);
  assert.equal(isAllowedOrigin('https://evil.example', [PRODUCTION_PAGES_ORIGIN]), false);
});

test('decodeJwtUnsafe rejects a malformed token (not three dot-separated parts)', () => {
  assert.throws(() => decodeJwtUnsafe('not-a-jwt'), /MALFORMED_JWT/);
});

test('verifyGoogleIdToken: a real RS256-signed token with a matching JWKS key verifies successfully', async () => {
  const { privateKey, jwk } = makeKeyPair();
  const payload = { iss: 'accounts.google.com', aud: 'my-client-id', exp: 9999999999, email: 'a@b.com', email_verified: true };
  const token = signJwt(privateKey, jwk.kid, payload);
  const verified = await verifyGoogleIdToken(token, { fetchJwks: async () => ({ keys: [jwk] }) });
  assert.deepEqual(verified, payload);
});

test('verifyGoogleIdToken: a token signed with a DIFFERENT private key (spoofed) fails verification', async () => {
  const { jwk } = makeKeyPair(); // the "real" published key
  const { privateKey: attackerKey } = makeKeyPair(); // attacker's own key, same kid claimed
  const payload = { iss: 'accounts.google.com', aud: 'my-client-id', exp: 9999999999, email: 'attacker@evil.com', email_verified: true };
  const forgedToken = signJwt(attackerKey, jwk.kid, payload);
  await assert.rejects(() => verifyGoogleIdToken(forgedToken, { fetchJwks: async () => ({ keys: [jwk] }) }), /INVALID_SIGNATURE/);
});

test('verifyGoogleIdToken: an unknown kid (key not in the fetched JWKS) is rejected', async () => {
  const { privateKey, jwk } = makeKeyPair();
  const payload = { iss: 'accounts.google.com', aud: 'my-client-id', exp: 9999999999, email: 'a@b.com', email_verified: true };
  const token = signJwt(privateKey, 'some-other-kid', payload);
  await assert.rejects(() => verifyGoogleIdToken(token, { fetchJwks: async () => ({ keys: [jwk] }) }), /UNKNOWN_KID/);
});

test('verifyGoogleIdToken: a tampered payload (claims edited after signing) fails verification', async () => {
  const { privateKey, jwk } = makeKeyPair();
  const payload = { iss: 'accounts.google.com', aud: 'my-client-id', exp: 9999999999, email: 'a@b.com', email_verified: true };
  const token = signJwt(privateKey, jwk.kid, payload);
  const [h, p, s] = token.split('.');
  const tamperedPayload = base64Url(Buffer.from(JSON.stringify({ ...payload, email: 'admin@evil.com' })));
  const tampered = `${h}.${tamperedPayload}.${s}`;
  await assert.rejects(() => verifyGoogleIdToken(tampered, { fetchJwks: async () => ({ keys: [jwk] }) }), /INVALID_SIGNATURE/);
});

test('verifyGoogleIdToken: an unsupported algorithm (alg none / HS256) is rejected before any key lookup', async () => {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })));
  const payload = base64Url(Buffer.from(JSON.stringify({ iss: 'accounts.google.com' })));
  const token = `${header}.${payload}.`;
  await assert.rejects(() => verifyGoogleIdToken(token, { fetchJwks: async () => ({ keys: [] }) }), /UNSUPPORTED_ALG/);
});

test('end-to-end: a real verified token that is expired is still rejected by classifyGoogleSession', async () => {
  const { privateKey, jwk } = makeKeyPair();
  const payload = { iss: 'accounts.google.com', aud: 'my-client-id', exp: 1, email: 'a@b.com', email_verified: true };
  const token = signJwt(privateKey, jwk.kid, payload);
  const verified = await verifyGoogleIdToken(token, { fetchJwks: async () => ({ keys: [jwk] }) });
  const outcome = classifyGoogleSession(verified, 'my-client-id', ['a@b.com'], 1000);
  assert.deepEqual(outcome, { status: 401, reason: 'EXPIRED' });
});
