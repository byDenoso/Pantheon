import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileGalaxySnapshot} from '../server/compiler/galaxy-v1.mjs';
import {
  AtlasObservationError,
  EMPTY_ATLAS_OBSERVATION,
  observeGalaxySnapshot,
  transitionAtlasObservation,
} from '../src/data/atlasObservation.ts';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const observedAt = '2026-10-02T05:00:00.000Z';

async function realPublishedSnapshot() {
  const [projection, manifestFile] = await Promise.all([
    readJson('../data/tower-public/projection.json'),
    readJson('../data/tower-public/manifest.json'),
  ]);
  const raw = compileGalaxySnapshot({projection, manifestFile});
  return {
    projection,
    manifestFile,
    raw,
    observed: observeGalaxySnapshot(raw, manifestFile.projection_fingerprint, observedAt),
  };
}

test('validates the checked-in public projection and carries exact Tower provenance', async () => {
  const {manifestFile, raw, observed} = await realPublishedSnapshot();
  assert.equal(observed.contract, 'NEXO_ONE_GALAXY_V1');
  assert.equal(observed.coverage, 'COMPLETE');
  assert.equal(observed.entities.length, raw.stats.entities);
  assert.equal(observed.provenance.source_fingerprint, manifestFile.projection_fingerprint);
  assert.equal(observed.tower_revision, manifestFile.tower_commit);
  assert.equal(observed.entities[0].observation.contract, 'ATLAS_OBSERVATION_V1');
  assert.equal(observed.entities[0].observation.source_revision, raw.entities[0].source.revision);
  assert.equal(observed.entities[0].observation.projection_fingerprint, manifestFile.projection_fingerprint);
  assert.equal(observed.entities[0].observation.access, 'PUBLIC_PROJECTION');
});

test('compiled real TEST rows keep terminal, attempt, review and legacy UNKNOWN dimensions distinct', async () => {
  const {projection, manifestFile} = await realPublishedSnapshot();
  const terminal = projection.tests.find(item => item.status === 'DONE' && !item.scientific_state);
  const attemptSource = projection.tests.find(item => item.status === 'CHECKPOINTED' && !item.attempt_state && !item.execution_phase);
  const legacy = projection.tests.find(item => item.id !== terminal?.id && item.id !== attemptSource?.id
    && !item.attempt_state && !item.execution_phase && !item.review_state);
  assert.ok(terminal, 'public fixture has an unannotated terminal TEST');
  assert.ok(attemptSource, 'public fixture has an unannotated checkpointed TEST');
  assert.ok(legacy, 'public fixture has a legacy TEST without attempt/review dimensions');

  const projected = {
    ...projection,
    tests: projection.tests.map(item => item.id === attemptSource.id
      ? {...item, status: 'CHECKPOINTED', state: 'CHECKPOINTED', scientific_state: 'INCONCLUSIVE', execution_phase: 'RUNNING', review_state: 'PENDING'}
      : item),
  };
  const compiled = compileGalaxySnapshot({projection: projected, manifestFile});
  const terminalEntity = compiled.entities.find(item => item.canonical_id === terminal.id);
  const phaseEntity = compiled.entities.find(item => item.canonical_id === attemptSource.id);
  const legacyEntity = compiled.entities.find(item => item.canonical_id === legacy.id);
  assert.equal(terminalEntity.scientific_state, 'UNKNOWN', 'task terminal status is not a scientific verdict');
  assert.equal(phaseEntity.status, 'CHECKPOINTED');
  assert.equal(phaseEntity.scientific_state, 'INCONCLUSIVE');
  assert.equal(phaseEntity.attempt_state, 'RUNNING');
  assert.equal(phaseEntity.review_state, 'PENDING');
  assert.equal(legacyEntity.attempt_state, null);
  assert.equal(legacyEntity.review_state, null);
  assert.ok(compiled.events.some(event => event.kind === 'AGN' && event.id === `agn:${phaseEntity.visual_domain}`));
  const observed = observeGalaxySnapshot(compiled, manifestFile.projection_fingerprint, observedAt);
  const observedLegacy = observed.entities.find(item => item.id === legacyEntity.id);
  assert.equal(observedLegacy.observation.attempt_state, 'UNKNOWN');
  assert.equal(observedLegacy.observation.review_state, 'UNKNOWN');
});

