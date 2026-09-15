import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSanitizedTowerSource } from '../v3/tower-source.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tower-v3-'));
  const tower = path.join(root, 'TOWER_V06');
  await mkdir(path.join(tower, 'indexes'), { recursive: true });
  await mkdir(path.join(tower, 'entities', 'interdomain'), { recursive: true });
  await mkdir(path.join(tower, 'entities', 'hypothesis'), { recursive: true });
  await writeFile(path.join(tower, 'CONTROL.json'), JSON.stringify({
    schema_version: '0.6',
    truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
    write_model: 'GITHUB_CAS_ENTITY_EVENT',
    drive_role: 'LEGACY_PROJECTION_ONLY',
    drive_writeback_to_truth: 'FORBIDDEN',
    atlas_role: 'READ_ONLY_PROJECTION',
    atlas_truth_source: 'TOWER_V06',
    interdomain_layer: 'ACTIVE_V1'
  }));
  await writeFile(path.join(tower, 'indexes', 'active-work.json'), JSON.stringify({ work: [{
    id: 'WORK::OLYMPUS::SAFE', kind: 'ACTION', domain: 'OLYMPUS', status: 'READY', owner_role: 'EXECUTOR', priority: 'HIGH', entity_version: 4,
    next_action: 'private operational prose', eligible_cohort_manifest: { display_name: 'Private Person' }, secret_blob: { token: 'nope' }
  }] }));
  await writeFile(path.join(tower, 'entities', 'interdomain', 'META::INTERDOMAIN::A.json'), JSON.stringify({
    id: 'META::INTERDOMAIN::A', kind: 'INTERDOMAIN', status: 'TESTING', relation_type: 'METHOD_TRANSFER', source_domains: ['Cosmologia'], target_domains: ['Bodybuilding'], source_nodes: ['HYP::A'], test_refs: ['WORK::OLYMPUS::SAFE'], mapping: 'Public method mapping', entity_version: 2,
    private_notes: 'must disappear'
  }));
  await writeFile(path.join(tower, 'entities', 'hypothesis', 'HYP::A.json'), JSON.stringify({
    id: 'HYP::A', kind: 'HYPOTHESIS', domain: 'SCIENCE', status: 'TESTING', priority: 'HIGH', entity_version: 1, label: 'Safe hypothesis', private_reasoning: 'must disappear'
  }));
  return tower;
}

test('Tower source builder keeps TOWER_V06 authority and a bounded public hot set', async () => {
  const source = await buildSanitizedTowerSource({ towerDir: await fixture(), sourceRevision: 'tower-tree:test', generatedAt: '2026-09-15T03:00:00Z' });
  assert.equal(source.control.atlas_truth_source, 'TOWER_V06');
  assert.equal(source.sourceVersion, 'tower-tree:test');
  assert.equal(source.completeness, 'PARTIAL_TOWER_HOT_SET');
  assert.equal(source.entities.work.length, 1);
  assert.equal(source.entities.interdomain.length, 1);
  assert.equal(source.entities.hypothesis.length, 1);
});

test('Tower source builder structurally strips private and nested fields before Pantheon', async () => {
  const source = await buildSanitizedTowerSource({ towerDir: await fixture(), sourceRevision: 'tower-tree:test' });
  const raw = JSON.stringify(source);
  assert.doesNotMatch(raw, /Private Person|eligible_cohort_manifest|private operational prose|secret_blob|private_notes|private_reasoning/i);
  assert.deepEqual(Object.keys(source.entities.work[0]).sort(), ['domain','entity_version','id','kind','owner_role','priority','status'].sort());
});

test('Tower source builder rejects a competing truth owner', async () => {
  const tower = await fixture();
  await writeFile(path.join(tower, 'CONTROL.json'), JSON.stringify({ truth_owner: 'GOOGLE_DRIVE', atlas_truth_source: 'GOOGLE_DRIVE' }));
  await assert.rejects(() => buildSanitizedTowerSource({ towerDir: tower }), /INVALID_TOWER_AUTHORITY/);
});
