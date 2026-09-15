import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';
import { buildHealthLayerModel } from '../src/atlas-v3/health-layer-model.mjs';

const control = {
  schema_version: '0.6',
  truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
  atlas_role: 'READ_ONLY_PROJECTION',
  drive_writeback_to_truth: 'FORBIDDEN'
};

test('Health publishes an explicit sanitized Olympus sync envelope', () => {
  const snapshot = buildAtlasProjectionV3({
    control,
    sourceVersion: 'tower-sha:olympus-health',
    generatedAt: '2026-09-15T12:00:00Z',
    entities: {
      work: [{ id: 'WORK::OLYMPUS::SYNC', kind: 'ACTION', domain: 'OLYMPUS', status: 'WAIT_DEPENDENCY' }]
    }
  });

  assert.deepEqual(snapshot.health.olympusSync, {
    state: 'SYNCED',
    source: 'OLYMPUS',
    authority: 'TOWER_V06',
    sourceVersion: 'tower-sha:olympus-health',
    publicEntityCount: 1,
    privateDataExcluded: true
  });
  assert.deepEqual(buildHealthLayerModel(snapshot), {
    status: 'SYNCED',
    sourceVersion: 'tower-sha:olympus-health',
    publicEntityCount: 1,
    privateDataExcluded: true,
    label: 'Olympus sincronizado'
  });
});

test('Health does not claim Olympus sync without a published Olympus signal', () => {
  const snapshot = buildAtlasProjectionV3({ control, sourceVersion: 'tower-sha:empty', entities: {} });
  assert.equal(snapshot.health.olympusSync.state, 'UNKNOWN');
  assert.equal(buildHealthLayerModel(snapshot).status, 'UNKNOWN');
  assert.equal(buildHealthLayerModel(snapshot).privateDataExcluded, true);
});
