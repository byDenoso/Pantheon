import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasProjectionV3 } from '../v3/project.mjs';

const control = {
  schema_version: '0.6',
  truth_owner: 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
  write_model: 'GITHUB_CAS_ENTITY_EVENT',
  drive_role: 'LEGACY_PROJECTION_ONLY',
  drive_writeback_to_truth: 'FORBIDDEN',
  atlas_role: 'READ_ONLY_PROJECTION',
  atlas_truth_source: 'TOWER_V06',
  interdomain_layer: 'ACTIVE_V1'
};

const input = {
  control,
  sourceVersion: 'tower-sha:test',
  generatedAt: '2026-09-14T12:00:00Z',
  completeness: 'PARTIAL',
  entities: {
    hypothesis: [{ id: 'HYP::COSMO::A', status: 'TESTING', label: 'Cosmology hypothesis' }],
    work: [{ id: 'WORK::OLYMPUS::T01', status: 'READY', owner_role: 'EXECUTOR' }],
    interdomain: [{
      id: 'META::INTERDOMAIN::COSMO-OLYMPUS-001',
      kind: 'INTERDOMAIN',
      status: 'TESTING',
      relation_type: 'METHOD_TRANSFER',
      source_domains: ['Cosmologia'],
      target_domains: ['Bodybuilding'],
      source_nodes: ['HYP::COSMO::A'],
      test_refs: ['WORK::OLYMPUS::T01'],
      mapping: 'Selection-aware transfer',
      falsifier_or_validation: 'No reduction in contradiction rate'
    }]
  }
};

test('projects TOWER_V06 as the only operational authority', () => {
  const snapshot = buildAtlasProjectionV3(input);
  assert.equal(snapshot.manifest.authority, 'TOWER_V06');
  assert.equal(snapshot.manifest.truthOwner, 'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
  assert.equal(snapshot.manifest.projectionOnly, true);
  assert.equal(snapshot.manifest.freshness, 'SNAPSHOT');
  assert.equal(snapshot.provenance.source, 'TOWER_V06');
});

test('projects inter-domain state as first-class learning filaments', () => {
  const snapshot = buildAtlasProjectionV3(input);
  assert.equal(snapshot.learning.filaments.length, 1);
  const filament = snapshot.learning.filaments[0];
  assert.equal(filament.relationType, 'METHOD_TRANSFER');
  assert.deepEqual(filament.sourceDomains, ['Cosmologia']);
  assert.deepEqual(filament.targetDomains, ['Bodybuilding']);
  const relationTypes = snapshot.graph.root.edges.map(edge => edge.type);
  assert.ok(relationTypes.includes('METHOD_TRANSFER'));
  assert.ok(relationTypes.includes('PROPOSES_TEST'));
});

test('fingerprint is deterministic and independent from generation time', () => {
  const first = buildAtlasProjectionV3(input);
  const second = buildAtlasProjectionV3({ ...input, generatedAt: '2026-09-15T12:00:00Z' });
  assert.equal(first.manifest.fingerprint, second.manifest.fingerprint);
});

test('public projection excludes explicit personal/client entities', () => {
  const snapshot = buildAtlasProjectionV3({
    ...input,
    entities: {
      ...input.entities,
      work: [
        ...input.entities.work,
        { id: 'WORK::CLIENT::RENILDE-001', label: 'Renilde client assessment', privacy: 'PRIVATE' }
      ]
    }
  });
  assert.equal(snapshot.graph.root.nodes.some(node => node.id === 'WORK::CLIENT::RENILDE-001'), false);
});

test('rejects any input whose truth owner is not TOWER_V06', () => {
  assert.throws(() => buildAtlasProjectionV3({ ...input, control: { ...control, truth_owner: 'GOOGLE_DRIVE' } }), /INVALID_TOWER_AUTHORITY/);
});

test('public projection uses structural allowlists instead of copying nested canonical payloads', () => {
  const snapshot = buildAtlasProjectionV3({
    ...input,
    entities: {
      ...input.entities,
      work: [{
        id: 'WORK::OLYMPUS::SAFE-ID',
        status: 'WAIT_DEPENDENCY',
        owner_role: 'EXECUTOR',
        next_action: 'Await a new check-in for Miquéias',
        eligible_cohort_manifest: { display_name: 'Miquéias', dates: ['2026-01-27'] }
      }]
    }
  });
  const projected = snapshot.entities['WORK::OLYMPUS::SAFE-ID'];
  assert.equal(projected.ownerRole, 'EXECUTOR');
  assert.equal('eligible_cohort_manifest' in projected, false);
  assert.equal(snapshot.operations.works[0].nextAction, null);
  assert.doesNotMatch(JSON.stringify(snapshot), /Miqu[eé]ias/i);
});
