// Contratos consumidos pela UI do NEXO ONE e do Atlas.
// O frontend nunca é Truth Owner: tudo aqui é projeção não autoritativa.
// TRUTH -> Authority/Capability -> Action -> Effect/Readback -> Projection -> Interfaces

export type Domain = 'NEXO' | 'SCIENCE' | 'ENGINEERING' | 'OLYMPUS';
export const DOMAINS: Domain[] = ['NEXO', 'SCIENCE', 'ENGINEERING', 'OLYMPUS'];

export type AuthorityClass = 'TRUTH_OWNER' | 'DELEGATED' | 'DERIVED' | 'NON_AUTHORITATIVE';
export type Severity = 'P0' | 'P1' | 'P2' | 'INFO';
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH';

/** Estado de uma projeção. Uma projeção nunca é prova de verdade. */
export type ProjectionState =
  | 'LIVE' | 'SNAPSHOT' | 'STALE' | 'DEGRADED' | 'BLOCKED' | 'CONFLICT' | 'MISSING_PROVIDER';
export const PROJECTION_STATES: ProjectionState[] =
  ['LIVE', 'SNAPSHOT', 'STALE', 'DEGRADED', 'BLOCKED', 'CONFLICT', 'MISSING_PROVIDER'];

/** Idade da leitura, independente do estado. UNKNOWN nunca vira "recente". */
export type FreshnessState = 'LIVE' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN';
export interface Freshness {
  state: FreshnessState;
  observed_at: string | null;
  ttl_seconds: number | null;
}

export type ProjectionRole = 'COCKPIT' | 'ATLAS' | 'INTEGRITY' | 'LEARNING' | 'AUDIT';

/**
 * Unidade de transporte do Universal Projection Bus.
 * `authoritative` é literalmente `false`: nenhuma projeção decide verdade.
 */
export interface ProjectionEnvelope {
  entity_id: string;
  domain: Domain;
  authority_class: AuthorityClass;
  source_ref: string;
  source_revision: string;
  fingerprint: string;
  freshness: Freshness;
  derivation_rule: string;
  state: ProjectionState;
  checked_at: string;
  projection_role: ProjectionRole;
  authoritative: false;
  title: string;
  summary?: string;
}

export type TruthStatus =
  | 'LIVE' | 'DEGRADED' | 'CONFLICT' | 'STALE_DECLARATION' | 'MISSING_PROVIDER' | 'BLOCKED';
export const TRUTH_STATUSES: TruthStatus[] =
  ['LIVE', 'DEGRADED', 'CONFLICT', 'STALE_DECLARATION', 'MISSING_PROVIDER', 'BLOCKED'];

export interface TruthFinding {
  id: string;
  domain: Domain;
  status: TruthStatus;
  source_ref: string;
  fingerprint: string;
  checked_at: string;
  authority: { owner: string; class: AuthorityClass };
  provider: { expected: string; observed: string | null };
  capability: string | null;
  severity: Severity;
  explanation: string;
  freshness: Freshness;
}

export type RequiredOperation = 'READ' | 'WRITE' | 'SCHEDULE' | 'DEPLOY' | 'NOTIFY';
export type Runtime = 'LOCAL' | 'GITHUB_ACTIONS' | 'VERCEL' | 'NEXO_KERNEL' | 'HUMAN';

export type ReadbackStatus = 'CONFIRMED' | 'PENDING' | 'FAILED' | 'UNVERIFIED' | 'NOT_APPLICABLE';
export interface Readback {
  status: ReadbackStatus;
  provider: string | null;
  observed_fingerprint: string | null;
  checked_at: string | null;
  explanation: string;
}

export type ActionStatus =
  | 'PROPOSED' | 'ELIGIBLE' | 'AWAITING_HUMAN' | 'RUNNING' | 'APPLIED'
  | 'NO_OP_ALREADY_APPLIED' | 'WAITING_SIDE_QUEST' | 'BLOCKED' | 'FAILED';

export type InboxKind = 'DECIDIR' | 'APROVAR' | 'RESPONDER' | 'ESCOLHER' | 'FORNECER_DADO';
export const INBOX_KINDS: InboxKind[] = ['DECIDIR', 'APROVAR', 'RESPONDER', 'ESCOLHER', 'FORNECER_DADO'];

export interface HumanGate {
  kind: InboxKind;
  question: string;
  options?: { id: string; label: string; consequence: string }[];
  due_at?: string;
}

export interface ActionRecord {
  action_id: string;
  lane: Domain;
  title: string;
  status: ActionStatus;
  required_operation: RequiredOperation;
  capability_id: string | null;
  runtime: Runtime;
  effect_key: string | null;
  input_fingerprint: string;
  readback: Readback;
  receipt_ref: string | null;
  blocker: string | null;
  next_action: string;
  risk: Risk;
  reversible: boolean;
  /** Por que o NEXO pode (ou não pode) resolver isto sozinho. */
  eligibility: string;
  human_gate: HumanGate | null;
  source_ref: string;
  fingerprint: string;
  checked_at: string;
  freshness: Freshness;
  updated_at: string;
}

export interface InboxItem {
  id: string;
  kind: InboxKind;
  domain: Domain;
  title: string;
  question: string;
  why: string;
  action_id: string | null;
  options: { id: string; label: string; consequence: string }[];
  severity: Severity;
  due_at: string | null;
  source_ref: string;
  fingerprint: string;
  checked_at: string;
  freshness: Freshness;
}

/** UNVERIFIED nunca é "parcialmente funcional": é ausência de prova. */
export type CapabilityStatus = 'PASS' | 'UNVERIFIED' | 'UNKNOWN' | 'BLOCKED';
export const CAPABILITY_STATUSES: CapabilityStatus[] = ['PASS', 'UNVERIFIED', 'UNKNOWN', 'BLOCKED'];

