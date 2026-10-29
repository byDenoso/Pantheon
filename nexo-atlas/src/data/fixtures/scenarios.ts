// Cenários determinísticos que cobrem cada estado crítico da interface.
// Cada cenário é uma transformação pura sobre o mesmo mundo base.
import type { ProjectionBus, ProjectionState, SystemState } from '../../contracts/system.ts';
import { ACTIONS, CAPABILITIES, ENVELOPES, FILAMENTS, FINDINGS, INBOX, LANES, PROVIDERS, RUNS, ago, fingerprint, freshness } from './build.ts';
import { buildGraph } from './graph.ts';

/** Pior estado vence: a UI nunca reporta saúde melhor que o pior componente. */
const SEVERITY_ORDER: ProjectionState[] =
  ['LIVE', 'SNAPSHOT', 'STALE', 'DEGRADED', 'MISSING_PROVIDER', 'BLOCKED', 'CONFLICT'];

export const worstState = (states: ProjectionState[]): ProjectionState =>
  states.reduce<ProjectionState>((worst, state) =>
    SEVERITY_ORDER.indexOf(state) > SEVERITY_ORDER.indexOf(worst) ? state : worst, 'LIVE');

function buildBus(state: SystemState): ProjectionBus {
  const sources = state.providers.map(provider => ({
    id: provider.id, label: provider.label,
    source_revision: provider.state === 'MISSING_PROVIDER' ? null : `rev-${fingerprint(provider.id).slice(3, 7)}`,
    freshness: freshness(
      provider.state === 'LIVE' ? 'LIVE' : provider.state === 'STALE' ? 'STALE'
        : provider.state === 'MISSING_PROVIDER' ? 'UNKNOWN' : 'RECENT',
      provider.state === 'MISSING_PROVIDER' ? null : 25),
    state: provider.state,
    envelopes: state.envelopes.filter(e => provider.expected_for.includes(e.domain)).length,
  }));
  const busState = worstState(sources.map(s => s.state));
  return {
    fingerprint: fingerprint(`bus:${state.scenario_id}:${sources.map(s => `${s.id}=${s.state}`).join('|')}`),
    generated_at: state.generated_at,
    state: busState,
    envelope_count: state.envelopes.length,
    sources,
    consumers: [
      { id: 'nexo_one', label: 'NEXO ONE', state: busState, last_pull_at: ago(1) },
      { id: 'atlas', label: 'Atlas', state: busState === 'LIVE' ? 'SNAPSHOT' : busState, last_pull_at: ago(25) },
      { id: 'integrity', label: 'Integrity monitor', state: busState, last_pull_at: ago(1) },
    ],
  };
}

/** Mundo base: OLYMPUS em CONFLICT P0, como exige o contrato de mocks. */
function baseState(): SystemState {
  const draft: SystemState = {
    contract_version: '1',
    scenario_id: 'olympus-conflict',
    scenario_label: 'OLYMPUS em conflito P0',
    generated_at: ago(0),
    global_state: 'LIVE',
    bus: { fingerprint: '', generated_at: ago(0), state: 'LIVE', envelope_count: 0, sources: [], consumers: [] },
    envelopes: structuredClone(ENVELOPES),
    findings: structuredClone(FINDINGS),
    actions: structuredClone(ACTIONS),
    inbox: structuredClone(INBOX),
    capabilities: structuredClone(CAPABILITIES),
    runs: structuredClone(RUNS),
    lanes: structuredClone(LANES),
    graph: { nodes: [], edges: [] },
    filaments: structuredClone(FILAMENTS),
    providers: structuredClone(PROVIDERS),
  };
  return finalize(draft);
}

/** Recalcula tudo que é derivado. Nenhum cenário escreve bus, grafo ou estado global à mão. */
export function finalize(state: SystemState): SystemState {
  const bus = buildBus(state);
  const graph = buildGraph(state);
  const global_state = worstState([
    ...state.providers.map(p => p.state),
    ...state.lanes.map(l => l.state),
    ...state.envelopes.map(e => e.state),
    bus.state,
  ]);
  return { ...state, bus, graph, global_state };
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  build: () => SystemState;
}

