// Locked product contract: the normalized data envelope every screen consumes.
// No UI component may call fetch/axios directly -- everything goes through an
// AtlasDataSource implementation, so a component can never paint UNKNOWN/STALE data
// as a green success by omission.
import type { LearnerFilament } from '../graph-engine/learner-overlay';

export type DataEnvelopeState = 'READY' | 'EMPTY' | 'STALE' | 'DATA_UNAVAILABLE' | 'API_ERROR' | 'UNAUTHORIZED';
export type Freshness = 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' | 'UNKNOWN';

export type Provenance = {
  source?: string;
  sourceId?: string;
  sourceRef?: string;
  url?: string;
  observedAt?: string;
  label?: string;
};

export type DataIssueSeverity = 'INFO' | 'WARNING' | 'ERROR';

export type DataIssue = {
  code: string;
  severity: DataIssueSeverity;
  message: string;
};

export type DataEnvelope<T> = {
  data: T | null;
  state: DataEnvelopeState;
  freshness: Freshness;
  fingerprint?: string;
  sourceVersion?: string;
  observedAt?: string;
  provenance: Provenance[];
  issues: DataIssue[];
};

export function emptyEnvelope<T>(state: DataEnvelopeState = 'DATA_UNAVAILABLE', issues: DataIssue[] = []): DataEnvelope<T> {
  return { data: null, state, freshness: 'UNKNOWN', provenance: [], issues };
}

// Graph entities: the map renders exactly these two types, per the locked map contract
// in graph-entity-contract.ts. This type exists so any code building/consuming a map
// data payload is checked against it at compile time, not just at the runtime
// normalizer boundary.
export type DomainNode = { id: string; type: 'DOMAIN'; label: string; summary?: string };
export type CampaignNode = { id: string; type: 'CAMPAIGN'; label: string; domainId?: string | null; status?: string; summary?: string };
export type GraphEntity = DomainNode | CampaignNode;

export type CampaignDetail = CampaignNode & {
  provenance: Provenance[];
  relations: Array<{ id: string; targetId: string; type: string }>;
};

export type SearchResultKind = 'DOMAIN' | 'CAMPAIGN' | 'TEST' | 'CLAIM' | 'DATASET' | 'ARTIFACT';

export type SearchResult = {
  id: string;
  kind: SearchResultKind;
  label: string;
  // Present only for DOMAIN/CAMPAIGN results, which move the map camera.
  graphId?: string;
  // Present for every non-graph kind (TEST/CLAIM/DATASET/ARTIFACT): where the search
  // should navigate to *instead* of the map. The map contract forbids creating a node
  // for these, so a result of this kind must always carry a textual destination.
  targetRoute?: string;
};

export { type LearnerFilament, type LearnerState } from '../graph-engine/learner-overlay';

export type SyncOutcome = 'UPDATED' | 'NO_CHANGE' | 'PARTIAL' | 'FAILED';

export type SyncReceipt = {
  requestId: string;
  startedAt: string;
  completedAt: string;
  outcome: SyncOutcome;
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
  readbackVerified: boolean;
  sources: Array<{ id: string; state: string; observedAt?: string }>;
  errors: DataIssue[];
};

export type HealthPlaneId =
  | 'CANONICAL_STATE'
  | 'WRITE_CONTRACT'
  | 'SCHEDULER'
  | 'EXECUTION'
  | 'API'
  | 'DEPLOYMENT'
  | 'DOCUMENTATION'
  | 'ESTATE_HYGIENE';

export type HealthPlaneStatus = 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';

export type HealthPlane = {
  id: HealthPlaneId;
  status: HealthPlaneStatus;
  reason: string;
  observedAt?: string;
  provenance: Provenance[];
};

export type BlockerSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type Blocker = {
  id: string;
  severity: BlockerSeverity;
  summary: string;
  effect: string;
  observedAt?: string;
  provenance: Provenance[];
};

export type ActiveWorkItem = {
  id: string;
  status: 'READY' | 'CHECKPOINTED' | 'WAIT_DEPENDENCY' | 'BLOCKED' | 'HUMAN_GATE';
  priority?: string;
  owner?: string;
  note?: string;
};

export type CockpitSnapshot = {
  planes: HealthPlane[];
  blockers: Blocker[];
  activeWork: ActiveWorkItem[];
  lastSync: SyncReceipt | null;
  learner: LearnerFilament[];
};

export type ActivityEvent = {
  id: string;
  stage: 'INTENT' | 'EXECUTION' | 'RECEIPT' | 'MUTATION' | 'READBACK' | 'HANDOFF';
  state: 'OK' | 'PENDING' | 'FAILED';
  observedAt?: string;
  provenance: Provenance[];
};

export type LaboratoryQuery = { kind?: SearchResultKind; text?: string };
export type LaboratoryRecord = { id: string; kind: SearchResultKind; label: string; status?: string; provenance: Provenance[] };
export type PrivateEntityDetail = { id: string; kind: SearchResultKind; label: string; fields: Record<string, unknown>; provenance: Provenance[] };

export interface AtlasDataSource {
  getDomains(): Promise<DataEnvelope<DomainNode[]>>;
  getDomainCampaigns(domainId: string): Promise<DataEnvelope<CampaignNode[]>>;
  getCampaign(campaignId: string): Promise<DataEnvelope<CampaignDetail>>;
  search(query: string): Promise<DataEnvelope<SearchResult[]>>;
  getLearnerLayer(): Promise<DataEnvelope<LearnerFilament[]>>;
}

export interface PrivateAtlasDataSource extends AtlasDataSource {
  getCockpit(): Promise<DataEnvelope<CockpitSnapshot>>;
  getActivity(): Promise<DataEnvelope<ActivityEvent[]>>;
  getLaboratory(query: LaboratoryQuery): Promise<DataEnvelope<LaboratoryRecord[]>>;
  getPrivateEntity(id: string): Promise<DataEnvelope<PrivateEntityDetail>>;
  sync(): Promise<SyncReceipt>;
}
