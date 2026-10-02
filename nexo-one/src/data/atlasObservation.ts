import {
  ATLAS_OBSERVATION_CONTRACT,
  type AtlasObservationCoverage,
  type AtlasObservationV1,
  type AtlasObservedEntity,
  type AtlasObservedEvent,
  type AtlasObservedGalaxySnapshot,
} from '../contracts/atlasObservation.ts';

const SHA256 = /^sha256:[0-9a-f]{64}$/i;
const TOWER_REVISION = /^[0-9a-f]{40}$/i;
const EVENT_KINDS = new Set(['SUPERNOVA', 'NOVA', 'AGN', 'HII', 'REMNANT', 'FLARE']);

export class AtlasObservationError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'AtlasObservationError';
    this.code = code;
  }
}

export type AtlasObservationLoadStatus = 'IDLE' | 'LOADING' | 'AVAILABLE' | 'STALE' | 'PARTIAL' | 'UNAVAILABLE';

export interface AtlasObservationState {
  snapshot: AtlasObservedGalaxySnapshot | null;
  status: AtlasObservationLoadStatus;
  requested_fingerprint: string | null;
  request_id: number;
  error_code: string | null;
}

export type AtlasObservationAction =
  | { type: 'REQUEST'; request_id: number; fingerprint: string }
  | { type: 'ACCEPT'; request_id: number; snapshot: AtlasObservedGalaxySnapshot }
  | { type: 'REJECT'; request_id: number; code: string };

export const EMPTY_ATLAS_OBSERVATION: AtlasObservationState = {
  snapshot: null,
  status: 'IDLE',
  requested_fingerprint: null,
  request_id: 0,
  error_code: null,
};

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

function invalid(code: string): never {
  throw new AtlasObservationError(code);
}

function observationFor(
  entity: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  sourceFingerprint: string,
  observedAt: string,
  coverage: AtlasObservationCoverage,
  decisionRequired: boolean,
  lastEvent: AtlasObservedEvent | undefined,
): AtlasObservationV1 {
  const source = record(entity.source);
  const revision = text(source?.revision) || text(snapshot.tower_revision);
  if (!revision) invalid('SOURCE_REVISION_MISSING');

  return {
    contract: ATLAS_OBSERVATION_CONTRACT,
    entity_id: text(entity.canonical_id) || text(entity.id) || invalid('ENTITY_ID_MISSING'),
    entity_kind: text(entity.kind) || 'UNKNOWN',
    scientific_state: text(entity.scientific_state) || 'UNKNOWN',
    // Task status is deliberately not a substitute for attempt_state.
    attempt_state: text(entity.attempt_state) || text(entity.execution_phase) || 'UNKNOWN',
    review_state: text(entity.review_state) || 'UNKNOWN',
    decision_required: decisionRequired,
    source_revision: revision,
    projection_fingerprint: sourceFingerprint,
    last_event_id: lastEvent?.id || null,
    last_event_at: lastEvent
      ? (validDate(lastEvent.occurred_at) ? lastEvent.occurred_at : validDate(lastEvent.timestamp) ? lastEvent.timestamp : null)
      : null,
    observed_at: observedAt,
    freshness: 'SNAPSHOT',
    coverage,
    access: 'PUBLIC_PROJECTION',
  };
}

function snapshotCoverage(snapshot: Record<string, unknown>): AtlasObservationCoverage {
  const stats = record(snapshot.stats);
  const entities = Array.isArray(snapshot.entities) ? snapshot.entities : null;
  const relations = Array.isArray(snapshot.relations) ? snapshot.relations : null;
  const needsYou = Array.isArray(snapshot.needs_you) ? snapshot.needs_you : null;
  if (!stats || !entities || !relations || !needsYou) return 'PARTIAL';
  return Number(stats.entities) === entities.length
    && Number(stats.relations) === relations.length
    && Number(stats.needs_you) === needsYou.length
    ? 'COMPLETE'
    : 'PARTIAL';
}

