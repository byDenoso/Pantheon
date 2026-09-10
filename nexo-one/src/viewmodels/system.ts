// View models puros. Nenhum acesso a rede, nenhuma dependência de React.
// Tudo aqui é testável isoladamente.
import type {
  ActionRecord, AuthorityClass, Capability, CapabilityStatus, Domain, ExecutionRun, Freshness,
  InboxItem, InboxKind, LaneSnapshot, ProjectionRole, ProjectionState, Runtime, Severity,
  SystemState, TruthFinding,
} from '../contracts/system.ts';
import { DOMAINS, INBOX_KINDS } from '../contracts/system.ts';
import { bySeverity } from './tokens.ts';

/** Forma normalizada de proveniência: vale para qualquer entidade da interface. */
export interface Provenance {
  source_ref: string;
  source_revision: string | null;
  fingerprint: string;
  authority_class: AuthorityClass | null;
  checked_at: string | null;
  freshness: Freshness | null;
  derivation_rule: string | null;
  projection_role: ProjectionRole | null;
}

type ProvenanceInput = Partial<Provenance> & { source_ref: string; fingerprint: string };

export const provenanceOf = (input: ProvenanceInput): Provenance => ({
  source_ref: input.source_ref,
  source_revision: input.source_revision ?? null,
  fingerprint: input.fingerprint,
  authority_class: input.authority_class ?? null,
  checked_at: input.checked_at ?? null,
  freshness: input.freshness ?? null,
  derivation_rule: input.derivation_rule ?? null,
  projection_role: input.projection_role ?? null,
});

export interface DomainSummary {
  domain: Domain;
  finding: TruthFinding | null;
  lane: LaneSnapshot | null;
  state: ProjectionState;
  severity: Severity;
  freshness: Freshness | null;
  blockers: string[];
}

export interface GlobalSummary {
  state: ProjectionState;
  generated_at: string;
  domains: DomainSummary[];
  conflicts: TruthFinding[];
  blockers: { source: string; explanation: string }[];
  degradedCapabilities: Capability[];
  lastRead: string | null;
  needsHuman: number;
  resolvable: number;
}

const laneStateOf = (finding: TruthFinding | null, lane: LaneSnapshot | null): ProjectionState => {
  if (finding?.status === 'CONFLICT') return 'CONFLICT';
  if (finding?.status === 'MISSING_PROVIDER') return 'MISSING_PROVIDER';
  if (finding?.status === 'BLOCKED') return 'BLOCKED';
  if (lane) return lane.state;
  if (finding?.status === 'STALE_DECLARATION') return 'STALE';
  if (finding?.status === 'DEGRADED') return 'DEGRADED';
  return 'LIVE';
};

export function globalSummary(state: SystemState): GlobalSummary {
  const domains: DomainSummary[] = DOMAINS.map(domain => {
    const finding = state.findings.find(f => f.domain === domain) ?? null;
    const lane = state.lanes.find(l => l.domain === domain) ?? null;
    return {
      domain, finding, lane,
      state: laneStateOf(finding, lane),
      severity: finding?.severity ?? 'INFO',
      freshness: lane?.freshness ?? finding?.freshness ?? null,
      blockers: lane?.blockers ?? [],
    };
  });
  const reads = state.providers.map(p => p.last_success_at).filter((v): v is string => !!v).sort();
  return {
    state: state.global_state,
    generated_at: state.generated_at,
    domains,
    conflicts: state.findings.filter(f => f.status === 'CONFLICT').sort(bySeverity),
    blockers: [
      ...state.lanes.flatMap(l => l.blockers.map(explanation => ({ source: l.domain, explanation }))),
      ...state.actions.filter(a => a.blocker).map(a => ({ source: a.action_id, explanation: a.blocker as string })),
    ],
    degradedCapabilities: state.capabilities.filter(c => c.status !== 'PASS' && c.status !== 'RETIRED_RUNTIME'),
    lastRead: reads.length ? reads[reads.length - 1] : null,
    needsHuman: state.inbox.length,
    resolvable: resolvableActions(state).length,
  };
}

export type InboxGroup = { kind: InboxKind; items: InboxItem[] };

/** Só entra no Human Inbox o que exige intervenção humana. Nada mais. */
export function inboxGroups(state: SystemState): InboxGroup[] {
  return INBOX_KINDS
    .map(kind => ({ kind, items: state.inbox.filter(i => i.kind === kind).sort(bySeverity) }))
    .filter(group => group.items.length > 0);
}

const AUTONOMOUS_STATUSES = new Set(['ELIGIBLE', 'PROPOSED', 'NO_OP_ALREADY_APPLIED', 'RUNNING', 'APPLIED']);

/**
 * "NEXO pode resolver": ação sem gate humano, cuja capability não está bloqueada
 * e cujo efeito é reversível ou já verificado. Nunca inclui operação irreversível
 * com capability sem prova.
 */
