import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';
import { publishAtlasV3Snapshot } from '../v3/publish.mjs';

function snapshot() {
  return buildAtlasProjectionV3({
    control: {
      schema_version: '0.6',
      truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
      drive_writeback_to_truth: 'FORBIDDEN',
      atlas_role: 'READ_ONLY_PROJECTION'
    },
    sourceVersion: 'tower-sha:test',
    generatedAt: '2026-09-14T12:00:00Z',
    entities: { hypothesis: [{ id: 'HYP::A', label: 'A' }] }
  });
}

test('publishes immutable fingerprint path before advancing current manifest', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'atlas-v3-'));
  const result = await publishAtlasV3Snapshot(snapshot(), out);
  const current = JSON.parse(await readFile(result.currentManifest, 'utf8'));
  const stored = JSON.parse(await readFile(path.join(result.targetDir, 'snapshot.json'), 'utf8'));
  assert.equal(current.fingerprint, stored.manifest.fingerprint);
  assert.match(current.snapshotPath, /^\.\.\/snapshots\/sha256-/);
  assert.equal(stored.manifest.authority, 'TOWER_V06');
});

test('invalid snapshot cannot advance current manifest', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'atlas-v3-'));
  const good = snapshot();
  const result = await publishAtlasV3Snapshot(good, out);
  const before = await readFile(result.currentManifest, 'utf8');
  const bad = structuredClone(good);
  bad.manifest.authority = 'GOOGLE_DRIVE';
  await assert.rejects(() => publishAtlasV3Snapshot(bad, out), /AUTHORITY_MISMATCH/);
  const after = await readFile(result.currentManifest, 'utf8');
  assert.equal(after, before);
});
