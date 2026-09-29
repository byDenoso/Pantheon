import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drain, enqueue } from '../scripts/nexo-submit.mjs';

const spool = () => fs.mkdtemp(join(tmpdir(), 'nexo-spool-'));
const journal = async dir => (await fs.readFile(`${dir}/journal.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const reply = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Fake network: `landed` ids are in nexo-inbox, `staged` ids sit on dispatch-runtime. */
function network({ landed = [], staged = [], refuse = [] } = {}) {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname === 'raw.githubusercontent.com') {
      const id = u.pathname.split('/').pop().replace(/\.json$/, '');
      return reply(staged.includes(id) ? 200 : 404);
    }
    const id = u.searchParams.get('id');
    if (u.searchParams.get('check')) {
      return reply(200, landed.includes(id) ? { complete: true, readback: 'PASS', saved: `inbox/scheduled-${id}.json` } : { complete: false });
    }
    if (refuse.includes(id)) return reply(502, { error: 'GITHUB_403' });
    return reply(201, { complete: true, readback: 'PASS', saved: `inbox/${id}.json` });
  };
  return { fetchImpl, calls, drops: () => calls.filter(url => url.includes('&i=')) };
}

test('enqueue is create-only and journals before any staging attempt', async () => {
  const dir = await spool();
  assert.deepEqual(await enqueue(dir, 'Executor Batch 01', '{"a":1}', fs), { id: 'executor-batch-01', status: 'ENQUEUED' });
  assert.equal(await fs.readFile(`${dir}/pending/executor-batch-01.json`, 'utf8'), '{"a":1}');
  assert.deepEqual((await enqueue(dir, 'executor-batch-01', '{"a":1}', fs)).status, 'ALREADY_SPOOLED');
  await assert.rejects(enqueue(dir, 'executor-batch-01', '{"a":2}', fs), /SPOOL_CONFLICT/, 'a stable_id never gets a second body');
  await assert.rejects(enqueue(dir, 'executor-batch-02', 'not json', fs), SyntaxError);
  assert.deepEqual((await journal(dir)).map(line => line.event), ['ENQUEUED']);
});

test('drain never resubmits what already landed in nexo-inbox', async () => {
  const dir = await spool();
  await enqueue(dir, 'landed-0001', '{"x":1}', fs);
  const net = network({ landed: ['landed-0001'] });
  const summary = await drain(dir, { fs, fetchImpl: net.fetchImpl });
  assert.equal(summary.landed, 1);
  assert.equal(net.drops().length, 0);
  await fs.access(`${dir}/done/landed-0001.json`);
});

test('drain leaves ids that are still in flight on the dispatch-runtime relay', async () => {
  const dir = await spool();
  await enqueue(dir, 'staged-0001', '{"x":1}', fs);
  const net = network({ staged: ['staged-0001'] });
  const summary = await drain(dir, { fs, fetchImpl: net.fetchImpl });
  assert.equal(summary.inRelay, 1);
  assert.equal(net.drops().length, 0, 'the relay delivers it in ~8 s; resubmitting would duplicate');
  await fs.access(`${dir}/pending/staged-0001.json`);
});

test('drain submits only what is nowhere, and keeps refused ids pending for the next round', async () => {
  const dir = await spool();
  await enqueue(dir, 'fresh-0001', '{"x":1}', fs);
  await enqueue(dir, 'refused-0001', '{"x":2}', fs);
  const net = network({ refuse: ['refused-0001'] });
  const summary = await drain(dir, { fs, fetchImpl: net.fetchImpl });
  assert.deepEqual(summary.ids, { 'fresh-0001': 'SUBMITTED', 'refused-0001': 'FAILED_GATEWAY_REFUSED' });
  await fs.access(`${dir}/done/fresh-0001.json`);
  await fs.access(`${dir}/pending/refused-0001.json`);
  assert.deepEqual((await journal(dir)).map(line => line.event).slice(-2), ['SUBMITTED', 'FAILED_GATEWAY_REFUSED']);
});

test('dry-run drain reports without sending or moving anything', async () => {
  const dir = await spool();
  await enqueue(dir, 'fresh-0002', '{"x":1}', fs);
  const net = network();
  const summary = await drain(dir, { fs, fetchImpl: net.fetchImpl, dryRun: true });
  assert.deepEqual(summary.ids, { 'fresh-0002': 'WOULD_SUBMIT' });
  assert.equal(net.drops().length, 0);
  await fs.access(`${dir}/pending/fresh-0002.json`);
});

test('an empty or missing spool drains to nothing', async () => {
  const summary = await drain(join(await spool(), 'nope'), { fs, fetchImpl: network().fetchImpl });
  assert.deepEqual(summary, { landed: 0, inRelay: 0, submitted: 0, failed: 0, ids: {} });
});
