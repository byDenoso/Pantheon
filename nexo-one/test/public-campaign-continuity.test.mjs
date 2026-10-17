import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishPublicCampaigns} from '../scripts/publish-public-campaigns.mjs';
import {createPublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';

const stamp = day => `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`;
const snapshot = (day, phase) => createPublicCampaignSnapshot([{
  id: 'synthetic-campaign', questionId: 'synthetic-question',
  question: {'pt-BR': 'Pergunta sintética?', en: 'Synthetic question?'},
  updatedAt: stamp(phase + 1), state: 'ongoing', tests: [], testsCoverage: 'COMPLETE',
}], {sourceRevision: `sha256:${String(day).padStart(64, '0')}`, generatedAt: stamp(day), coverage: 'COMPLETE'});

async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'nexo-public-continuity-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const dist = join(root, 'dist'), input = join(root, 'input.json');
  await fs.mkdir(dist);
  return {dist, input, file: join(dist, 'public-campaigns.json')};
}

test('unchanged approved content keeps the verified bytes and publication clock', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.input, JSON.stringify(snapshot(1, 0)));
  await publishPublicCampaigns(f.input, f.dist);
  const before = await fs.readFile(f.file, 'utf8');
  await fs.writeFile(f.input, JSON.stringify(snapshot(2, 0)));
  let writes = 0;
  const io = {...fs, writeFile: async (...args) => {writes++; return fs.writeFile(...args);}};
  const receipt = await publishPublicCampaigns(f.input, f.dist, {io});
  assert.equal(writes, 0);
  assert.equal(await fs.readFile(f.file, 'utf8'), before);
  assert.equal(receipt.changed, false);
  assert.equal(receipt.sourceRevision, snapshot(1, 0).sourceRevision);
  assert.equal(receipt.snapshotDigest, snapshot(1, 0).snapshotDigest);
});

test('21 deterministic days recover a publication interruption without repeated publication', async t => {
  const f = await fixture(t);
  const events = [];
  let lastVerified, changed = 0, failures = 0;
  for (let day = 1; day <= 21; day++) {
    const phase = day < 5 ? 0 : day < 13 ? 1 : 2;
    await fs.writeFile(f.input, JSON.stringify(snapshot(day, phase)));
    // Day five loses the publisher before replacing the verified file.
    const io = day === 5 ? {...fs, rename: async () => {throw new Error('synthetic interruption');}} : fs;
    try {
      const receipt = await publishPublicCampaigns(f.input, f.dist, {io});
      changed += Number(receipt.changed);
      events.push({day, status: receipt.status, changed: receipt.changed});
      lastVerified = await fs.readFile(f.file, 'utf8');
      assert.equal(JSON.parse(lastVerified).campaigns[0].id, 'synthetic-campaign');
    } catch (error) {
      assert.equal(day, 5);
      assert.match(error.message, /synthetic interruption/);
      failures++;
      assert.equal(await fs.readFile(f.file, 'utf8'), lastVerified);
      events.push({day, status: 'PENDING'});
    }
    assert.deepEqual(await fs.readdir(f.dist), ['public-campaigns.json']);
  }
  assert.equal(events.length, 21);
  assert.equal(failures, 1);
  assert.equal(changed, 3);
  assert.equal(events[5].changed, true);
  assert.equal(JSON.parse(lastVerified).generatedAt, stamp(13));
});
