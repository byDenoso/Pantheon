import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';
import { createAtlasV3Sdk } from '../v3/sdk.mjs';

const snapshot = buildAtlasProjectionV3({
  control: {
    schema_version: '0.6',
    truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
    drive_writeback_to_truth: 'FORBIDDEN',
    atlas_role: 'READ_ONLY_PROJECTION'
  },
  sourceVersion: 'tower-sha:test',
  generatedAt: '2026-09-14T12:00:00Z',
  entities: {
    hypothesis: [{ id: 'HYP::COSMO::A', label: 'Expansion test', status: 'TESTING' }],
    work: [{ id: 'WORK::OLYMPUS::T01', label: 'Olympus validation', status: 'READY' }],
    interdomain: [{
      id: 'META::INTERDOMAIN::A', kind: 'INTERDOMAIN', relation_type: 'METHOD_TRANSFER',
      source_nodes: ['HYP::COSMO::A'], test_refs: ['WORK::OLYMPUS::T01'], source_domains: ['Cosmologia'], target_domains: ['Bodybuilding']
    }]
  }
});

test('SDK exposes one immutable read model', () => {
  const sdk = createAtlasV3Sdk(snapshot);
  assert.equal(sdk.manifest().authority, 'TOWER_V06');
  assert.equal(sdk.entity('HYP::COSMO::A').label, 'Expansion test');
  assert.equal(sdk.learning().filaments.length, 1);
  assert.equal(sdk.operations().works.length, 1);
  assert.equal(sdk.search('Olympus')[0].id, 'WORK::OLYMPUS::T01');
  assert.ok(Object.isFrozen(sdk));
});

test('learning layer is a view over the same graph', () => {
  const sdk = createAtlasV3Sdk(snapshot);
  const learning = sdk.graph('LEARNING');
  assert.ok(learning.nodes.some(node => node.type === 'FILAMENT'));
  assert.ok(learning.edges.some(edge => edge.type === 'METHOD_TRANSFER'));
});

test('SDK refuses snapshots from another authority', () => {
  const bad = structuredClone(snapshot);
  bad.manifest.authority = 'GOOGLE_DRIVE';
  assert.throws(() => createAtlasV3Sdk(bad), /AUTHORITY_MISMATCH/);
});
