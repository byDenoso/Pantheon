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

/** Rótulos legíveis para os valores que a interface mostra como situação. */
export const STATE_LABEL: Record<string, string> = {
  LIVE: 'Ao vivo', SNAPSHOT: 'Instantâneo', STALE: 'Leitura anterior',
  STALE_DECLARATION: 'Declaração vencida', DEGRADED: 'Com limitações', BLOCKED: 'Bloqueado', AGING: 'Dados antigos', MISSING: 'Indisponível',
  CONFLICT: 'Conflito', MISSING_PROVIDER: 'Fonte ausente',
  PASS: 'Verificada', UNVERIFIED: 'Sem confirmação', UNKNOWN: 'Ainda não verificado', RETIRED_RUNTIME: 'Serviço desativado',
  SUCCEEDED: 'Concluída', NO_OP: 'Nenhuma alteração necessária', RUNNING: 'Em execução', FAILED: 'Falhou',
  OK: 'OK', WARN: 'Ressalva', FAIL: 'Falha', SKIPPED: 'Ignorada', PENDING: 'Pendente',
  CONFIRMED: 'Confirmado', NOT_APPLICABLE: 'Não se aplica',
  PROPOSED: 'Proposta', ELIGIBLE: 'Elegível', AWAITING_HUMAN: 'Aguarda você',
  APPLIED: 'Aplicada', NO_OP_ALREADY_APPLIED: 'Já aplicada', WAITING_SIDE_QUEST: 'Aguarda tarefa auxiliar',
  ESTABLISHED: 'Estabelecido', PROVISIONAL: 'Provisório', CONTESTED: 'Contestado', RETIRED: 'Retirado',
  REFUTED: 'Refutada', REVIEWING: 'Em revisão', PREREGISTERED: 'Teste definido antes da execução',
  OBSERVED: 'Em observação', CANARY: 'Em teste isolado', ROLLED_BACK: 'Alteração desfeita', WAIT_HUMAN: 'Aguarda decisão humana',
  RECENT: 'Recente',
  P0: 'Crítica', P1: 'Alta', P2: 'Moderada', INFO: 'Informativa',
  LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto',
  DECIDIR: 'Decidir', APROVAR: 'Aprovar', RESPONDER: 'Responder',
  ESCOLHER: 'Escolher', FORNECER_DADO: 'Fornecer dado', CONFIGURAR_ACESSO: 'Autorizar / configurar',
  TRUTH_OWNER: 'Responsável pela fonte', DELEGATED: 'Delegada', DERIVED: 'Derivada',
  NON_AUTHORITATIVE: 'Não autoritativa',
  READ: 'Leitura', WRITE: 'Escrita', SCHEDULE: 'Agendamento', DEPLOY: 'Publicação', NOTIFY: 'Notificação',
  LOCAL: 'Local', GITHUB_ACTIONS: 'GitHub Actions', VERCEL: 'Vercel',
  NEXO_KERNEL: 'Automação central', HUMAN: 'Pessoa',
  DOMAIN: 'Área principal', SUBDOMAIN: 'Assunto', CAMPAIGN: 'Pesquisa', ACTION: 'Ação', EFFECT: 'Resultado', CLAIM: 'Conclusão', TEST: 'Teste',
  MEMORY: 'Aprendizado', CAPABILITY: 'Recurso disponível', PROVIDER: 'Serviço conectado', PROJECTION: 'Visão publicada',
  SIDE_QUEST: 'Tarefa auxiliar', FILAMENT: 'Relação de aprendizagem',
  hub: 'Área principal', subdomain: 'Assunto', ROOT: 'Sistema', LAYER: 'Camada', TRANSPORT: 'Canal',
  TOOL: 'Ferramenta', FAMILY: 'Família de ferramentas', RUNTIME: 'Serviço executor', ROLE: 'Equipe de automação',
  OWNS: 'possui', PRODUCES: 'produz', VERIFIES: 'verifica', DEPENDS_ON: 'depende de',
  PROJECTS: 'projeta', CONTRADICTS: 'contradiz', SUPPORTS: 'sustenta',
  ROUTES_TO: 'roteia para', BLOCKS: 'bloqueia', DERIVES_FROM: 'deriva de',
  SEMANTIC: 'Semântica', PROCEDURAL: 'Procedural',
  OPEN: 'Aberta', WAITING: 'Aguardando', DONE: 'Concluída',
  WAIT_DEPENDENCY: 'Aguardando dependência', READY: 'Pronto', IN_PROGRESS: 'Em andamento', ACTIVE: 'Em andamento',
  VERIFIED: 'Verificado', RESULT: 'Resultado disponível', CHECKPOINTED: 'Em espera', REJECTED: 'Rejeitado',
  QUEUED: 'Na fila', PAUSED: 'Pausada', COMPLETED: 'Concluída', CLOSED: 'Encerrada', TODO: 'A fazer',
  BLOCKED_SCIENTIFIC_CONTRACT: 'Bloqueado pelo contrato', WATCH: 'Em observação',
};

