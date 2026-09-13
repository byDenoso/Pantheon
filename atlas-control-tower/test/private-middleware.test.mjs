import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { withGoogleAuth } from '../api/private/_middleware.mjs';

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

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      headers[key] = value;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    }
  };
}

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test('OPTIONS preflight short-circuits with 204 and CORS headers, never reaching the handler', async () => {
  let handlerCalled = false;
  const gated = withGoogleAuth(() => {
    handlerCalled = true;
  });
  const req = { method: 'OPTIONS', headers: { origin: 'https://bydenoso.github.io' } };
  const res = mockRes();
  await gated(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(handlerCalled, false);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://bydenoso.github.io');
});

test('a disallowed Origin is rejected with 403 CORS_ORIGIN_NOT_ALLOWED before any auth check', async () => {
  const gated = withGoogleAuth(() => {
    throw new Error('handler should not run');
  });
  const req = { method: 'GET', headers: { origin: 'https://evil.example' } };
  const res = mockRes();
  await gated(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'CORS_ORIGIN_NOT_ALLOWED');
});

test('missing GOOGLE_CLIENT_ID/NEXO_ALLOWED_EMAILS returns 503 AUTH_SETUP_REQUIRED, never a fake session', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: '', NEXO_ALLOWED_EMAILS: '' }, async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.NEXO_ALLOWED_EMAILS;
    let handlerCalled = false;
    const gated = withGoogleAuth(() => {
      handlerCalled = true;
    });
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await gated(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'AUTH_SETUP_REQUIRED');
    assert.deepEqual(res.body.missing.sort(), ['GOOGLE_CLIENT_ID', 'NEXO_ALLOWED_EMAILS']);
    assert.equal(handlerCalled, false);
  });
});

test('with config present but no Authorization header, returns 401 TOKEN_ABSENT', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'client-1', NEXO_ALLOWED_EMAILS: 'a@b.com' }, async () => {
    const gated = withGoogleAuth(() => {
      throw new Error('handler should not run');
    });
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await gated(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.reason, 'TOKEN_ABSENT');
  });
});

test('a well-formed but unverifiable token (unknown kid) returns 401, never runs the handler', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'client-1', NEXO_ALLOWED_EMAILS: 'a@b.com' }, async () => {
    const { privateKey } = makeKeyPair();
    const token = signJwt(privateKey, 'some-kid', { iss: 'accounts.google.com', aud: 'client-1', exp: 9999999999, email: 'a@b.com', email_verified: true });
    let handlerCalled = false;
    const gated = withGoogleAuth(
      () => {
        handlerCalled = true;
      },
      { fetchJwks: async () => ({ keys: [] }) }
    );
    const req = { method: 'GET', headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    await gated(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(handlerCalled, false);
  });
});

test('a validly signed token for an email outside the allowlist returns 403, not 401', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'client-1', NEXO_ALLOWED_EMAILS: 'a@b.com' }, async () => {
    const { privateKey, jwk } = makeKeyPair();
    const token = signJwt(privateKey, jwk.kid, { iss: 'accounts.google.com', aud: 'client-1', exp: 9999999999, email: 'stranger@evil.com', email_verified: true });
    const gated = withGoogleAuth(() => {}, { fetchJwks: async () => ({ keys: [jwk] }) });
    const req = { method: 'GET', headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    await gated(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'FORBIDDEN');
  });
});

test('a validly signed, allowlisted token reaches the handler with req.session.email set', async () => {
  await withEnv({ GOOGLE_CLIENT_ID: 'client-1', NEXO_ALLOWED_EMAILS: 'a@b.com,c@d.com' }, async () => {
    const { privateKey, jwk } = makeKeyPair();
    const token = signJwt(privateKey, jwk.kid, { iss: 'accounts.google.com', aud: 'client-1', exp: 9999999999, email: 'a@b.com', email_verified: true });
    let capturedSession = null;
    const gated = withGoogleAuth(
      (req, res, { send }) => {
        capturedSession = req.session;
        send(res, { ok: true });
      },
      { fetchJwks: async () => ({ keys: [jwk] }) }
    );
    const req = { method: 'GET', headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    await gated(req, res);
    assert.deepEqual(capturedSession, { email: 'a@b.com' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});
