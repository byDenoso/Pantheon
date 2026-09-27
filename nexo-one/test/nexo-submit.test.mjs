import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHUNK, MAX_PARTS, alreadyLanded, b64url, chunkEnvelope, dropUrl, normaliseId, planSubmission, submit,
} from '../scripts/nexo-submit.mjs';

const decode = part => Buffer.from(part.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
const ok = body => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

test('ids are normalised to the [a-z0-9-] charset the gateway accepts', () => {
  assert.equal(normaliseId('Executor-Batch_A16F'), 'executor-batch-a16f');
  assert.equal(normaliseId('--trim--'), 'trim');
  assert.equal(normaliseId(''), '');
  assert.equal(normaliseId(null), '');
});

test('every encoded part stays within the gateway chunk limit and rebuilds the envelope exactly', () => {
  const json = JSON.stringify({ stable_id: 'x', payload: 'z'.repeat(40_000), unicode: 'ção · µ' });
  const parts = chunkEnvelope(json);
  for (const part of parts) assert.ok(part.length <= MAX_CHUNK, `part of ${part.length} exceeds ${MAX_CHUNK}`);
  assert.equal(parts.map(decode).join(''), json, 'reassembly must be byte-exact, including multi-byte characters');
});

test('base64url carries no padding or URL-hostile characters', () => {
  const encoded = b64url(Buffer.from('ção?>>'));
  assert.ok(!/[+/=]/.test(encoded), encoded);
});

test('an envelope too large for the gateway is refused before any write', () => {
  const huge = JSON.stringify({ blob: 'q'.repeat(MAX_PARTS * MAX_CHUNK) });
  assert.throws(() => planSubmission('big', huge), /SUBMIT_TOO_LARGE/);
});

test('plan numbers parts from one and reports a consistent total', () => {
  const plan = planSubmission('batch-1', JSON.stringify({ a: 'b'.repeat(20_000) }));
  assert.ok(plan.length > 1);
  plan.forEach((part, index) => {
    assert.equal(part.i, index + 1);
    assert.equal(part.n, plan.length);
    assert.equal(part.id, 'batch-1');
  });
});

test('the drop URL escapes the payload so base64url never breaks the query string', () => {
  const url = dropUrl('https://host/', { id: 'a', i: 1, n: 2, d: 'aa-_' });
  assert.equal(url, 'https://host/api/inbox-drop?id=a&i=1&n=2&d=aa-_');
  assert.ok(!url.includes('//api'), 'trailing slash on the base must not double up');
});

test('an id already in the canonical inbox is a success and sends nothing', async () => {
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    return String(url).includes('scheduled-batch-9.json') ? ok({}) : fail(404, {});
  };
  const result = await submit('batch-9', '{}', { fetchImpl });
  assert.deepEqual(result, { ok: true, status: 'ALREADY_PERSISTED', file: 'scheduled-batch-9.json', parts: 0 });
  assert.ok(!seen.some(url => url.includes('inbox-drop')), 'must not re-send a landed batch');
});

test('a refused part stops the submission and reports which one failed', async () => {
  const fetchImpl = async url => {
    if (String(url).includes('api.github.com')) return fail(404, {});
    if (String(url).includes('i=2')) return fail(502, { ok: false, error: 'GATEWAY_WRITE_FAILED' });
    return ok({ ok: true });
  };
  const json = JSON.stringify({ a: 'b'.repeat(12_000) });
  const result = await submit('batch-x', json, { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'GATEWAY_REFUSED');
  assert.equal(result.httpStatus, 502);
  assert.equal(result.part, 2);
});

test('a clean run sends every part in order', async () => {
  const sent = [];
  const fetchImpl = async url => {
    if (String(url).includes('api.github.com')) return fail(404, {});
    sent.push(new URL(url).searchParams.get('i'));
    return ok({ ok: true });
  };
  const result = await submit('batch-y', JSON.stringify({ a: 'b'.repeat(12_000) }), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SUBMITTED');
  assert.deepEqual(sent, sent.map((_, index) => String(index + 1)));
});

test('alreadyLanded checks both the relayed and direct inbox names', async () => {
  const asked = [];
  await alreadyLanded('batch-z', async url => { asked.push(url); return fail(404, {}); });
  assert.equal(asked.length, 2);
  assert.ok(asked[0].includes('scheduled-batch-z.json'));
  assert.ok(asked[1].includes('/batch-z.json'));
  assert.ok(asked.every(url => url.includes('ref=nexo-inbox')));
});
