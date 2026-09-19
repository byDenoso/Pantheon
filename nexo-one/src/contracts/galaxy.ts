export const NEXO_ONE_GALAXY_CONTRACT = 'NEXO_ONE_GALAXY_V1' as const;

export type GalaxyDomainId = 'NEXO' | 'SCIENCE' | 'ENGINEERING' | 'OLYMPUS';
export type GalaxyEntityKind = 'DOMAIN' | 'SUBDOMAIN' | 'TEST' | 'HYPOTHESIS' | 'CAPABILITY' | 'AUTOMATION' | 'WORK' | 'RESULT' | 'OTHER';
export type GalaxyLod = 'MACRO' | 'MEDIUM' | 'LOCAL' | 'FOCUS';

export interface GalaxyPoint25D {
  x: number;
  y: number;
  z: number;
  sector: string;
  lod: GalaxyLod;
}

export interface GalaxySourceRef {
  authority: 'TOWER_V06';
  repository: string;
  revision: string;
  projection_fingerprint: string;
  collection: string;
  canonical_id: string;
  source_domain: string | null;
  derivation: string;
}

export interface GalaxyEntity {
  id: string;
  canonical_id: string;
  kind: Exclude<GalaxyEntityKind, 'DOMAIN' | 'SUBDOMAIN'>;
  domain: GalaxyDomainId | null;
  visual_domain: GalaxyDomainId;
  subdomain: string | null;
  status: string | null;
  title: string;
  importance: number;
  priority: string | null;
  cluster_id: string;
  relation_refs: string[];
  visual_hints: { class: string; cluster_basis: string; lod: GalaxyLod };
  source: GalaxySourceRef;
  layout: Omit<GalaxyPoint25D, 'sector'> & { cluster_id: string; importance: number };
}

export interface GalaxySubdomain {
  id: string;
  kind: 'SUBDOMAIN';
  title: string;
  domain: GalaxyDomainId;
  canonical: boolean;
  source_basis: 'tower_subdomain' | 'campaign_id' | 'test_group_id' | 'capability_family' | 'entity_kind';
  entity_count: number;
  layout: GalaxyPoint25D;
}

export interface GalaxyRelation {
  id: string;
  kind: string;
  from: string;
  to: string;
  semantic: boolean;
  derived: boolean;
  status: string | null;
  summary: string;
  source: GalaxySourceRef | null;
}

export interface GalaxyNeedYou {
  entity: string;
  reason: string;
  status: string | null;
  importance: number;
}

export interface GalaxyChange {
  timestamp: string;
  entity: string;
  change_type: 'ADDED' | 'UPDATED' | 'REMOVED';
  summary: string;
  before: unknown;
  after: unknown;
  importance: number;
}

export interface NexoOneGalaxyV1 {
  contract: typeof NEXO_ONE_GALAXY_CONTRACT;
  snapshot_id: string;
  generated_at: string;
  tower_revision: string;
  fingerprint: string;
  provenance: {
    authority: 'TOWER_V06';
    repository: string;
    source_contract: string;
    source_fingerprint: string;
    event_cursor: string;
    projection_only: boolean;
    writeback: string;
  };
  domains: Array<{ id: string; domain: GalaxyDomainId; kind: 'DOMAIN'; title: string; canonical: boolean; layout: GalaxyPoint25D }>;
  subdomains: GalaxySubdomain[];
  entities: GalaxyEntity[];
  relations: GalaxyRelation[];
  needs_you: GalaxyNeedYou[];
  changes: GalaxyChange[];
  layout: {
    model: 'DETERMINISTIC_SEMANTIC_GALAXY_V1';
    core: 'NEXO';
    sectors: ['SCIENCE', 'ENGINEERING', 'OLYMPUS'];
    coordinate_system: 'CARTESIAN_2_5D';
    deterministic: true;
  };
  stats: {
    domains: number;
    subdomains: number;
    entities: number;
    relations: number;
    needs_you: number;
    changes: number;
    by_kind: Record<string, number>;
    by_visual_domain: Record<GalaxyDomainId, number>;
  };
}