export interface Capability {
  capability_id: string;
  label: string;
  domain: Domain;
  runtime: Runtime;
  operation: RequiredOperation;
  status: CapabilityStatus;
  risk: Risk;
  provider: string;
  last_verified_at: string | null;
  evidence_ref: string | null;
  explanation: string;
}

export type ExecutionStage = 'ACTION' | 'CAPABILITY' | 'RUNTIME' | 'EFFECT' | 'READBACK';
export const EXECUTION_STAGES: ExecutionStage[] = ['ACTION', 'CAPABILITY', 'RUNTIME', 'EFFECT', 'READBACK'];
export type StepStatus = 'OK' | 'WARN' | 'FAIL' | 'SKIPPED' | 'PENDING';

export interface ExecutionStep {
  stage: ExecutionStage;
  label: string;
  status: StepStatus;
  at: string | null;
  fingerprint: string | null;
  detail: string;
}

export type RunStatus = 'SUCCEEDED' | 'FAILED' | 'NO_OP' | 'RUNNING' | 'BLOCKED';

export interface ExecutionRun {
  run_id: string;
  action_id: string;
  lane: Domain;
  title: string;
  started_at: string;
  ended_at: string | null;
  status: RunStatus;
  effect_key: string | null;
  capability_id: string | null;
  runtime: Runtime;
  retries: number;
  receipt_ref: string | null;
  steps: ExecutionStep[];
  readback: Readback;
}

export interface BusSource {
  id: string;
  label: string;
  source_revision: string | null;
  freshness: Freshness;
  state: ProjectionState;
  envelopes: number;
}

export interface BusConsumer {
  id: string;
  label: string;
  state: ProjectionState;
  last_pull_at: string | null;
}

export interface ProjectionBus {
  fingerprint: string;
  generated_at: string;
  state: ProjectionState;
  envelope_count: number;
  sources: BusSource[];
  consumers: BusConsumer[];
}

export interface LaneSnapshot {
  domain: Domain;
  current_state: string;
  next_action: string;
  last_effect: { effect_key: string; at: string; status: RunStatus } | null;
  blockers: string[];
  side_quests: { id: string; title: string; status: 'OPEN' | 'WAITING' | 'DONE' }[];
  freshness: Freshness;
  state: ProjectionState;
  source_ref: string;
  fingerprint: string;
  checked_at: string;
}

export type GraphNodeType =
  | 'DOMAIN' | 'ACTION' | 'EFFECT' | 'CLAIM' | 'TEST' | 'MEMORY'
  | 'CAPABILITY' | 'PROVIDER' | 'PROJECTION' | 'SIDE_QUEST' | 'FILAMENT';
export const GRAPH_NODE_TYPES: GraphNodeType[] = [
  'DOMAIN', 'ACTION', 'EFFECT', 'CLAIM', 'TEST', 'MEMORY',
  'CAPABILITY', 'PROVIDER', 'PROJECTION', 'SIDE_QUEST', 'FILAMENT',
];

export type RelationKind =
  | 'OWNS' | 'PRODUCES' | 'VERIFIES' | 'DEPENDS_ON' | 'PROJECTS'
  | 'CONTRADICTS' | 'SUPPORTS' | 'ROUTES_TO' | 'BLOCKS' | 'DERIVES_FROM';
export const RELATION_KINDS: RelationKind[] = [
  'OWNS', 'PRODUCES', 'VERIFIES', 'DEPENDS_ON', 'PROJECTS',
  'CONTRADICTS', 'SUPPORTS', 'ROUTES_TO', 'BLOCKS', 'DERIVES_FROM',
];

/** Estado unificado de nó: cobre projeção, verdade e capability numa só escala visual. */
export type EntityState = ProjectionState | TruthStatus | CapabilityStatus;

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  domain: Domain;
  state: EntityState;
  authority_class: AuthorityClass;
  source_ref: string;
  source_revision: string;
  fingerprint: string;
  freshness: Freshness;
  checked_at: string;
  summary: string;
  severity?: Severity;
  capability_id?: string;
  runtime?: Runtime;
  evidence?: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  weight: number;
  explanation: string;
}

export type FilamentStatus = 'ESTABLISHED' | 'PROVISIONAL' | 'CONTESTED' | 'RETIRED';

export interface Filament {
  id: string;
  label: string;
  domain: Domain;
  kind: 'SEMANTIC' | 'PROCEDURAL';
  weight: number;
  support: number;
  contradiction: number;
  status: FilamentStatus;
  evidence: string[];
  source_ref: string;
  boundary: string;
  from_label: string;
  to_label: string;
}

export interface ProviderHealth {
  id: string;
  label: string;
  expected_for: Domain[];
  state: ProjectionState;
  capabilities: string[];
  last_success_at: string | null;
  checked_at: string;
  explanation: string;
}

/** Raiz consumida por NEXO ONE e Atlas. Mesmo estado, projeções diferentes. */
export interface SystemState {
  contract_version: '1';
  scenario_id: string;
  scenario_label: string;
  generated_at: string;
  global_state: ProjectionState;
  bus: ProjectionBus;
  envelopes: ProjectionEnvelope[];
  findings: TruthFinding[];
  actions: ActionRecord[];
  inbox: InboxItem[];
  capabilities: Capability[];
  runs: ExecutionRun[];
  lanes: LaneSnapshot[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  filaments: Filament[];
  providers: ProviderHealth[];
}

/** Estado de carregamento de qualquer superfície. Erro nunca vira skeleton eterno. */
export type LoadState = 'LOADING' | 'READY' | 'PARTIAL' | 'ERROR' | 'UNAUTHORIZED' | 'EMPTY';
