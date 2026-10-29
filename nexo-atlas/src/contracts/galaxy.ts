// NEXO_ONE_GALAXY_V1 — the projection contract consumed by the galaxy frontend.
//
// This is a derived, presentation-only view over SystemState (src/contracts/system.ts),
// which is itself the canonical read model NEXO ONE already fetches from the Tower
// through GET /api/system (see src/data/adapters/remote.ts). Nothing here is a second
// source of truth: every field is either copied from SystemState or computed from it.
//
// The Galaxy Visual Compiler (src/viewmodels/galaxyCompiler.ts) is the only place
// allowed to produce a GalaxySnapshot. It may derive position, grouping, visual class,
// priority and LOD hints; it must never invent status, domain, relation, hypothesis,
// test or blocker data that SystemState does not already carry.

import type { Domain, EntityState, GraphNodeType, RelationKind } from './system.ts';

export const GALAXY_CONTRACT = 'NEXO_ONE_GALAXY_V1' as const;

/** The three fixed arms plus the NEXO core. Stable across snapshots by construction. */
export const GALAXY_DOMAINS: Domain[] = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'];

/**
 * Radial hierarchy layer. Communicates distance-from-core, not visual color.
 * CORE is the NEXO hub. DOMAIN is one of the three arms. SUBDOMAIN groups
 * providers/capabilities under a domain. ENTITY is a leaf (test, action, claim,
 * memory, projection...). PERIPHERY holds experimental/low-consolidation nodes
 * (side quests, contested filaments) that visually sit further out.
 */
export type GalaxyLayer = 'CORE' | 'DOMAIN' | 'SUBDOMAIN' | 'ENTITY' | 'PERIPHERY';

/**
 * Visual taxonomy — a projection of GraphNodeType, not a replacement for it.
 * `OTHER` covers any canonical type this taxonomy has not been extended for yet,
 * so the compiler never has to drop or misclassify an entity to fit the map.
 */
export type GalaxyKind =
  | 'DOMAIN' | 'SUBDOMAIN' | 'TEST' | 'HYPOTHESIS' | 'CAPABILITY'
  | 'AUTOMATION' | 'WORK' | 'RESULT' | 'OTHER';

export interface GalaxyPosition { x: number; y: number; z: number }

/** Deterministic, hash-derived layout hint. Never Math.random(); same input -> same output. */
export interface GalaxyLayoutHint {
  layer: GalaxyLayer;
  position: GalaxyPosition;
  /** Visual size class driven by hierarchy (domain > subdomain > entity), not by state. */
  weight: number;
  /** Presentation-only grouping; does not exist in the canonical Tower taxonomy. */
  derived: true;
}

export interface GalaxyProvenance {
  source_ref: string;
  source_revision: string;
  fingerprint: string;
  authority_class: string;
}

export interface GalaxyEntity {
  id: string;
  kind: GalaxyKind;
  /** The canonical Tower type this entity was projected from. */
  canonical_type: GraphNodeType;
  domain: Domain;
  subdomain_id: string | null;
  status: EntityState;
  title: string;
  summary: string;
  /** Higher = closer to the core / more structurally important. Purely presentational. */
  importance: number;
  provenance: GalaxyProvenance;
  layout: GalaxyLayoutHint;
}

export interface GalaxySubdomain {
  id: string;
  domain: Domain;
  kind: GraphNodeType;
  title: string;
  entity_count: number;
  layout: GalaxyLayoutHint;
}

export interface GalaxyRelation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  weight: number;
  /** True for relations synthesized by the compiler for layout (e.g. domain -> subdomain
   * grouping edges) rather than copied verbatim from a canonical GraphEdge. */
  derived: boolean;
}

/**
 * Needs You is intentionally strict: only entries the Tower already models as an
 * explicit human gate (InboxItem) qualify. A queued test, a busy runtime or a
 * recoverable capability must never appear here — see galaxyCompiler.ts.
 */
export interface GalaxyNeedsYou {
  id: string;
  domain: Domain;
  title: string;
  question: string;
  why: string;
  entity_id: string | null;
  severity: string;
  due_at: string | null;
  source_ref: string;
}

export type GalaxyChangeType = 'ADDED' | 'REMOVED' | 'STATUS_CHANGED' | 'RELATION_CHANGED';

/** One delta between two GalaxySnapshots. Always derived by diffing real snapshots
 * (see diffGalaxySnapshots) — never fabricated from a single snapshot. */
export interface GalaxyChange {
  id: string;
  timestamp: string;
  entity_id: string;
  domain: Domain | null;
  change_type: GalaxyChangeType;
  summary: string;
  before: string | null;
  after: string | null;
  importance: number;
}

export type GalaxyPresetId = 'RESEARCH' | 'EXECUTION' | 'LEARNING' | 'ATTENTION' | 'FULL_SYSTEM';

export interface GalaxyPreset {
  id: GalaxyPresetId;
  label: string;
  kinds: GalaxyKind[];
}

export interface GalaxyStats {
  domains: number;
  subdomains: number;
  entities: number;
  relations: number;
  needs_you: number;
}

export interface GalaxySnapshot {
  contract: typeof GALAXY_CONTRACT;
  snapshot_id: string;
  generated_at: string;
  /** Revision marker for the Tower-derived read model this snapshot was compiled from.
   * SystemState does not carry a dedicated Tower commit field, so the projection bus
   * fingerprint (state.bus.fingerprint) is reused here under an explicit name. */
  tower_revision: string;
  fingerprint: string;
  domains: Domain[];
  subdomains: GalaxySubdomain[];
  entities: GalaxyEntity[];
  relations: GalaxyRelation[];
  needs_you: GalaxyNeedsYou[];
  changes: GalaxyChange[];
  presets: GalaxyPreset[];
  stats: GalaxyStats;
}
