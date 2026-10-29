export const ATLAS_OBSERVATION_CONTRACT = 'ATLAS_OBSERVATION_V1' as const;

export type AtlasObservationFreshness = 'SNAPSHOT' | 'STALE' | 'UNKNOWN' | 'UNAVAILABLE';
export type AtlasObservationCoverage = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';

/** A public, point-in-time observation. It never grants authority or implies a live run. */
export interface AtlasObservationV1 {
  contract: typeof ATLAS_OBSERVATION_CONTRACT;
  entity_id: string;
  entity_kind: string;
  scientific_state: string;
  attempt_state: string;
  review_state: string;
  decision_required: boolean;
  source_revision: string;
  projection_fingerprint: string;
  last_event_id: string | null;
  last_event_at: string | null;
  observed_at: string;
  freshness: AtlasObservationFreshness;
  coverage: AtlasObservationCoverage;
  access: 'PUBLIC_PROJECTION';
}

export interface AtlasDerivedEventProvenanceV1 {
  event_id: string;
  role: 'DERIVED_FROM_TOWER_SNAPSHOT';
  source_revision: string;
  projection_fingerprint: string;
}

export interface AtlasEntitySource {
  authority?: string;
  repository?: string;
  revision?: string;
  projection_fingerprint?: string;
  collection?: string;
  canonical_id?: string;
  derivation?: string;
}

export interface AtlasPublishedEntity {
  id: string;
  canonical_id?: string;
  kind?: string;
  domain?: string | null;
  visual_domain?: string | null;
  subdomain?: string | null;
  campaign_id?: string | null;
  test_group_id?: string | null;
  status?: string | null;
  scientific_state?: string | null;
  attempt_state?: string | null;
  execution_phase?: string | null;
  review_state?: string | null;
  title?: string | null;
  plain?: string | null;
  meaning?: string | null;
  source?: AtlasEntitySource;
  layout?: { x?: number; y?: number; z?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface AtlasObservedEntity extends AtlasPublishedEntity {
  observation: AtlasObservationV1;
}

export type AtlasVisualEventKind = 'SUPERNOVA' | 'NOVA' | 'AGN' | 'HII' | 'REMNANT' | 'FLARE';

export interface AtlasPublishedEvent {
  id: string;
  kind: AtlasVisualEventKind;
  label: string;
  domain?: string;
  entity?: string | null;
  reason?: string;
  x: number;
  y: number;
  z: number;
  intensity: number;
  timestamp?: string;
  occurred_at?: string;
  [key: string]: unknown;
}

export interface AtlasObservedEvent extends AtlasPublishedEvent {
  provenance: AtlasDerivedEventProvenanceV1;
}

export interface AtlasObservedGalaxySnapshot {
  contract: 'NEXO_ONE_GALAXY_V1';
  snapshot_id: string;
  generated_at: string;
  tower_revision: string;
  fingerprint: string;
  provenance: {
    authority: 'TOWER_V06';
    source_fingerprint: string;
    [key: string]: unknown;
  };
  entities: AtlasObservedEntity[];
  events: AtlasObservedEvent[];
  needs_you: Array<{ entity_id?: string | null; entity?: string | null; [key: string]: unknown }>;
  relations: unknown[];
  morphology?: Record<string, unknown> | null;
  stats: Record<string, unknown>;
  observed_at: string;
  freshness: 'SNAPSHOT';
  coverage: AtlasObservationCoverage;
  [key: string]: unknown;
}
