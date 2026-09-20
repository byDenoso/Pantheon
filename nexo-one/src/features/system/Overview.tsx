// Tela principal do NEXO ONE. Ordem no desktop: estado, atenção, autonomia, lanes, bus.
// No mobile a ordem passa a: atenção -> estado -> blockers -> próximas ações -> lanes (ver layout.css).
import type { ActionRecord, InboxItem, SystemState } from '../../contracts/system.ts';
import { ActionCard, HumanInboxItem, LaneState, ProjectionHealth } from '../../components/composites.tsx';
import { EmptyState } from '../../components/states.tsx';
import {
  DomainBadge, FreshnessIndicator, SeverityBadge, StatusBadge,
} from '../../components/primitives.tsx';
import {
  actionById, capabilityById, globalSummary, inboxGroups, laneViews, nextActionsFor, resolvableActions,
} from '../../viewmodels/system.ts';
import { dateTime, label, toneOf } from '../../viewmodels/tokens.ts';

export function Overview(
  { state, onOpenAction, onOpenInbox, onNavigate }:
  {
    state: SystemState;
    onOpenAction: (action: ActionRecord) => void;
    onOpenInbox: (item: InboxItem) => void;
    onNavigate: (view: 'INBOX' | 'ACTIONS' | 'TRUTHGRAPH' | 'SOURCES') => void;
  },
) {
  const summary = globalSummary(state);
  const groups = inboxGroups(state);
  const urgent = groups.flatMap(group => group.items).slice(0, 3);
  const resolvable = resolvableActions(state);
  const lanes = laneViews(state);
  const unavailableProviders = state.providers.filter(provider =>
    provider.state === 'MISSING_PROVIDER' || provider.state === 'BLOCKED').length;
  const representedProviders = Math.max(0, state.providers.length - unavailableProviders);

  return (
    <div className="overview">
      <section className="overview-pulse" aria-label="Resumo operacional" data-order="summary">
        <button className={`pulse-metric health tone-${toneOf(summary.state)}`} onClick={() => onNavigate('SOURCES')}>
          <span>Saúde</span><strong>{label(summary.state)}</strong>
        </button>
        <button className={summary.needsHuman ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('INBOX')}>
          <span>Needs Dener</span><strong>{summary.needsHuman}</strong>
        </button>
        <button className={summary.blockers.length ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('ACTIONS')}>
          <span>Blockers</span><strong>{summary.blockers.length}</strong>
        </button>
        <button className={summary.degradedCapabilities.length ? 'pulse-metric attention' : 'pulse-metric'} onClick={() => onNavigate('SOURCES')}>
          <span>Capabilities</span><strong>{summary.degradedCapabilities.length}</strong>
        </button>
      </section>

      <section className="current-state" aria-labelledby="current-state-title" data-order="state">
        <div className="section-head">
          <h2 id="current-state-title">Leitura canônica</h2>
          <div className="head-side">
            <StatusBadge state={summary.state} />
            <span className="quiet-note">última leitura {dateTime(summary.lastRead)}</span>
            <span className="quiet-note">
              Cobertura {representedProviders}/{state.providers.length} fontes com leitura ou snapshot · {unavailableProviders} indisponíveis
            </span>
          </div>
        </div>
        <div className="domain-strip">
          {summary.domains.map(domain => (
            <article key={domain.domain} className={`domain-tile tone-${toneOf(domain.state)}`}>
              <header>
                <DomainBadge domain={domain.domain} />
                <SeverityBadge severity={domain.severity} />
              </header>
              <StatusBadge state={domain.state} />
              {domain.freshness && <FreshnessIndicator freshness={domain.freshness} />}
              <p>{domain.finding?.explanation ?? 'Sem finding registrado para este domínio nesta projeção.'}</p>
              {domain.blockers.length > 0 && (
                <ul className="tile-blockers">{domain.blockers.map(b => <li key={b}>{b}</li>)}</ul>
              )}
            </article>
          ))}
        </div>
        {unavailableProviders > 0 && (
          <p className="rule-note">
            Há provider indisponível nesta compilação. Contadores em zero não cobrem o estado ausente.
          </p>
        )}
      </section>

      <section aria-labelledby="attention-title" data-order="attention">
        <div className="section-head">
          <h2 id="attention-title">Needs Dener <span>{summary.needsHuman}</span></h2>
          <button className="text-button" onClick={() => onNavigate('INBOX')}>Abrir inbox ↗</button>
        </div>
        {urgent.length
          ? urgent.map(item => (
              <HumanInboxItem key={item.id} item={item} action={actionById(state, item.action_id)} onOpen={onOpenInbox} />
            ))
          : <EmptyState title="0 itens em Needs Dener."
              description="Nenhuma decisão ou autorização humana está pendente nesta compilação."
              hint="Cobertura e integridade das fontes são verificadas separadamente." />}
      </section>

      <section aria-labelledby="autonomy-title" data-order="autonomy">
        <div className="section-head">
          <h2 id="autonomy-title">Fila autônoma elegível <span>{resolvable.length}</span></h2>
          <span className="eyebrow">SEM GATE HUMANO</span>
        </div>
        {resolvable.length
          ? <div className="card-grid">
              {resolvable.map(action => (
                <ActionCard key={action.action_id} action={action}
                  capability={capabilityById(state, action.capability_id)} onOpen={onOpenAction} />
              ))}
            </div>
          : <EmptyState title="0 ações executáveis sem gate humano."
              description="Não há ação aberta com capability executável e dependências resolvidas nesta compilação." />}
      </section>

      <section aria-labelledby="lanes-title" data-order="lanes">
        <div className="section-head">
          <h2 id="lanes-title">Próxima operação por domínio</h2>
          <span className="eyebrow">SCIENCE · ENGINEERING · OLYMPUS</span>
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
          <h2 id="bus-title">Projeção publicada</h2>
          <span className="eyebrow">{label(state.bus.state)}</span>
        </div>
        <ProjectionHealth bus={state.bus} />
      </section>
    </div>
  );
}
