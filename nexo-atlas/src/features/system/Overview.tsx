// Tela principal do NEXO ONE. Ordem no desktop: estado, atenção, autonomia, lanes, bus.
// No mobile a ordem passa a: atenção -> estado -> blockers -> próximas ações -> lanes (ver layout.css).
import type { ActionRecord, InboxItem, SystemState } from '../../contracts/system.ts';
import { ActionCard, HumanInboxItem, LaneState, ProjectionHealth } from '../../components/composites.tsx';
import { EmptyState } from '../../components/states.tsx';
import { MissionControl } from './MissionControl.tsx';
import { EvolutionPanel } from './EvolutionPanel.tsx';
import { phaseOf } from '../../viewmodels/missions.ts';
import {
  DomainBadge, FreshnessIndicator, SeverityBadge, StatusBadge,
} from '../../components/primitives.tsx';
import {
  actionById, capabilityById, globalSummary, inboxGroups, laneViews, nextActionsFor, resolvableActions,
} from '../../viewmodels/system.ts';
import { dateTime, humanizeText, label, toneOf } from '../../viewmodels/tokens.ts';

// O hero do Início escuta este evento para acender o aglomerado do domínio.
const focusDomain = (domain: string | null) =>
  window.dispatchEvent(new CustomEvent('nexo:domain-focus', { detail: domain }));

export function Overview(
  { state, onOpenAction, onOpenInbox, onNavigate }:
  {
    state: SystemState;
    onOpenAction: (action: ActionRecord) => void;
    onOpenInbox: (item: InboxItem) => void;
    onNavigate: (view: 'INBOX' | 'ACTIONS' | 'TRUTHGRAPH' | 'SOURCES' | 'LEARNING') => void;
  },
) {
  const summary = globalSummary(state);
  const groups = inboxGroups(state);
  const urgent = groups.flatMap(group => group.items).slice(0, 3);
  const resolvable = resolvableActions(state);
  // The autonomous queue that actually runs is the test frontier; cadence is configured outside this view.
  const frontier = state.graph.nodes.filter(node => node.type === 'TEST' && (phaseOf(node) === 'READY' || phaseOf(node) === 'RUNNING'));
  const nextQuestions = frontier.slice(0, 3).map(node => node.question_plain?.trim()).filter(Boolean);
  const lanes = laneViews(state);
  const unavailableProviders = state.providers.filter(provider =>
    provider.state === 'MISSING_PROVIDER' || provider.state === 'BLOCKED').length;
  const representedProviders = Math.max(0, state.providers.length - unavailableProviders);

  return (
    <div className="overview">
      {state.guardian && <GuardianStrip guardian={state.guardian} />}
      {state.evolution && <EvolutionPanel evolution={state.evolution} />}
      <MissionControl state={state} onOpenScience={() => onNavigate('LEARNING')} />
      <section className="overview-pulse" aria-label="Resumo operacional" data-order="summary">
        <button className={`pulse-metric health tone-${toneOf(summary.state)}`} onClick={() => onNavigate('SOURCES')}>
          <span>Saúde</span><strong>{label(summary.state)}</strong>
        </button>
        <button className={summary.needsHuman ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('INBOX')}>
          <span>Decisões que esperam por você</span><strong>{summary.needsHuman}</strong>
        </button>
        <button className={summary.blockers.length ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('ACTIONS')}>
          <span>Tarefas impedidas</span><strong>{summary.blockers.length}</strong>
        </button>
        <button className={summary.degradedCapabilities.length ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('SOURCES')}>
          <span>Recursos sem confirmação</span><strong>{summary.degradedCapabilities.length}</strong>
        </button>
      </section>

      <section className="current-state" aria-labelledby="current-state-title" data-order="state">
        <div className="section-head">
          <h2 id="current-state-title">Estado do sistema</h2>
          <div className="head-side">
            <StatusBadge state={summary.state} />
            <span className="quiet-note">última leitura {dateTime(summary.lastRead)}</span>
            <span className="quiet-note">
              Cobertura: {representedProviders} de {state.providers.length} fontes lidas · {unavailableProviders} sem resposta
            </span>
          </div>
        </div>
        <div className="domain-strip">
          {summary.domains.map(domain => (
            <article key={domain.domain} className={`domain-tile tone-${toneOf(domain.state)}`} data-domain={domain.domain}
              tabIndex={0} onMouseEnter={() => focusDomain(domain.domain)} onFocus={() => focusDomain(domain.domain)}
              onMouseLeave={() => focusDomain(null)} onBlur={() => focusDomain(null)}>
              <header>
                <DomainBadge domain={domain.domain} />
                <SeverityBadge severity={domain.severity} />
              </header>
              <StatusBadge state={domain.state} />
              {domain.freshness && <FreshnessIndicator freshness={domain.freshness} />}
              <p>{humanizeText(domain.finding?.explanation) || 'Sem registro explicativo para este domínio nesta atualização.'}</p>
              {domain.blockers.length > 0 && (
                <ul className="tile-blockers">{domain.blockers.map(b => <li key={b}>{humanizeText(b)}</li>)}</ul>
              )}
            </article>
          ))}
        </div>
        {unavailableProviders > 0 && (
            <p className="rule-note">
            Algumas fontes não responderam. Números iguais a zero não significam que os dados ausentes também sejam zero.
          </p>
        )}
      </section>

      <section aria-labelledby="attention-title" data-order="attention">
        <div className="section-head">
          <h2 id="attention-title">Decisões que esperam por você <span>{summary.needsHuman}</span></h2>
          <button className="text-button" onClick={() => onNavigate('INBOX')}>Ver decisões ↗</button>
        </div>
        {urgent.length
          ? urgent.map(item => (
              <HumanInboxItem key={item.id} item={item} action={actionById(state, item.action_id)} onOpen={onOpenInbox} />
            ))
          : <EmptyState title="Nenhuma decisão pendente."
              description="O NEXO não está esperando uma escolha ou autorização sua nesta atualização."
              hint="A disponibilidade das fontes é mostrada separadamente acima." />}
      </section>

      <section aria-labelledby="autonomy-title" data-order="autonomy">
        <div className="section-head">
          <h2 id="autonomy-title">Ações autorizadas para seguir automaticamente <span>{resolvable.length}</span></h2>
          <span className="eyebrow">SEM DECISÃO PENDENTE</span>
        </div>
        {resolvable.length
          ? <div className="card-grid">
              {resolvable.map(action => (
                <ActionCard key={action.action_id} action={action}
                  capability={capabilityById(state, action.capability_id)} onOpen={onOpenAction} />
              ))}
            </div>
          : frontier.length
            ? <EmptyState title={`${frontier.length} testes estão prontos ou em andamento.`}
                description={nextQuestions.length
                  ? `A automação científica retoma os testes na próxima execução programada. Próximas perguntas: ${nextQuestions.join(' · ')}.`
                  : 'A automação científica retoma os testes na próxima execução programada. As perguntas serão mostradas aqui quando a Tower publicar uma explicação simples.'} />
            : <EmptyState title="Nenhuma ação automática pronta agora."
                description="Ainda não há testes prontos para a próxima execução. A automação de aprendizagem pode sugerir novas perguntas quando voltar a rodar." />}
      </section>

      <section aria-labelledby="lanes-title" data-order="lanes">
        <div className="section-head">
          <h2 id="lanes-title">Próxima etapa em cada área</h2>
          <span className="eyebrow">CIÊNCIA · ENGENHARIA · OLYMPUS</span>
        </div>
        <div className="lane-grid">
          {lanes.map(lane => (
            <LaneState key={lane.domain} lane={lane} actions={nextActionsFor(state, lane.domain)}
              onSelectAction={onOpenAction} />
          ))}
        </div>
      </section>

      <section aria-labelledby="bus-title" data-order="bus">
        <div className="section-head">
          <h2 id="bus-title">Dados que o site recebeu</h2>
          <span className="eyebrow">{label(state.bus.state)}</span>
        </div>
        <p className="rule-note">Este resumo é somente para consulta e mostra a versão publicada mais recente que o site conseguiu ler.</p>
        <ProjectionHealth bus={state.bus} />
      </section>
    </div>
  );
}