/** Nome de exibição dos domínios. O código do domínio segue no atributo data-domain. */
export const DOMAIN_LABEL: Record<string, string> = {
  NEXO: 'Nexo', SCIENCE: 'Ciência', ENGINEERING: 'Engenharia', OLYMPUS: 'Olympus', GPT_PERFORMANCE: 'Desempenho GPT',
};
export const domainLabel = (value: string | null | undefined): string =>
  value ? DOMAIN_LABEL[value.toUpperCase()] ?? (/^[A-Z][A-Z0-9_]*$/.test(value) ? 'Outra área' : value) : '—';

export const label = (value: string | null | undefined): string =>
  value ? STATE_LABEL[value] ?? (/^[A-Z][A-Z0-9_]*$/.test(value) ? 'Descrição ainda não publicada' : value) : '—';

/**
 * Makes projected prose easier to read without changing the published value
 * used by the system. Technical identifiers remain available in disclosures.
 */
export const humanizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  let text = value;
  const replace = (pattern: RegExp, replacement: string) => {
    text = text.replace(pattern, match => match[0] === match[0].toUpperCase()
      ? replacement[0].toUpperCase() + replacement.slice(1)
      : replacement);
  };

  replace(/runner artifact executor unavailable/gi, 'serviço que executa arquivos indisponível');
  text = text.replace(/\bcap\.([a-z0-9_.-]+)\s+(?:(?:is|está)\s+)?BLOCKED\b/gi, (_match, capability: string) =>
    capability.toLowerCase().includes('deploy') ? 'publicação está bloqueada'
      : capability.toLowerCase().includes('read') ? 'leitura está bloqueada'
        : 'recurso do sistema está bloqueado');
  text = text.replace(/\bconflito(?: de autoridade)? P0\b/gi, match => {
    const replacement = match.toLowerCase().includes('autoridade') ? 'conflito de autoridade crítico' : 'conflito crítico';
    return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  });
  replace(/\b(?:receipt|action):\/\/[^\s,;]+/gi, 'registro técnico');
  text = text.replace(/\b(cap|effect|act|action|receipt|sq|campaign|filament)\.[a-z0-9_.-]+\b/gi, (_match, kind: string) => ({
    cap: 'recurso do sistema', effect: 'resultado', act: 'ação', action: 'ação', receipt: 'comprovante',
    sq: 'tarefa auxiliar', campaign: 'campanha', filament: 'aprendizado',
  }[kind.toLowerCase()] ?? 'registro'));
  replace(/\bnexo_ssot\b/gi, 'registro central do NEXO');
  replace(/\baction_register\b/gi, 'registro de ações');
  replace(/\bexecution_runs\b/gi, 'histórico de execuções');
  replace(/\bTruth Owner\b/gi, 'fonte oficial');
  replace(/\bsem capability provada\b/gi, 'sem comprovação de permissão');
  text = text.replace(/\bside quests?\b/gi, match => match.toLowerCase().endsWith('s') ? 'tarefas auxiliares' : 'tarefa auxiliar');
  replace(/\breferee report\b/gi, 'relatório de avaliação');
  replace(/\binput_fingerprint\b/gi, 'assinatura dos dados de entrada');
  replace(/\beffect_key\b/gi, 'identificador do resultado');
  replace(/\bfingerprint\b/gi, 'assinatura dos dados');
  replace(/\bao assinatura dos dados de entrada\b/gi, 'à assinatura dos dados de entrada');
  replace(/\bcom o assinatura dos dados de entrada\b/gi, 'com a assinatura dos dados de entrada');
  replace(/\breadback\b/gi, 'confirmação da fonte');
  replace(/\bcapability\b/gi, 'recurso');
  replace(/\bdo provider\b/gi, 'da fonte');
  replace(/\bno provider\b/gi, 'na fonte');
  replace(/\bprovider\b/gi, 'fonte');
  replace(/\bruntime\b/gi, 'serviço executor');
  replace(/\bcredencial de deploy\b/gi, 'credencial de publicação');
  replace(/\bdeploy\b/gi, 'publicação');
  replace(/\bworkflow\b/gi, 'rotina automática');
  replace(/\bverificação de recurso\b/gi, 'verificação da permissão');
  replace(/\bfinding\b/gi, 'registro');
  replace(/\bletter\b/gi, 'carta');
  replace(/\bNEXO SSoT\b/gi, 'registro central do NEXO');
  replace(/\bIntegrity monitor\b/gi, 'monitor de integridade');
  replace(/\bBLOCKED\b/gi, 'bloqueado');
  replace(/\bUNVERIFIED\b/gi, 'sem confirmação');
  replace(/\bSTALE\b/gi, 'antigo');
  replace(/\bCONTESTED\b/gi, 'em disputa');
  replace(/\bP0\b/g, 'prioridade crítica');
  replace(/\bP1\b/g, 'prioridade alta');
  replace(/\bGENOME_MUTATION\b/gi, 'mudança permanente no sistema');
  replace(/\bPENDING_REVIEW\b/gi, 'aguardando revisão');
  replace(/\bCONFIRMED\b/gi, 'confirmada');
  replace(/\bREFUTED\b/gi, 'refutada');
  replace(/\bPROMOTED\b/gi, 'promovida');
  replace(/\bROC AUC\b/gi, 'área sob a curva ROC, uma medida de ordenação');
  replace(/\bAUC\b/gi, 'medida de ordenação');
  replace(/ΛCDM/g, 'modelo cosmológico padrão');
  replace(/\bno anisotropy evidence\b/gi, 'não há evidências de variação conforme a direção observada');
  replace(/\btechnical verdict registered\b/gi, 'resultado técnico registrado');
  replace(/\bexplanatory reach\b/gi, 'capacidade de explicar');
  replace(/\bDDE\b/gi, 'energia escura dinâmica');
  replace(/\bdark energy\b/gi, 'energia escura');
  replace(/\bdark matter\b/gi, 'matéria escura');
  replace(/\bmegastructures\b/gi, 'megaestruturas');
  replace(/\bmegastructure\b/gi, 'megaestrutura');
  replace(/\bdraft\b/gi, 'rascunho');
  replace(/\bpelo confirmação\b/gi, 'pela confirmação');
  replace(/\bqual fonte é fonte oficial\b/gi, 'qual origem será considerada oficial');
  replace(/\bo Fonte oficial\b/gi, 'a fonte oficial');
  replace(/\ba recurso\b/gi, 'o recurso');
  replace(/\bestá bloqueado\b/gi, 'está bloqueado');
  replace(/\bestá bloqueada\b/gi, 'está bloqueada');
  replace(/confirmar o índice pela confirmação da fonte do Drive/gi, 'verificar no Drive se o índice foi gravado');
  text = text.replace(/\bno\s+confirmation da fonte\b/gi, 'sem confirmação da fonte');
  return text;
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  P0: 'conflict', P1: 'degraded', P2: 'snapshot', INFO: 'live',
};