test('keeps task status, scientific state, attempt, review and human decision separate', async () => {
  const {manifestFile, raw} = await realPublishedSnapshot();
  const entity = raw.entities.find(item => item.status === 'CHECKPOINTED');
  assert.ok(entity, 'fixture contains a CHECKPOINTED task');
  const withIndependentDimensions = {
    ...raw,
    entities: raw.entities.map(item => item.id === entity.id ? {
      ...item,
      status: 'CHECKPOINTED',
      scientific_state: 'INCONCLUSIVE',
      attempt_state: 'RUNNING',
      review_state: 'PENDING',
    } : item),
    needs_you: [{entity: entity.id, reason: 'EXPLICIT_HUMAN_GATE'}],
    stats: {...raw.stats, needs_you: 1},
    events: [...raw.events, {
      id: 'atlas-observation-fixture:event-1',
      kind: 'NOVA',
      label: 'Explicitly associated fixture event',
      domain: entity.visual_domain,
      entity: entity.id,
      timestamp: '2026-10-02T04:59:00.000Z',
      x: entity.layout.x,
      y: entity.layout.y,
      z: entity.layout.z,
      intensity: 0.5,
    }],
  };
  const observed = observeGalaxySnapshot(withIndependentDimensions, manifestFile.projection_fingerprint, observedAt);
  const result = observed.entities.find(item => item.id === entity.id);
  assert.equal(result.status, 'CHECKPOINTED');
  assert.equal(result.observation.scientific_state, 'INCONCLUSIVE');
  assert.equal(result.observation.attempt_state, 'RUNNING');
  assert.equal(result.observation.review_state, 'PENDING');
  assert.equal(result.observation.decision_required, true);
  assert.equal(result.observation.last_event_id, 'atlas-observation-fixture:event-1');
  assert.equal(result.observation.last_event_at, '2026-10-02T04:59:00.000Z');
  assert.equal(observed.events.at(-1).id, 'atlas-observation-fixture:event-1');
  assert.equal(observed.events.at(-1).provenance.role, 'DERIVED_FROM_TOWER_SNAPSHOT');
  assert.equal(observed.events.at(-1).provenance.source_revision, raw.tower_revision);
});

test('omitted dimensions remain UNKNOWN and CHECKPOINTED is not an execution attempt', async () => {
  const {observed} = await realPublishedSnapshot();
  const checkpointed = observed.entities.find(item => item.status === 'CHECKPOINTED');
  assert.ok(checkpointed);
  assert.equal(checkpointed.observation.scientific_state, 'UNKNOWN');
  assert.equal(checkpointed.observation.attempt_state, 'UNKNOWN');
  assert.equal(checkpointed.observation.review_state, 'UNKNOWN');
  assert.equal(checkpointed.observation.decision_required, false);
  assert.notEqual(checkpointed.observation.attempt_state, checkpointed.status);
  assert.equal(observed.freshness, 'SNAPSHOT');
});

test('rejects an incompatible projection fingerprint without accepting it', async () => {
  const {raw, manifestFile} = await realPublishedSnapshot();
  assert.throws(
    () => observeGalaxySnapshot(raw, 'sha256:' + '0'.repeat(64), observedAt),
    error => error instanceof AtlasObservationError && error.code === 'FINGERPRINT_MISMATCH',
  );
  assert.throws(
    () => observeGalaxySnapshot({...raw, provenance: {...raw.provenance, source_fingerprint: 'sha256:' + '0'.repeat(64)}}, manifestFile.projection_fingerprint, observedAt),
    error => error instanceof AtlasObservationError && error.code === 'FINGERPRINT_MISMATCH',
  );
});

test('preserves the last valid snapshot on failed, partial, out-of-order and late responses', async () => {
  const {raw, manifestFile, observed} = await realPublishedSnapshot();
  const start = transitionAtlasObservation(EMPTY_ATLAS_OBSERVATION, {
    type: 'REQUEST', request_id: 1, fingerprint: manifestFile.projection_fingerprint,
  });
  const available = transitionAtlasObservation(start, {type: 'ACCEPT', request_id: 1, snapshot: observed});
  assert.equal(available.snapshot, observed);
  assert.equal(available.status, 'AVAILABLE');

  const loading = transitionAtlasObservation(available, {
    type: 'REQUEST', request_id: 2, fingerprint: manifestFile.projection_fingerprint,
  });
  const failed = transitionAtlasObservation(loading, {type: 'REJECT', request_id: 2, code: 'UNAVAILABLE'});
  assert.equal(failed.snapshot, observed);
  assert.equal(failed.status, 'STALE');

  const partial = {...observed, coverage: 'PARTIAL'};
  const partialState = transitionAtlasObservation(loading, {type: 'ACCEPT', request_id: 2, snapshot: partial});
  assert.equal(partialState.snapshot, observed);
  assert.equal(partialState.status, 'PARTIAL');

  const outOfOrder = {...observed, generated_at: '2000-01-01T00:00:00.000Z'};
  const late = transitionAtlasObservation(loading, {type: 'ACCEPT', request_id: 2, snapshot: outOfOrder});
  assert.equal(late.snapshot, observed);
  assert.equal(late.status, 'STALE');
  assert.equal(late.error_code, 'OUT_OF_ORDER_SNAPSHOT');

  const newerRequest = transitionAtlasObservation(loading, {
    type: 'REQUEST', request_id: 3, fingerprint: manifestFile.projection_fingerprint,
  });
  const ignoredLateResponse = transitionAtlasObservation(newerRequest, {type: 'ACCEPT', request_id: 2, snapshot: raw});
  assert.equal(ignoredLateResponse, newerRequest);
});