const AREA_PT: Record<string, string> = {
  tower: 'fonte de dados', site: 'site', inbox: 'fila de decisões', writer: 'aplicação automática', recovery: 'recuperação',
  tasks: 'automações', science: 'ciência',
  cycle: 'ciclo de aprendizado', contract: 'contrato', semantic: 'leituras simples',
};

function GuardianStrip({ guardian }: { guardian: NonNullable<SystemState['guardian']> }) {
  // The Guardião's last audit in one line: green / attention / problem, and where.
  const label = guardian.status === 'GREEN' ? 'Sistema íntegro'
    : guardian.status === 'YELLOW' ? guardian.checks_failing > 0
      ? `Atenção em ${guardian.checks_failing} de ${guardian.checks_total} verificações`
      : 'Atenção registrada'
    : `Problema em ${guardian.checks_failing} verificações`;
  const areas = [...new Set(guardian.failing_areas.map(area => {
    const value = area.split('.')[0] || '';
    return AREA_PT[value] ?? (/^[A-Z0-9_]+$/.test(value) ? 'outra parte do sistema' : value);
  }))];
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(guardian.checked_at)) / 60000));
  const ago = !Number.isFinite(minutes) ? '' : minutes < 60 ? `há ${minutes} min` : `há ${Math.round(minutes / 60)} h`;
  return (
    <p className={`guardian-strip guardian-${guardian.status.toLowerCase()}`} role="status">
      <span className="guardian-dot" aria-hidden="true" />
      <strong>{label}</strong>
      {areas.length > 0 && <span> · {areas.join(', ')}</span>}
      {ago && <span className="guardian-ago"> · Último relatório de integridade {ago}</span>}
    </p>
  );
}

