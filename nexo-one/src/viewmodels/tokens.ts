// Linguagem visual dos estados. Um estado tem um tom, e o tom é o mesmo em
// toda a interface: cockpit, Atlas, inspector e provenance.
import type {
  ActionStatus, CapabilityStatus, EntityState, FilamentStatus, FreshnessState,
  ProjectionState, ReadbackStatus, RunStatus, Severity, StepStatus, TruthStatus,
} from '../contracts/system.ts';

export type Tone = 'live' | 'snapshot' | 'stale' | 'degraded' | 'conflict' | 'blocked' | 'unknown';

const STATE_TONE: Record<string, Tone> = {
  // ProjectionState / TruthStatus
  LIVE: 'live', SNAPSHOT: 'snapshot', STALE: 'stale', STALE_DECLARATION: 'stale',
  DEGRADED: 'degraded', BLOCKED: 'blocked', CONFLICT: 'conflict', MISSING_PROVIDER: 'unknown',
  // CapabilityStatus — UNVERIFIED jamais é "parcial": é ausência de prova.
  PASS: 'live', UNVERIFIED: 'unknown', UNKNOWN: 'unknown', RETIRED_RUNTIME: 'stale',
  // RunStatus / StepStatus
  SUCCEEDED: 'live', OK: 'live', NO_OP: 'snapshot', RUNNING: 'snapshot', PENDING: 'snapshot',
  WARN: 'degraded', FAILED: 'degraded', FAIL: 'degraded', SKIPPED: 'unknown',
  // ReadbackStatus
  CONFIRMED: 'live', NOT_APPLICABLE: 'unknown',
  // ActionStatus
  PROPOSED: 'snapshot', ELIGIBLE: 'live', AWAITING_HUMAN: 'degraded',
  APPLIED: 'live', NO_OP_ALREADY_APPLIED: 'snapshot', WAITING_SIDE_QUEST: 'degraded',
  // FilamentStatus
  ESTABLISHED: 'live', PROVISIONAL: 'snapshot', CONTESTED: 'conflict', RETIRED: 'stale',
  // FreshnessState
  RECENT: 'live', AGING: 'degraded',
};

export const toneOf = (
  state: EntityState | ActionStatus | RunStatus | StepStatus | ReadbackStatus | FilamentStatus | FreshnessState,
): Tone => STATE_TONE[state] ?? 'unknown';

/** Rótulos em português. O estado técnico continua visível ao lado, nunca substituído. */
export const STATE_LABEL: Record<string, string> = {
  LIVE: 'Ao vivo', SNAPSHOT: 'Instantâneo', STALE: 'Leitura anterior',
  STALE_DECLARATION: 'Declaração vencida', DEGRADED: 'Degradado', BLOCKED: 'Bloqueado',
  CONFLICT: 'Conflito', MISSING_PROVIDER: 'Fonte ausente',
  PASS: 'Verificada', UNVERIFIED: 'Sem prova', UNKNOWN: 'Desconhecido', RETIRED_RUNTIME: 'Runtime retirado',
  SUCCEEDED: 'Concluída', NO_OP: 'Sem efeito', RUNNING: 'Em execução', FAILED: 'Falhou',
  OK: 'OK', WARN: 'Ressalva', FAIL: 'Falha', SKIPPED: 'Ignorada', PENDING: 'Pendente',
  CONFIRMED: 'Confirmado', NOT_APPLICABLE: 'Não se aplica',
  PROPOSED: 'Proposta', ELIGIBLE: 'Elegível', AWAITING_HUMAN: 'Aguarda você',
  APPLIED: 'Aplicada', NO_OP_ALREADY_APPLIED: 'Já aplicada', WAITING_SIDE_QUEST: 'Aguarda side quest',
  ESTABLISHED: 'Estabelecido', PROVISIONAL: 'Provisório', CONTESTED: 'Contestado', RETIRED: 'Retirado',
  RECENT: 'Recente', AGING: 'Envelhecendo',
  P0: 'P0', P1: 'P1', P2: 'P2', INFO: 'Info',
  LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto',
  DECIDIR: 'Decidir', APROVAR: 'Aprovar', RESPONDER: 'Responder',
  ESCOLHER: 'Escolher', FORNECER_DADO: 'Fornecer dado',
  TRUTH_OWNER: 'Truth Owner', DELEGATED: 'Delegada', DERIVED: 'Derivada',
  NON_AUTHORITATIVE: 'Não autoritativa',
  READ: 'Leitura', WRITE: 'Escrita', SCHEDULE: 'Agendamento', DEPLOY: 'Deploy', NOTIFY: 'Notificação',
  LOCAL: 'Local', GITHUB_ACTIONS: 'GitHub Actions', VERCEL: 'Vercel',
  NEXO_KERNEL: 'NEXO Kernel', HUMAN: 'Humano',
  DOMAIN: 'Domínio', ACTION: 'Ação', EFFECT: 'Efeito', CLAIM: 'Claim', TEST: 'Teste',
  MEMORY: 'Memória', CAPABILITY: 'Capability', PROVIDER: 'Provider', PROJECTION: 'Projeção',
  SIDE_QUEST: 'Side quest', FILAMENT: 'Filamento',
  OWNS: 'possui', PRODUCES: 'produz', VERIFIES: 'verifica', DEPENDS_ON: 'depende de',
  PROJECTS: 'projeta', CONTRADICTS: 'contradiz', SUPPORTS: 'sustenta',
  ROUTES_TO: 'roteia para', BLOCKS: 'bloqueia', DERIVES_FROM: 'deriva de',
  SEMANTIC: 'Semântica', PROCEDURAL: 'Procedural',
  OPEN: 'Aberta', WAITING: 'Aguardando', DONE: 'Concluída',
};

export const label = (value: string | null | undefined): string =>
  value ? STATE_LABEL[value] ?? value : '—';

export const SEVERITY_TONE: Record<Severity, Tone> = {
  P0: 'conflict', P1: 'degraded', P2: 'snapshot', INFO: 'live',
};

const SEVERITY_WEIGHT: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, INFO: 3 };
export const bySeverity = <T extends { severity: Severity }>(a: T, b: T): number =>
  SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];

export const isConflict = (state: EntityState): boolean => state === 'CONFLICT';

/** Estados que exigem que a UI diga explicitamente o que não sabe. */
export const NEEDS_EXPLANATION: Tone[] = ['stale', 'degraded', 'conflict', 'blocked', 'unknown'];

export const dateTime = (value?: string | null): string =>
  value
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        .format(new Date(value))
    : 'Sem leitura válida';

export const shortTime = (value?: string | null): string =>
  value ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

const capabilityTone: Record<CapabilityStatus, Tone> = {
  PASS: 'live', UNVERIFIED: 'unknown', UNKNOWN: 'unknown', RETIRED_RUNTIME: 'stale', BLOCKED: 'blocked',
};
export const capabilityToneOf = (status: CapabilityStatus): Tone => capabilityTone[status];

export const truthToneOf = (status: TruthStatus): Tone => toneOf(status);
export const projectionToneOf = (state: ProjectionState): Tone => toneOf(state);
