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
  assert.equal(normaliseId('x'.repeat(70)).length, 60);
  assert.throws(() => planSubmission('abc', '{}'), /SUBMIT_ID_INVALID/);
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
  assert.throws(() => planSubmission('big-id', huge), /SUBMIT_TOO_LARGE/);
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

test('an id already in the durable inbox is a success and sends nothing', async () => {
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    return ok({ ok: true, id: 'batch-9', complete: true, readback: 'PASS', saved: 'sheet:batch-9' });
  };
  const result = await submit('batch-9', '{}', { fetchImpl });
  assert.deepEqual(result, { ok: true, status: 'ALREADY_PERSISTED', file: 'sheet:batch-9', parts: 0, complete: true, readback: 'PASS' });
  assert.ok(seen.every(url => String(url).includes('check=1')), 'a verified durable batch must not be re-sent');
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

test('a clean run sends every part in order and requires durable gateway readback', async () => {
  const sent = [];
  const fetchImpl = async url => {
    if (String(url).includes('api.github.com')) return fail(404, {});
    const part = new URL(url).searchParams;
    if (part.get('check') === '1') return ok({ ok: true, complete: false, found: false });
    sent.push(part.get('i'));
    const complete = part.get('i') === part.get('n');
    return ok({ ok: true, complete, readback: complete ? 'PASS' : undefined });
  };
  const result = await submit('batch-y', JSON.stringify({ a: 'b'.repeat(12_000) }), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.complete, true);
  assert.equal(result.gateway.readback, 'PASS');
  assert.deepEqual(sent, sent.map((_, index) => String(index + 1)));
});

test('submit uses the durable relay without a GitHub Contents connector', async () => {
  const relayParts = [];
  const fetchImpl = async (url, options = {}) => {
    const request = new URL(url);
    assert.equal(options.method || 'GET', 'GET', 'the gateway uses GET for both check and submit');
    if (request.searchParams.get('check') === '1') return ok({ ok: true, complete: false, found: false });
    const part = request.searchParams;
    relayParts.push(part.get('i'));
    return ok({ ok: true, complete: true, readback: 'PASS', saved: `sheet:${part.get('id')}` });
  };
  const result = await submit('batch-refused', JSON.stringify({ stable_id: 'batch-refused' }), { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.gateway.readback, 'PASS');
  assert.deepEqual(relayParts, ['1']);
});

test('a preflight outage does not prevent the connector-free durable relay', async () => {
  const submitted = [];
  const fetchImpl = async url => {
    const request = new URL(url);
    if (request.searchParams.get('check') === '1') throw new Error('check route unavailable');
    submitted.push(request.pathname);
    return ok({ ok: true, complete: true, readback: 'PASS', saved: 'sheet:batch-offline' });
  };
  const result = await submit('batch-offline', '{}', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.gateway.readback, 'PASS');
  assert.deepEqual(submitted, ['/api/inbox-drop']);
});

test('an incomplete gateway response is not reported as durable success', async () => {
  const fetchImpl = async url => String(url).includes('api.github.com')
    ? fail(404, {})
    : ok({ ok: true, complete: false });
  const result = await submit('batch-pending', '{}', { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'READBACK_UNCONFIRMED');
});

test('alreadyLanded checks the stable id through the connector-free gateway', async () => {
  const asked = [];
  const landed = await alreadyLanded('batch-z', async url => {
    asked.push(url);
    return ok({ ok: true, id: 'batch-z', complete: true, readback: 'PASS', saved: 'sheet:batch-z' });
  });
  assert.equal(landed, 'sheet:batch-z');
  assert.equal(asked.length, 1);
  assert.ok(asked[0].includes('/api/inbox-drop?id=batch-z&check=1'));
});