const derive = (id: string, label: string, mutate: (state: SystemState) => void): (() => SystemState) => () => {
  const state = baseState();
  state.scenario_id = id;
  state.scenario_label = label;
  mutate(state);
  return finalize(state);
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'olympus-conflict',
    label: 'OLYMPUS em conflito P0',
    description: 'Estado base. Duas fontes disputam a posse da verdade de OLYMPUS; escritas no domínio ficam suspensas.',
    build: baseState,
  },
  {
    id: 'all-live',
    label: 'Tudo LIVE',
    description: 'Todos os providers respondem, nenhuma capability bloqueada e nenhum conflito aberto.',
    build: derive('all-live', 'Tudo LIVE', state => {
      state.providers = state.providers.map(p => ({ ...p, state: 'LIVE', last_success_at: ago(2), explanation: 'Leitura confirmada nesta janela.' }));
      state.findings = state.findings.map(f => ({
        ...f, status: 'LIVE', severity: 'INFO', freshness: freshness('LIVE', 2), checked_at: ago(2),
        authority: { ...f.authority, class: 'TRUTH_OWNER' },
        provider: { ...f.provider, observed: f.provider.expected },
        explanation: 'Provider observado coincide com o esperado; revisão declarada e dentro do TTL.',
      }));
      state.capabilities = state.capabilities.map(c => ({
        ...c, status: 'PASS', last_verified_at: ago(2),
        evidence_ref: c.evidence_ref ?? `receipt://cap/${c.capability_id}/live`,
        explanation: 'Capability exercida com readback nesta janela.',
      }));
      state.envelopes = state.envelopes.map(e => ({ ...e, state: 'LIVE', freshness: freshness('LIVE', 2), checked_at: ago(2) }));
      state.lanes = state.lanes.map(l => ({ ...l, state: 'LIVE', freshness: freshness('LIVE', 2), blockers: [], checked_at: ago(2) }));
      state.actions = state.actions.map(a => ({
        ...a, status: a.human_gate ? 'AWAITING_HUMAN' : 'ELIGIBLE', blocker: null,
        readback: a.readback.status === 'NOT_APPLICABLE' ? a.readback
          : { ...a.readback, status: 'CONFIRMED', observed_fingerprint: a.input_fingerprint,
              explanation: 'Efeito relido no provider e conferido com o input_fingerprint.' },
      }));
      // Sem readback pendente não pode sobrar achado de integridade: o cenário é LIVE de ponta a ponta.
      state.runs = state.runs.map(r => ({
        ...r, status: r.status === 'NO_OP' ? 'NO_OP' : 'SUCCEEDED', retries: 0,
        readback: { status: 'CONFIRMED', provider: r.readback.provider, observed_fingerprint: fingerprint(r.run_id),
          checked_at: ago(2), explanation: 'Efeito confirmado na releitura do provider.' },
        steps: r.steps.map(s => ({ ...s, status: s.status === 'SKIPPED' ? 'SKIPPED' : 'OK' })),
      }));
    }),
  },
  {
    id: 'github-unverified',
    label: 'GitHub scheduled write UNVERIFIED',
    description: 'O agendamento de escrita está declarado, mas nunca foi observado em execução. Ausência de prova não é prova de ausência.',
    build: derive('github-unverified', 'GitHub scheduled write UNVERIFIED', state => {
      state.capabilities = state.capabilities.map(c =>
        c.capability_id === 'cap.github.schedule.workflow' || c.capability_id === 'cap.github.write.contents'
          ? { ...c, status: 'UNVERIFIED', last_verified_at: null, evidence_ref: null,
              explanation: 'Declarada no workflow e jamais exercida com readback. Não deve ser exibida como parcialmente funcional.' }
          : c);
      state.findings = state.findings.map(f =>
        f.domain === 'ENGINEERING'
          ? { ...f, status: 'DEGRADED', severity: 'P1', capability: 'cap.github.schedule.workflow',
              explanation: 'A lane depende de uma capability de escrita agendada que nunca foi verificada.' }
          : f);
    }),
  },
  {
    id: 'provider-missing',
    label: 'Provider indisponível',
    description: 'O Drive não responde. A lane SCIENCE perde a fonte esperada e nenhuma leitura antiga é apresentada como atual.',
    build: derive('provider-missing', 'Provider indisponível', state => {
      state.providers = state.providers.map(p =>
        p.id === 'drive'
          ? { ...p, state: 'MISSING_PROVIDER', last_success_at: null, checked_at: ago(1),
              explanation: 'Nenhuma resposta do provider nesta janela. A ausência de leitura não vira zero.' }
          : p);
      state.findings = state.findings.map(f =>
        f.domain === 'SCIENCE'
          ? { ...f, status: 'MISSING_PROVIDER', severity: 'P1', provider: { expected: 'drive', observed: null },
              freshness: freshness('UNKNOWN', null, null),
              explanation: 'O provider esperado não respondeu. O estado do domínio é desconhecido, não vazio.' }
          : f);
      state.capabilities = state.capabilities.map(c =>
        c.provider === 'drive' ? { ...c, status: 'UNKNOWN', explanation: 'Provider ausente: a capability não pode ser avaliada.' } : c);
      state.lanes = state.lanes.map(l =>
        l.domain === 'SCIENCE'
          ? { ...l, state: 'MISSING_PROVIDER', freshness: freshness('UNKNOWN', null, null),
              current_state: 'Fonte esperada ausente. Estado desconhecido.',
              blockers: [...l.blockers, 'Provider drive sem resposta'] }
          : l);
      state.envelopes = state.envelopes.map(e =>
        e.domain === 'SCIENCE' ? { ...e, state: 'MISSING_PROVIDER', freshness: freshness('UNKNOWN', null, null) } : e);
    }),
  },
  {
    id: 'source-stale',
    label: 'Fonte STALE',
    description: 'A última leitura válida excede o TTL. O conteúdo continua visível, sempre rotulado como leitura anterior.',
    build: derive('source-stale', 'Fonte STALE', state => {
      state.providers = state.providers.map(p =>
        p.id === 'nexo_ssot' || p.id === 'github'
          ? { ...p, state: 'STALE', last_success_at: ago(2_600), checked_at: ago(2),
              explanation: 'Última leitura válida fora do TTL. Exibindo conteúdo anterior, marcado como STALE.' }
          : p);
      state.envelopes = state.envelopes.map(e => ({ ...e, state: 'STALE', freshness: freshness('STALE', 2_600) }));
      state.lanes = state.lanes.map(l => ({ ...l, state: 'STALE', freshness: freshness('STALE', 2_600) }));
      state.findings = state.findings.map(f =>
        f.domain === 'NEXO'
          ? { ...f, status: 'STALE_DECLARATION', severity: 'P2', freshness: freshness('STALE', 2_600),
              explanation: 'A declaração de autoridade não é revalidada dentro do TTL do domínio.' }
          : f);
    }),
  },
  {
    id: 'projection-degraded',
    label: 'Projeção DEGRADED',
    description: 'O bus entrega cobertura parcial: parte dos envelopes não pôde ser recompilada nesta janela.',
    build: derive('projection-degraded', 'Projeção DEGRADED', state => {
      // Isola a degradação: com o conflito P0 aberto, o pior estado venceria e
      // esconderia justamente o que este cenário existe para mostrar.
      state.findings = state.findings.map(f =>
        f.status === 'CONFLICT'
          ? { ...f, status: 'DEGRADED', severity: 'P2',
              authority: { owner: 'NEXO SSoT', class: 'TRUTH_OWNER' },
              provider: { expected: 'nexo_ssot', observed: 'nexo_ssot' },
              explanation: 'Posse resolvida; a leitura ainda chega parcial nesta janela.' }
          : f);
      state.providers = state.providers.map(p =>
        p.state === 'CONFLICT'
          ? { ...p, state: 'DEGRADED', explanation: 'Posse resolvida; cobertura ainda parcial.' }
          : p);
      state.envelopes = state.envelopes.map((e, index) =>
        index % 2 === 0
          ? { ...e, state: 'DEGRADED', freshness: freshness('AGING', 190),
              summary: 'Recompilação parcial: parte das relações não pôde ser derivada nesta janela.' }
          : e);
      state.providers = state.providers.map(p =>
        p.id === 'action_register'
          ? { ...p, state: 'DEGRADED', explanation: 'Registro respondeu com cobertura parcial.' }
          : p);
      state.lanes = state.lanes.map(l => ({ ...l, state: 'DEGRADED', freshness: freshness('AGING', 190) }));
    }),
  },
  {
    id: 'readback-failed',
    label: 'Readback FAIL',
    description: 'O runtime declarou o efeito aplicado, mas a releitura no provider não o encontrou. O efeito não conta como aplicado.',
    build: derive('readback-failed', 'Readback FAIL', state => {
      state.actions = state.actions.map(a =>
        a.action_id === 'act.nexo.notify-digest'
          ? { ...a, status: 'FAILED',
              readback: { status: 'FAILED', provider: 'gmail', observed_fingerprint: null, checked_at: ago(4),
                explanation: 'Releitura não encontrou o efeito declarado. Tratar como não aplicado.' },
              blocker: 'Readback falhou: efeito declarado sem confirmação na fonte.',
              checked_at: ago(4), freshness: freshness('LIVE', 4) }
          : a);
      state.runs = state.runs.map(r =>
        r.run_id === 'run.77aa'
          ? { ...r, status: 'FAILED', retries: 3, ended_at: ago(4),
              readback: { status: 'FAILED', provider: 'gmail', observed_fingerprint: null, checked_at: ago(4),
                explanation: 'Nenhum registro correspondente encontrado na releitura.' },
              steps: r.steps.map(s => s.stage === 'READBACK'
                ? { ...s, status: 'FAIL', at: ago(4), detail: 'Terceira tentativa também não confirmou o efeito.' } : s) }
          : r);
      state.lanes = state.lanes.map(l =>
        l.domain === 'NEXO'
          ? { ...l, state: 'DEGRADED', blockers: ['effect.digest.morning declarado sem readback confirmado'] }
          : l);
    }),
  },
  {
    id: 'no-op-applied',
    label: 'NO_OP_ALREADY_APPLIED',
    description: 'O estado desejado já estava presente na fonte. Nenhuma escrita foi emitida e o recibo registra o no-op.',
    build: derive('no-op-applied', 'NO_OP_ALREADY_APPLIED', state => {
      state.actions = state.actions.map(a =>
        a.action_id === 'act.eng.sync-readme'
          ? { ...a, status: 'NO_OP_ALREADY_APPLIED', blocker: null,
              next_action: 'Nenhum. O efeito desejado já está presente na fonte.',
              eligibility: 'Elegível e já satisfeita: reexecutar produziria exatamente o mesmo estado.',
              checked_at: ago(2), freshness: freshness('LIVE', 2) }
          : a);
      state.runs = state.runs.map(r =>
        r.run_id === 'run.9f2c' ? { ...r, status: 'NO_OP', ended_at: ago(2) } : r);
    }),
  },
  {
    id: 'waiting-side-quest',
    label: 'Ação em WAITING_SIDE_QUEST',
    description: 'A ação está tecnicamente elegível, mas depende do fechamento de uma side quest antes de executar.',
    build: derive('waiting-side-quest', 'Ação em WAITING_SIDE_QUEST', state => {
      state.actions = state.actions.map(a =>
        a.action_id === 'act.eng.schedule-integrity-run'
          ? { ...a, status: 'WAITING_SIDE_QUEST',
              next_action: 'Fechar a side quest de permissões do workflow antes de habilitar o agendamento.',
              blocker: 'sq.eng.workflow-perms em aberto.' }
          : a);
      state.lanes = state.lanes.map(l =>
        l.domain === 'ENGINEERING'
          ? { ...l, side_quests: [
              { id: 'sq.eng.workflow-perms', title: 'Permissões do workflow de integridade', status: 'OPEN' },
              { id: 'sq.eng.runner-image', title: 'Fixar imagem do runner', status: 'WAITING' }] }
          : l);
    }),
  },
  {
    id: 'human-decision',
    label: 'Human Inbox exige decisão',
    description: 'Fila humana carregada: uma decisão irreversível, uma escolha de autoridade e um dado ausente.',
    build: derive('human-decision', 'Human Inbox exige decisão', state => {
      state.inbox = state.inbox.map(item =>
        item.kind === 'DECIDIR' ? { ...item, severity: 'P0', due_at: ago(-720),
          why: 'A janela do editor fecha em 12 horas e a submissão é irreversível.' } : item);
      state.actions = state.actions.map(a =>
        a.human_gate ? { ...a, status: 'AWAITING_HUMAN' } : a);
    }),
  },
];

export const DEFAULT_SCENARIO_ID = 'olympus-conflict';

export const scenarioById = (id: string): Scenario =>
  SCENARIOS.find(s => s.id === id) ?? SCENARIOS[0];
