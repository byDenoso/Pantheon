import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildSanitizedTowerSource } from '../v3/tower-source.mjs';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';

const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), 'utf8');
};

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'atlas-test-group-'));
  await writeJson(path.join(root, 'CONTROL.json'), {
    schema_version: '0.6',
    truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
    atlas_role: 'READ_ONLY_PROJECTION',
    drive_writeback_to_truth: 'FORBIDDEN'
  });
  await writeJson(path.join(root, 'indexes', 'active-work.json'), { work: [] });
  await writeJson(path.join(root, 'indexes', 'programs.json'), {
    programs: [{ id: 'PROG-SCIENCE', title: 'Science', status: 'ACTIVE' }]
  });
  await writeJson(path.join(root, 'indexes', 'campaigns.json'), {
    campaigns: [{ id: 'CAMP-GROWTH-LSS', program_id: 'PROG-SCIENCE', title: 'Growth LSS', status: 'ACTIVE' }]
  });
  await writeJson(path.join(root, 'migration', 'test-registry-backfill-v1.json'), {
    meta: {
      unique_tests: 2198,
      group_count: 67,
      source_file_id: 'legacy-sheet',
      source_sheet_id: 200000001,
      historical_access_mode: 'LEGACY_TEST_REGISTRY_LINK_PLUS_FILTER'
    },
    groups: [
      {
        id: 'TEST_GROUP::CAMP-GROWTH-LSS::OTHER',
        campaign_id: 'CAMP-GROWTH-LSS',
        group_kind: 'VIRTUAL_GROUP',
        label: 'Other tests',
        status: 'MIGRATED',
        test_count: 59,
        migration_only: true
      },
      {
        id: 'TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY',
        campaign_id: 'CAMP-GROWTH-LSS',
        group_kind: 'VIRTUAL_GROUP',
        label: 'Old migration label',
        status: 'MIGRATED',
        test_count: 2,
        migration_only: true
      }
    ]
  });
  await writeJson(path.join(root, 'entities', 'test_group', 'GZ01.json'), {
    id: 'TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY',
    campaign_id: 'CAMP-GROWTH-LSS',
    group_kind: 'BATTERY',
    label: 'GZ01 eROSITA Superbattery',
    status: 'ACTIVE',
    entity_version: 1
  });
  await writeJson(path.join(root, 'entities', 'test', 'GZSB-01.json'), {
    id: 'GZSB-01-DESI-INFERENCE-PRIOR-SENSITIVITY',
    test_group_id: 'TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY',
    campaign_id: 'CAMP-GROWTH-LSS',
    status: 'VERIFIED',
    evidence_class: 'FROZEN_BATTERY_CHILD',
    title: 'DESI prior sensitivity',
    entity_version: 1
  });
  return root;
}

test('TEST_GROUP is projected as terminal graph node while TEST is registry-only', async () => {
  const root = await fixture();
  try {
    const source = await buildSanitizedTowerSource({ towerDir: root, sourceRevision: 'fixture' });
    const projection = buildAtlasProjectionV3(source);

    const groupId = 'TEST_GROUP::CAMP-GROWTH-LSS::GZ01-EROSITA-SUPERBATTERY';
    const testId = 'GZSB-01-DESI-INFERENCE-PRIOR-SENSITIVITY';
    const nodes = projection.graph.root.nodes;
    const edges = projection.graph.root.edges;

    assert.ok(nodes.some(node => node.id === groupId && node.type === 'TEST_GROUP'));
    assert.equal(nodes.some(node => node.id === testId), false, 'TEST must never become a Neural graph node');
    assert.ok(edges.some(edge => edge.source === 'CAMP-GROWTH-LSS' && edge.target === groupId && edge.type === 'CONTAINS'));

    const group = projection.testing.groups.find(item => item.id === groupId);
    assert.equal(group.groupKind, 'BATTERY', 'live canonical group must override migration group');
    assert.equal(group.label, 'GZ01 eROSITA Superbattery');
    assert.ok(projection.testing.groups.some(item => item.id === 'TEST_GROUP::CAMP-GROWTH-LSS::OTHER'));
    assert.deepEqual(projection.testing.tests.map(item => item.id), [testId]);
    assert.equal(projection.testing.historicalRegistry.uniqueTests, 2198);
    assert.equal(projection.testing.historicalRegistry.groupCount, 67);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