const SEVERITY_WEIGHT: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, INFO: 3 };
export const bySeverity = <T extends { severity: Severity }>(a: T, b: T): number =>
  SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];

export const isConflict = (state: EntityState): boolean => state === 'CONFLICT';

/**
 * A conservative "what's next" hint for the inspector, derived only from the
 * entity's own state — never from data the projection does not carry. When
 * the state gives no real signal, this says so instead of guessing.
 */
export const nextHintFor = (state: EntityState): string => {
  switch (state) {
    case 'CONFLICT': return 'Requer decisão humana: dois provedores divergem sobre esta entidade.';
    case 'BLOCKED': return 'Bloqueada — verifique a relação BLOCKS/dependência no inspector antes de agir.';
    case 'MISSING_PROVIDER': return 'Provedor esperado não respondeu; sem leitura recente para decidir.';
    case 'DEGRADED': return 'Leitura degradada — trate como parcial até a próxima checagem.';
    case 'STALE': case 'STALE_DECLARATION': return 'Leitura antiga — confirme a fonte antes de assumir que ainda vale.';
    default: return 'Nenhuma ação pendente identificada nesta projeção.';
  }
};

/** Estados que exigem que a UI diga explicitamente o que não sabe. */
export const NEEDS_EXPLANATION: Tone[] = ['stale', 'degraded', 'conflict', 'blocked', 'unknown'];

// A malformed timestamp in published data must degrade to a label, never throw
// (Intl.format throws RangeError on an invalid Date and takes the whole view down).
const validDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const dateTime = (value?: string | null): string => {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
    : 'Sem leitura válida';
};

export const shortTime = (value?: string | null): string => {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date) : '—';
};

const capabilityTone: Record<CapabilityStatus, Tone> = {
  PASS: 'live', UNVERIFIED: 'unknown', UNKNOWN: 'unknown', RETIRED_RUNTIME: 'stale', BLOCKED: 'blocked',
};
export const capabilityToneOf = (status: CapabilityStatus): Tone => capabilityTone[status];

export const truthToneOf = (status: TruthStatus): Tone => toneOf(status);
export const projectionToneOf = (state: ProjectionState): Tone => toneOf(state);