/** Validate the published Galaxy V1 payload and attach only evidence-backed observation fields. */
export function observeGalaxySnapshot(
  input: unknown,
  expectedFingerprint: string,
  observedAt = new Date().toISOString(),
): AtlasObservedGalaxySnapshot {
  const snapshot = record(input);
  if (!snapshot) invalid('SNAPSHOT_NOT_OBJECT');
  if (snapshot.contract !== 'NEXO_ONE_GALAXY_V1') invalid('SNAPSHOT_CONTRACT_MISMATCH');
  if (!text(snapshot.snapshot_id)) invalid('SNAPSHOT_ID_MISSING');
  if (!validDate(snapshot.generated_at)) invalid('SNAPSHOT_GENERATED_AT_INVALID');
  if (typeof snapshot.tower_revision !== 'string' || !TOWER_REVISION.test(snapshot.tower_revision)) invalid('TOWER_REVISION_INVALID');
  if (typeof snapshot.fingerprint !== 'string' || !SHA256.test(snapshot.fingerprint)) invalid('SNAPSHOT_FINGERPRINT_INVALID');
  if (!validDate(observedAt)) invalid('OBSERVED_AT_INVALID');

  const provenance = record(snapshot.provenance);
  const sourceFingerprint = text(provenance?.source_fingerprint);
  if (provenance?.authority !== 'TOWER_V06' || !sourceFingerprint || !SHA256.test(sourceFingerprint)) {
    invalid('SOURCE_PROVENANCE_INVALID');
  }
  if (expectedFingerprint && sourceFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()) {
    invalid('FINGERPRINT_MISMATCH');
  }

  if (!Array.isArray(snapshot.entities) || !Array.isArray(snapshot.events)
    || !Array.isArray(snapshot.needs_you) || !Array.isArray(snapshot.relations)) {
    invalid('SNAPSHOT_COLLECTIONS_MISSING');
  }
  const coverage = snapshotCoverage(snapshot);
  const eventIds = new Set<string>();
  const events = snapshot.events.map((value): AtlasObservedEvent => {
    const event = record(value);
    const id = text(event?.id);
    const kind = text(event?.kind)?.toUpperCase();
    if (!event || !id || !kind || !EVENT_KINDS.has(kind)) invalid('EVENT_IDENTITY_INVALID');
    if (eventIds.has(id)) invalid('EVENT_ID_DUPLICATE');
    eventIds.add(id);
    if (![event.x, event.y, event.z, event.intensity].every(value => typeof value === 'number' && Number.isFinite(value))) {
      invalid('EVENT_GEOMETRY_INVALID');
    }
    return {
      ...event,
      id,
      kind,
      x: event.x as number,
      y: event.y as number,
      z: event.z as number,
      intensity: event.intensity as number,
      provenance: {
        event_id: id,
        role: 'DERIVED_FROM_TOWER_SNAPSHOT',
        source_revision: snapshot.tower_revision as string,
        projection_fingerprint: sourceFingerprint,
      },
    } as AtlasObservedEvent;
  });

  const needsYouIds = new Set(snapshot.needs_you.flatMap(value => {
    const item = record(value);
    const id = text(item?.entity_id) || text(item?.entity);
    return id ? [id] : [];
  }));
  const entityIds = new Set<string>();
  const entities = snapshot.entities.map((value): AtlasObservedEntity => {
    const entity = record(value);
    const id = text(entity?.id);
    if (!entity || !id) invalid('ENTITY_IDENTITY_INVALID');
    if (entityIds.has(id)) invalid('ENTITY_ID_DUPLICATE');
    entityIds.add(id);
    const source = record(entity.source);
    const entityFingerprint = text(source?.projection_fingerprint);
    if (entityFingerprint && entityFingerprint.toLowerCase() !== sourceFingerprint.toLowerCase()) {
      invalid('ENTITY_FINGERPRINT_MISMATCH');
    }
    const layout = record(entity.layout);
    if (!layout || ![layout.x, layout.y, layout.z].every(value => typeof value === 'number' && Number.isFinite(value))) {
      invalid('ENTITY_LAYOUT_INVALID');
    }
    const observedEvents = events.filter(event => (event.entity === id || event.entity === entity.canonical_id)
      && (validDate(event.occurred_at) || validDate(event.timestamp)));
    const lastEvent = observedEvents.sort((a, b) => {
      const aAt = Date.parse(a.occurred_at || a.timestamp || '');
      const bAt = Date.parse(b.occurred_at || b.timestamp || '');
      return (Number.isFinite(bAt) ? bAt : -1) - (Number.isFinite(aAt) ? aAt : -1);
    })[0];
    return {
      ...entity,
      id,
      observation: observationFor(
        entity,
        snapshot,
        sourceFingerprint,
        observedAt,
        coverage,
        needsYouIds.has(id) || (text(entity.canonical_id) ? needsYouIds.has(text(entity.canonical_id)!) : false),
        lastEvent,
      ),
    } as AtlasObservedEntity;
  });

  return {
    ...snapshot,
    contract: 'NEXO_ONE_GALAXY_V1',
    snapshot_id: snapshot.snapshot_id as string,
    generated_at: snapshot.generated_at,
    tower_revision: snapshot.tower_revision,
    fingerprint: snapshot.fingerprint,
    provenance: { ...provenance, authority: 'TOWER_V06', source_fingerprint: sourceFingerprint },
    entities,
    events,
    needs_you: snapshot.needs_you as AtlasObservedGalaxySnapshot['needs_you'],
    relations: snapshot.relations,
    stats: record(snapshot.stats) || {},
    observed_at: observedAt,
    freshness: 'SNAPSHOT',
    coverage,
  } as AtlasObservedGalaxySnapshot;
}

/** Reducer ignores late requests and keeps the last valid snapshot through every failed read. */
export function transitionAtlasObservation(
  state: AtlasObservationState,
  action: AtlasObservationAction,
): AtlasObservationState {
  if (action.type === 'REQUEST') {
    if (action.request_id < state.request_id) return state;
    return {
      ...state,
      status: 'LOADING',
      requested_fingerprint: action.fingerprint,
      request_id: action.request_id,
      error_code: null,
    };
  }

  if (action.request_id !== state.request_id) return state;
  if (action.type === 'REJECT') {
    return {
      ...state,
      status: state.snapshot ? 'STALE' : 'UNAVAILABLE',
      error_code: action.code,
    };
  }

  const candidateFingerprint = action.snapshot.provenance.source_fingerprint;
  if (!state.requested_fingerprint || candidateFingerprint.toLowerCase() !== state.requested_fingerprint.toLowerCase()) {
    return {
      ...state,
      status: state.snapshot ? 'STALE' : 'UNAVAILABLE',
      error_code: 'FINGERPRINT_MISMATCH',
    };
  }
  if (action.snapshot.coverage !== 'COMPLETE') {
    return { ...state, status: 'PARTIAL', error_code: 'PARTIAL_COVERAGE' };
  }
  if (state.snapshot && Date.parse(action.snapshot.generated_at) < Date.parse(state.snapshot.generated_at)) {
    return { ...state, status: 'STALE', error_code: 'OUT_OF_ORDER_SNAPSHOT' };
  }

  return { ...state, snapshot: action.snapshot, status: 'AVAILABLE', error_code: null };
}
