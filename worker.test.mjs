import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const env = {
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
  WHATSAPP_ALLOW_ALL: 'true',
  OPENAI_API_KEY: 'test-openai',
  OPENAI_MODEL: 'gpt-5.6-sol',
  WHATSAPP_ACCESS_TOKEN: 'test-wa',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  META_APP_SECRET: 'secret',
};

test('GET /health returns ok', async () => {
  const res = await worker.fetch(new Request('https://x/health'), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {ok:true, service:'whatsapp-openai-worker'});
});

test('Meta verification returns challenge', async () => {
  const u = 'https://x/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123';
  const res = await worker.fetch(new Request(u), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'abc123');
});

test('invalid Meta signature is rejected', async () => {
  const req = new Request('https://x/webhook', {method:'POST', body:'{}', headers:{'content-type':'application/json','x-hub-signature-256':'sha256='+'0'.repeat(64)}});
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 401);
});
