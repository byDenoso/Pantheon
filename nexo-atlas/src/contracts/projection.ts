export type ProjectionDomain = 'NEXO'|'COSMOLOGY'|'OLYMPUS'|'ENGINEERING'|'PERSONAL'|'SYSTEM';
export type ProjectionAuthorityClass = 'CANONICAL'|'PROVIDER'|'DERIVED';
export type ProjectionState = 'LIVE'|'SNAPSHOT'|'STALE'|'DEGRADED'|'BLOCKED';
export type ProjectionSource = 'NEXO_SSOT'|'ACTION_REGISTER'|'GITHUB'|'VERCEL';

export interface ProjectionFreshness {
  state: 'LIVE'|'SNAPSHOT'|'STALE'|'UNKNOWN';
  observed_at: string|null;
  expires_at: string|null;
  age_ms: number|null;
}

export interface ProjectionEnvelope<T = unknown> {
  entity_id: string;
  domain: ProjectionDomain;
  authority_class: ProjectionAuthorityClass;
  source_ref: string;
  source_revision: string;
  fingerprint: string;
  freshness: ProjectionFreshness;
  derivation_rule: string;
  state: ProjectionState;
  source: ProjectionSource;
  checked_at: string;
  projection_role: 'NON_AUTHORITATIVE';
  payload?: T;
  error?: { code:string; message:string };
}

export interface UniversalProjectionState {
  contract: 'ProjectionEnvelope/v1';
  bus: 'Pantheon/UniversalProjectionBus';
  fingerprint: string;
  generated_at: string;
  state: ProjectionState;
  sources: {id:ProjectionSource; state:ProjectionState; revision:string; count:number}[];
  envelopes: ProjectionEnvelope[];
}
