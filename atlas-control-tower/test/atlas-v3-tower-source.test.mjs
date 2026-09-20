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
  await mkdir(path.join(tower, 'entities', 'test_group'), { recursive: true });
  await mkdir(path.join(tower, 'entities', 'test'), { recursive: true });
  await mkdir(path.join(tower, 'runtime', 'artifacts', 'meta_learning'), { recursive: true });
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
  }, {
    work_id: 'ACT-ENG-SAFE', kind: 'ENGINEERING_FIX', domain: 'ENGINEERING', status: 'CHECKPOINTED', priority: 'HIGH', entity_version: 1
  }] }));
  await writeFile(path.join(tower, 'indexes', 'programs.json'), JSON.stringify({ programs: [{
    program_id: 'PROG-STRUCTURE', title: 'Structure growth', status: 'PROVISIONAL', campaign_count: 1
  }] }));
  await writeFile(path.join(tower, 'indexes', 'campaigns.json'), JSON.stringify({ campaigns: [{
    campaign_id: 'CAMP-GROWTH', program_id: 'PROG-STRUCTURE', status: 'ACTIVE', test_count: 12
  }] }));
  await writeFile(path.join(tower, 'entities', 'interdomain', 'META::INTERDOMAIN::A.json'), JSON.stringify({
    id: 'META::INTERDOMAIN::A', kind: 'INTERDOMAIN', status: 'TESTING', relation_type: 'METHOD_TRANSFER', source_domains: ['Cosmologia'], target_domains: ['Bodybuilding'], source_nodes: ['HYP::A'], test_refs: ['WORK::OLYMPUS::SAFE'], mapping: 'Public method mapping', entity_version: 2,
    private_notes: 'must disappear'
  }));
  await writeFile(path.join(tower, 'entities', 'hypothesis', 'HYP::A.json'), JSON.stringify({
    entity_id: 'HYP::A', entity_type: 'HYPOTHESIS', domain: 'SCIENCE', status: 'TESTING', priority: 'HIGH', entity_version: 1, title: 'Safe hypothesis', private_reasoning: 'must disappear'
  }));
  await writeFile(path.join(tower, 'entities', 'test_group', 'GROUP-A.json'), JSON.stringify({
    id: 'GROUP-A', kind: 'TEST_GROUP', campaign_id: 'CAMP-GROWTH', status: 'ACTIVE', test_count: 1
  }));
  await writeFile(path.join(tower, 'entities', 'test', 'T-SCI-001.json'), JSON.stringify({
    id: 'T-SCI-001', kind: 'TEST', test_group_id: 'GROUP-A', campaign_id: 'CAMP-GROWTH', domain: 'SCIENCE', status: 'DONE'
  }));
  await writeFile(path.join(tower, 'runtime', 'artifacts', 'meta_learning', 'METALEARNING_CURRENT.json'), JSON.stringify({
    schema: 'nexo.meta-learning.v1', authority_boundary: 'PROCEDURAL_ONLY_NO_SCIENTIFIC_AUTHORITY', version: 4,
    evidence: [{ evidence_id: 'ML-EVID-SCI-001', context: 'T-SCI-001 deterministic recovery', outcome: 'PASS', decision_changed: true }],
    lessons: [{ lesson_id: 'ML-LESSON-001', version: 1, status: 'SUPPORTED', evidence_refs: ['ML-EVID-SCI-001'], lesson: 'Reuse validated inputs before implementing adapters.', heuristic: 'Prefer reuse before create.' }],
    adaptive_policy: { policy_version: 4, active_supported_guard: 'Reuse validated inputs before new adapters.' }
  }));
  return tower;
}

test('Tower source builder keeps TOWER_V06 authority and a bounded public hot set', async () => {
  const source = await buildSanitizedTowerSource({ towerDir: await fixture(), sourceRevision: 'tower-tree:test', generatedAt: '2026-09-15T03:00:00Z' });
  assert.equal(source.control.atlas_truth_source, 'TOWER_V06');
  assert.equal(source.sourceVersion, 'tower-tree:test');
  assert.equal(source.completeness, 'PARTIAL_TOWER_HOT_SET');
  assert.equal(source.entities.work.length, 2);
  assert.equal(source.entities.interdomain.length, 1);
  assert.equal(source.entities.hypothesis.length, 1);
  assert.equal(source.entities.program.length, 1);
  assert.equal(source.entities.campaign.length, 1);
  assert.equal(source.entities.learning.length, 2);
  assert.equal(source.entities.learning.find(item => item.id === 'ML-EVID-SCI-001')?.stage, 'OBSERVATION');
  assert.deepEqual(source.entities.learning.find(item => item.id === 'ML-EVID-SCI-001')?.test_refs, ['T-SCI-001']);
  assert.equal(source.entities.learning.find(item => item.id === 'ML-LESSON-001')?.stage, 'LESSON');
  assert.deepEqual(source.entities.learning.find(item => item.id === 'ML-LESSON-001')?.learning_refs, ['ML-EVID-SCI-001']);
  assert.equal(source.entities.work[0].id, 'ACT-ENG-SAFE');
  assert.equal(source.entities.hypothesis[0].id, 'HYP::A');
  assert.equal(source.entities.campaign[0].program_id, 'PROG-STRUCTURE');
});

test('Tower source builder structurally strips private and nested fields before Pantheon', async () => {
  const source = await buildSanitizedTowerSource({ towerDir: await fixture(), sourceRevision: 'tower-tree:test' });
  const raw = JSON.stringify(source);
  assert.doesNotMatch(raw, /Private Person|eligible_cohort_manifest|private operational prose|secret_blob|private_notes|private_reasoning/i);
  const olympus = source.entities.work.find(item => item.id === 'WORK::OLYMPUS::SAFE');
  assert.deepEqual(Object.keys(olympus).sort(), ['domain','entity_version','id','kind','owner_role','priority','status'].sort());
});

test('Tower source builder rejects a competing truth owner', async () => {
  const tower = await fixture();
  await writeFile(path.join(tower, 'CONTROL.json'), JSON.stringify({ truth_owner: 'GOOGLE_DRIVE', atlas_truth_source: 'GOOGLE_DRIVE' }));
  await assert.rejects(() => buildSanitizedTowerSource({ towerDir: tower }), /INVALID_TOWER_AUTHORITY/);
});
