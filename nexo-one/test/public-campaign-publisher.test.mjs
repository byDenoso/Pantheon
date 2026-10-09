import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishPublicCampaigns} from '../scripts/publish-public-campaigns.mjs';
import {createPublicCampaignSnapshot} from '../server/atlas/public-campaign-projection.mjs';

const snapshot = (id = 'one') => createPublicCampaignSnapshot([{id, questionId: `question-${id}`,
  question: {'pt-BR': 'Pergunta sintética?', en: 'Synthetic question?'}, updatedAt: '2026-10-08T12:00:00Z',
  state: 'ongoing', tests: [], testsCoverage: 'COMPLETE'}],
{sourceRevision: `sha256:${'a'.repeat(64)}`, generatedAt: '2026-10-08T12:00:00Z', coverage: 'COMPLETE'});

async function fixture(t, {previous = true} = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'nexo-public-publication-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const dist = join(root, 'dist'), input = join(root, 'input.json'), file = join(dist, 'public-campaigns.json');
  await fs.mkdir(dist);
  const before = JSON.stringify(snapshot('previous')) + '\n';
  if (previous) await fs.writeFile(file, before);
  await fs.writeFile(input, JSON.stringify(snapshot('next')));
  return {root, dist, input, file, before};
}

test('unavailable projection cannot replace the previous verified publication', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.input, JSON.stringify(createPublicCampaignSnapshot([], {
    sourceRevision: `sha256:${'b'.repeat(64)}`, generatedAt: '2026-10-08T12:00:00Z', coverage: 'UNAVAILABLE'})));
  await assert.rejects(publishPublicCampaigns(f.input, f.dist), /PUBLICATION_PENDING/);
  assert.equal(await fs.readFile(f.file, 'utf8'), f.before);
  assert.deepEqual(await fs.readdir(f.dist), ['public-campaigns.json']);
});

test('temporary bytes are validated before the previous publication is replaced', async t => {
  const f = await fixture(t);
  const io = {...fs, readFile: async (path, ...args) => String(path).endsWith('.tmp')
    ? Buffer.from('{corrupted}') : fs.readFile(path, ...args)};
  await assert.rejects(publishPublicCampaigns(f.input, f.dist, {io}), /READBACK_FAILED/);
  assert.equal(await fs.readFile(f.file, 'utf8'), f.before);
  assert.deepEqual(await fs.readdir(f.dist), ['public-campaigns.json']);
});

test('failed readback after atomic replacement restores the exact previous bytes', async t => {
  const f = await fixture(t);
  let reads = 0;
  const io = {...fs, readFile: async (path, ...args) => path === f.file && ++reads === 2
    ? Buffer.from('{corrupted}') : fs.readFile(path, ...args)};
  await assert.rejects(publishPublicCampaigns(f.input, f.dist, {io}), /READBACK_FAILED/);
  assert.equal(await fs.readFile(f.file, 'utf8'), f.before);
  assert.deepEqual(await fs.readdir(f.dist), ['public-campaigns.json']);
});

test('failed first-publication readback preserves the previous absence', async t => {
  const f = await fixture(t, {previous: false});
  let reads = 0;
  const io = {...fs, readFile: async (path, ...args) => path === f.file && ++reads === 2
    ? Buffer.from('{corrupted}') : fs.readFile(path, ...args)};
  await assert.rejects(publishPublicCampaigns(f.input, f.dist, {io}), /READBACK_FAILED/);
  assert.deepEqual(await fs.readdir(f.dist), []);
});

test('rollback failure remains explicit and retains the verified backup for recovery', async t => {
  const f = await fixture(t);
  let reads = 0;
  const io = {...fs, readFile: async (path, ...args) => path === f.file && ++reads === 2
    ? Buffer.from('{corrupted}') : fs.readFile(path, ...args),
    rename: async (from, to) => {
      if (String(from).endsWith('.restore.tmp')) throw new Error('synthetic restore failure');
      return fs.rename(from, to);
    }};
  await assert.rejects(publishPublicCampaigns(f.input, f.dist, {io}), /ROLLBACK_FAILED/);
  const backups = (await fs.readdir(f.dist)).filter(path => path.endsWith('.previous.tmp'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(join(f.dist, backups[0]), 'utf8'), f.before);
});

test('successful replacement verifies the new snapshot and removes temporary files', async t => {
  const f = await fixture(t);
  const receipt = await publishPublicCampaigns(f.input, f.dist);
  assert.equal(receipt.status, 'PUBLIC_CAMPAIGNS_VERIFIED');
  assert.equal(JSON.parse(await fs.readFile(f.file, 'utf8')).snapshotDigest, snapshot('next').snapshotDigest);
  assert.deepEqual(await fs.readdir(f.dist), ['public-campaigns.json']);
});
