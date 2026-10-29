import type { EvolutionIncidentSummary } from '../contracts/system.ts';

const roles: Record<string, string> = {
  EXECUTOR: 'Executor', LEARNER: 'Learner', REFUTADOR: 'Refutador', PITIA: 'Pítia',
  GUARDIAO: 'Guardião', DENER: 'Dener', ENGINEER: 'Engenheiro', WRITER: 'Writer',
  ADVISOR: 'Conselheiro', DAILY: 'Rotina diária', EMERGENT: 'Emergente',
  OPERATOR: 'Operador', SCIENTIST: 'Cientista', CRITIC: 'Crítico', SENTINEL: 'Sentinela',
};
// Unknown codes never become public prose or imply an assignment.
const role = (value?: string | null) => roles[String(value ?? '').toUpperCase()] ?? 'não informado';
const learning: Record<string, string> = {
  OBSERVED: 'Em observação', PREREGISTERED: 'Teste definido', REVIEWING: 'Em revisão',
  CONFIRMED: 'Hipótese apoiada', REFUTED: 'Hipótese refutada', CANARY: 'Mudança em teste isolado',
  ROLLED_BACK: 'Mudança desfeita', WAIT_HUMAN: 'Aguardando decisão humana', CLOSED: 'Acompanhamento encerrado',
};
const actions: Record<string, string> = {
  LINK_EXISTING_WORK: 'Vincular uma tarefa canônica ao incidente',
  COMPLETE_RECOVERY: 'Concluir a recuperação operacional',
  VERIFY_INCIDENT_CRITERION: 'Verificar o critério de resolução do incidente',
  RESOLVED: 'Recuperação operacional concluída',
};
const reasons: Record<string, string> = {
  INDEPENDENT_EVALUATORS_UNAVAILABLE: 'Avaliadores independentes indisponíveis',
  RUNNER_ARTIFACT_EXECUTOR_UNAVAILABLE: 'Executor de artefatos indisponível',
  PRE_RESULT_TEMPORAL_ORDER_UNRESOLVED: 'Ordem temporal anterior ao resultado ainda não verificada',
  EMPTY_FRONTIER_ACTIVE_ROADMAP: 'Roteiro ativo sem próxima etapa executável',
  READY_INPUTS_NOT_MATERIALIZED: 'Entradas prontas ainda não materializadas',
  INPUT_PROVENANCE_INCOMPLETE: 'Proveniência das entradas incompleta',
  RECIPE_BINDING_MISSING: 'Vínculo da receita de execução ausente',
  RECIPE_OR_SMOKE_MISSING: 'Receita ou verificação inicial ausente',
  RECIPE_OR_SMOKE_INVALID: 'Receita ou verificação inicial inválida',
};
const validations: Record<string, string> = {
  PENDING: 'Pendente', EVIDENCE_REQUIRED: 'Evidência necessária',
  REVALIDATION_REQUIRED: 'Nova validação necessária', PREREQUISITES_VALIDATED: 'Pré-requisitos de execução validados',
};

export function incidentView(incident: EvolutionIncidentSummary) {
  const op = incident.operational?.policy === 'INCIDENT_OPERATIONS_V1' ? incident.operational : undefined;
  const state = op && ['UNLINKED', 'OPEN', 'RESOLVED'].includes(op.state) ? op.state : 'UNKNOWN';
  return {
    state,
    label: { UNLINKED: 'Sem tarefa vinculada', OPEN: 'Em aberto', RESOLVED: 'Resolvido operacionalmente', UNKNOWN: 'Estado operacional não informado' }[state]!,
    tone: state === 'RESOLVED' ? 'ok' : 'warn',
    learning: learning[incident.learning_state ?? incident.state] ?? 'Etapa de aprendizagem não informada',
    learningOwner: (incident.learning_next_owner ?? incident.next_owner) === 'NONE' ? 'nenhuma etapa pendente' : role(incident.learning_next_owner ?? incident.next_owner),
    items: (op?.items ?? []).map(item => ({
      workId: item.work_id,
      currentOwner: role(item.current_owner),
      assignedTo: role(item.assigned_to),
      acceptance: item.accepted === true && item.ownership_state === 'ACCEPTED' ? 'Aceite registrado'
        : item.ownership_state === 'ASSIGNED_UNACCEPTED' ? 'Encaminhado · aceite ainda não registrado' : 'Aceite não informado',
      validation: validations[item.validation_state] ?? 'Não informada',
    })),
    suggestedOwner: op?.suggested_owner ? role(op.suggested_owner) : null,
    reason: op ? reasons[op.reason_code] ?? null : null,
    nextAction: op ? actions[op.next_action_code] ?? null : null,
    resolutionScope: state === 'RESOLVED' && op?.resolution_scope === 'EXECUTION_PREREQUISITES'
      ? 'Resolução limitada aos pré-requisitos de execução' : null,
  };
}

/** A Guardian finding is an observation at checked_at, not a fresh hash comparison. */
export function guardianAuditTime(checkedAt?: string | null, now = Date.now()) {
  const stamp = Date.parse(checkedAt ?? '');
  if (!Number.isFinite(stamp)) return 'data da auditoria não informada';
  if (stamp > now) return 'data da auditoria à frente do relógio atual';
  return new Date(stamp).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}
