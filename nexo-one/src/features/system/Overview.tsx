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

  return (
    <div className="overview">
      <section className="current-state" aria-labelledby="current-state-title" data-order="state">
        <div className="section-head">
          <h2 id="current-state-title">Estado atual</h2>
          <div className="head-side">
            <StatusBadge state={summary.state} />
            <span className="quiet-note">última leitura {dateTime(summary.lastRead)}</span>
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
              <p>{domain.finding?.explanation ?? 'Sem achado registrado para este domínio.'}</p>
              {domain.blockers.length > 0 && (
                <ul className="tile-blockers">{domain.blockers.map(b => <li key={b}>{b}</li>)}</ul>
              )}
            </article>
          ))}
        </div>
        <div className="state-counters">
          <button onClick={() => onNavigate('TRUTHGRAPH')} className={summary.conflicts.length ? 'counter conflict' : 'counter'}>
            <strong>{summary.conflicts.length}</strong><span>conflitos abertos</span>
          </button>
          <button onClick={() => onNavigate('ACTIONS')} className="counter">
            <strong>{summary.blockers.length}</strong><span>blockers</span>
          </button>
          <button onClick={() => onNavigate('SOURCES')} className="counter">
            <strong>{summary.degradedCapabilities.length}</strong><span>capabilities sem PASS</span>
          </button>
          <button onClick={() => onNavigate('INBOX')} className="counter">
            <strong>{summary.needsHuman}</strong><span>exigem você</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="attention-title" data-order="attention">
        <div className="section-head">
          <h2 id="attention-title">Precisa de você <span>{summary.needsHuman}</span></h2>
          <button className="text-button" onClick={() => onNavigate('INBOX')}>Ver Human Inbox ↗</button>
        </div>
        {urgent.length
          ? urgent.map(item => (
              <HumanInboxItem key={item.id} item={item} action={actionById(state, item.action_id)} onOpen={onOpenInbox} />
            ))
          : <EmptyState title="Nada exige decisão humana nesta leitura."
              description="Isto não significa que o sistema está saudável — significa que nada depende de você agora."
              hint="Confira Integrity para o que não pôde ser provado." />}
      </section>

      <section aria-labelledby="autonomy-title" data-order="autonomy">
        <div className="section-head">
          <h2 id="autonomy-title">NEXO pode resolver <span>{resolvable.length}</span></h2>
          <span className="eyebrow">SEM GATE HUMANO</span>
        </div>
        {resolvable.length
          ? <div className="card-grid">
              {resolvable.map(action => (
                <ActionCard key={action.action_id} action={action}
                  capability={capabilityById(state, action.capability_id)} onOpen={onOpenAction} />
              ))}
            </div>
          : <EmptyState title="Nenhuma ação elegível para autonomia."
              description="Toda ação aberta depende de decisão humana ou de uma capability sem prova de execução." />}
      </section>

      <section aria-labelledby="lanes-title" data-order="lanes">
        <div className="section-head">
          <h2 id="lanes-title">Próximas ações por lane</h2>
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
          <h2 id="bus-title">Projection health</h2>
          <span className="eyebrow">{label(state.bus.state)}</span>
        </div>
        <ProjectionHealth bus={state.bus} />
      </section>
    </div>
  );
}
