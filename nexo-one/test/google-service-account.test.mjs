import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createVerify} from 'node:crypto';
import {serviceAccountServes, serviceAccountToken, clearServiceAccountCache} from '../server/adapters/service-account.mjs';
import {googleToken} from '../server/adapters/google.mjs';

const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const KEY = {type: 'service_account', client_email: 'atlas@proj.iam.gserviceaccount.com', private_key: privateKey.export({type: 'pkcs8', format: 'pem'})};
const env = {GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY)};
const DRIVE = ['https://www.googleapis.com/auth/drive.readonly'];
const reply = (status, body) => async () => ({ok: status < 300, status, json: async () => body});

test('serves only Drive and Sheets scopes and only when a key is configured', () => {
  assert.equal(serviceAccountServes(env, DRIVE), true);
  assert.equal(serviceAccountServes({}, DRIVE), false);
  assert.equal(serviceAccountServes(env, [...DRIVE, 'https://www.googleapis.com/auth/gmail.readonly']), false);
  assert.equal(serviceAccountServes(env, []), false);
});

test('signs a verifiable RS256 assertion, exchanges it once and caches the token', async () => {
  clearServiceAccountCache();
  let calls = 0, sent;
  const fetchImpl = async (url, init) => { calls++; sent = init.body; return {ok: true, status: 200, json: async () => ({access_token: 'tok', expires_in: 3600})}; };
  assert.equal(await serviceAccountToken(env, undefined, DRIVE, {fetchImpl, now: () => 1e12}), 'tok');
  assert.equal(await serviceAccountToken(env, undefined, DRIVE, {fetchImpl, now: () => 1e12 + 1000}), 'tok');
  assert.equal(calls, 1);
  const [h, c, s] = sent.get('assertion').split('.');
  assert.equal(sent.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, KEY.client_email);
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).scope, DRIVE[0]);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('maps Google failures to provider codes and rejects malformed keys', async () => {
  clearServiceAccountCache();
  await assert.rejects(serviceAccountToken(env, undefined, DRIVE, {fetchImpl: reply(429, {})}), {code: 'RATE_LIMITED'});
  await assert.rejects(serviceAccountToken(env, undefined, DRIVE, {fetchImpl: reply(400, {error: 'invalid_grant'})}), {code: 'AUTH_REQUIRED'});
  await assert.rejects(serviceAccountToken({GOOGLE_SERVICE_ACCOUNT_JSON: '{"type":"x"}'}, undefined, DRIVE, {fetchImpl: reply(200, {})}), {code: 'AUTH_REQUIRED'});
});

test('googleToken prefers the service account over Connect for Drive-only scopes', async () => {
  clearServiceAccountCache();
  const original = globalThis.fetch; const urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return {ok: true, status: 200, json: async () => ({access_token: 'sa-tok', expires_in: 3600})}; };
  try {
    const token = await googleToken({...env, GOOGLE_CONNECTOR: 'conn/x'}, undefined, {scopes: DRIVE, reuseDriveRead: true});
    assert.equal(token, 'sa-tok');
    assert.deepEqual(urls, ['https://oauth2.googleapis.com/token']);
  } finally { globalThis.fetch = original; }
});