export function resolvableActions(state: SystemState): ActionRecord[] {
  const capability = new Map(state.capabilities.map(c => [c.capability_id, c]));
  return state.actions.filter(action => {
    if (action.human_gate) return false;
    if (!AUTONOMOUS_STATUSES.has(action.status)) return false;
    const cap = action.capability_id ? capability.get(action.capability_id) : undefined;
    if (cap && (cap.status === 'BLOCKED' || cap.status === 'UNKNOWN' || cap.status === 'RETIRED_RUNTIME')) return false;
    if (!action.reversible && cap?.status !== 'PASS') return false;
    return true;
  });
}

export function humanActions(state: SystemState): ActionRecord[] {
  return state.actions.filter(a => a.human_gate || a.status === 'AWAITING_HUMAN');
}

export function blockedActions(state: SystemState): ActionRecord[] {
  return state.actions.filter(a => a.status === 'BLOCKED' || a.status === 'FAILED' || a.status === 'WAITING_SIDE_QUEST');
}

export interface CapabilityCell {
  domain: Domain;
  runtime: Runtime;
  capabilities: Capability[];
  status: CapabilityStatus;
}

const CAPABILITY_WEIGHT: Record<CapabilityStatus, number> = { PASS: 0, UNVERIFIED: 1, UNKNOWN: 2, RETIRED_RUNTIME: 3, BLOCKED: 4 };

/** Matriz domínio x runtime. O pior status da célula é o status exibido. */
export function capabilityMatrix(state: SystemState): { runtimes: Runtime[]; cells: CapabilityCell[] } {
  const runtimes = [...new Set(state.capabilities.map(c => c.runtime))]
    .sort((a, b) => a.localeCompare(b)) as Runtime[];
  const cells: CapabilityCell[] = [];
  for (const domain of DOMAINS) {
    for (const runtime of runtimes) {
      const capabilities = state.capabilities.filter(c => c.domain === domain && c.runtime === runtime);
      if (!capabilities.length) continue;
      const status = capabilities.reduce<CapabilityStatus>(
        (worst, c) => (CAPABILITY_WEIGHT[c.status] > CAPABILITY_WEIGHT[worst] ? c.status : worst), 'PASS');
      cells.push({ domain, runtime, capabilities, status });
    }
  }
  return { runtimes, cells };
}

export const capabilityCounts = (state: SystemState): Record<CapabilityStatus, number> => ({
  PASS: state.capabilities.filter(c => c.status === 'PASS').length,
  UNVERIFIED: state.capabilities.filter(c => c.status === 'UNVERIFIED').length,
  UNKNOWN: state.capabilities.filter(c => c.status === 'UNKNOWN').length,
  RETIRED_RUNTIME: state.capabilities.filter(c => c.status === 'RETIRED_RUNTIME').length,
  BLOCKED: state.capabilities.filter(c => c.status === 'BLOCKED').length,
});

export const runsForAction = (state: SystemState, actionId: string): ExecutionRun[] =>
  state.runs.filter(r => r.action_id === actionId);

export const actionById = (state: SystemState, actionId: string | null): ActionRecord | null =>
  actionId ? state.actions.find(a => a.action_id === actionId) ?? null : null;

export const capabilityById = (state: SystemState, id: string | null): Capability | null =>
  id ? state.capabilities.find(c => c.capability_id === id) ?? null : null;

/** Lanes operacionais exibidas no cockpit, na ordem pedida pelo produto. */
export const OPERATIONAL_LANES: Domain[] = ['SCIENCE', 'ENGINEERING', 'OLYMPUS'];

export const laneViews = (state: SystemState, domains: Domain[] = OPERATIONAL_LANES): LaneSnapshot[] =>
  domains.map(domain => state.lanes.find(l => l.domain === domain)).filter((l): l is LaneSnapshot => !!l);

export const nextActionsFor = (state: SystemState, domain: Domain): ActionRecord[] =>
  state.actions.filter(a => a.lane === domain);

export interface IntegrityIssue {
  id: string;
  severity: Severity;
  title: string;
  explanation: string;
  source_ref: string;
  domain: Domain;
}

/** Auditoria de integridade: o que a interface consegue provar e o que não consegue. */
export function integrityIssues(state: SystemState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const finding of state.findings) {
    if (finding.status === 'LIVE') continue;
    issues.push({
      id: `finding:${finding.id}`, severity: finding.severity, domain: finding.domain,
      title: `${finding.domain} · ${finding.status}`, explanation: finding.explanation,
      source_ref: finding.source_ref,
    });
  }
  for (const capability of state.capabilities) {
    if (capability.status === 'PASS' || capability.status === 'RETIRED_RUNTIME') continue;
    issues.push({
      id: `capability:${capability.capability_id}`,
      severity: capability.status === 'BLOCKED' ? 'P1' : 'P2',
      domain: capability.domain,
      title: `${capability.capability_id} · ${capability.status}`,
      explanation: capability.explanation,
      source_ref: `capability://${capability.capability_id}`,
    });
  }
  for (const run of state.runs) {
    if (run.readback.status !== 'FAILED') continue;
    issues.push({
      id: `readback:${run.run_id}`, severity: 'P1', domain: run.lane,
      title: `${run.effect_key ?? run.run_id} · readback FAILED`,
      explanation: run.readback.explanation,
      source_ref: run.receipt_ref ?? `action://register/${run.action_id}`,
    });
  }
  return issues.sort(bySeverity);
}
