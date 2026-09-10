// Human Inbox, Actions e Execution trace.
import { useState } from 'react';
import type { ActionRecord, ExecutionRun, InboxItem, InboxKind, SystemState } from '../../contracts/system.ts';
import { INBOX_KINDS } from '../../contracts/system.ts';
import { ActionCard, ExecutionTrace, HumanInboxItem } from '../../components/composites.tsx';
import { EmptyState } from '../../components/states.tsx';
import {
  DomainBadge, Fingerprint, ReadbackBadge, SourceRef, StatusBadge,
} from '../../components/primitives.tsx';
import { ProvenanceButton } from '../../components/provenance.tsx';
import {
  actionById, blockedActions, capabilityById, humanActions, inboxGroups, provenanceOf, resolvableActions,
} from '../../viewmodels/system.ts';
import { dateTime, label, toneOf } from '../../viewmodels/tokens.ts';
import { BrokerPendingConfirmations, BrokerRecentExecutions } from './BrokerEvidence.tsx';

export function InboxView(
  { state, onOpenInbox }: { state: SystemState; onOpenInbox: (item: InboxItem) => void },
) {
  const [kind, setKind] = useState<InboxKind | 'ALL'>('ALL');
  const groups = inboxGroups(state).filter(group => kind === 'ALL' || group.kind === kind);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <>
      <BrokerPendingConfirmations />
      <div className="filter-row" role="group" aria-label="Filtrar por tipo de intervenção">
        <button className={kind === 'ALL' ? 'filter active' : 'filter'} aria-pressed={kind === 'ALL'}
          onClick={() => setKind('ALL')}>Todos</button>
        {INBOX_KINDS.map(value => {
          const count = state.inbox.filter(i => i.kind === value).length;
          return (
            <button key={value} className={kind === value ? 'filter active' : 'filter'} aria-pressed={kind === value}
              onClick={() => setKind(value)} disabled={count === 0}>
              {label(value)} <b>{count}</b>
            </button>
          );
        })}
      </div>
      {total === 0
        ? <EmptyState title="Nenhuma intervenção humana pendente neste filtro."
            description="O Human Inbox mostra decisões canônicas e o Action Broker mostra confirmações de execução privadas." />
        : groups.map(group => (
            <section key={group.kind}>
              <div className="section-head">
                <h2>{label(group.kind)} <span>{group.items.length}</span></h2>
              </div>
              {group.items.map(item => (
                <HumanInboxItem key={item.id} item={item} action={actionById(state, item.action_id)} onOpen={onOpenInbox} />
              ))}
            </section>
          ))}
    </>
  );
}

type ActionFilter = 'ALL' | 'AUTONOMOUS' | 'HUMAN' | 'BLOCKED';

export function ActionsView(
  { state, onOpenAction }: { state: SystemState; onOpenAction: (action: ActionRecord) => void },
) {
  const [filter, setFilter] = useState<ActionFilter>('ALL');
  const buckets: Record<ActionFilter, ActionRecord[]> = {
    ALL: state.actions,
    AUTONOMOUS: resolvableActions(state),
    HUMAN: humanActions(state),
    BLOCKED: blockedActions(state),
  };
  const rows = buckets[filter];
  return (
    <>
      <div className="filter-row" role="group" aria-label="Filtrar ações">
        {(['ALL', 'AUTONOMOUS', 'HUMAN', 'BLOCKED'] as ActionFilter[]).map(value => (
          <button key={value} className={filter === value ? 'filter active' : 'filter'} aria-pressed={filter === value}
            onClick={() => setFilter(value)}>
            {{ ALL: 'Todas', AUTONOMOUS: 'NEXO pode resolver', HUMAN: 'Exigem você', BLOCKED: 'Bloqueadas' }[value]}
            <b>{buckets[value].length}</b>
          </button>
        ))}
      </div>
      {rows.length
        ? <div className="card-grid">
            {rows.map(action => (
              <ActionCard key={action.action_id} action={action}
                capability={capabilityById(state, action.capability_id)} onOpen={onOpenAction} />
            ))}
          </div>
        : <EmptyState title="Nenhuma ação neste filtro."
            description="Uma lista vazia aqui não significa sistema ocioso; verifique Integrity e TruthGraph." />}
      <p className="write-disabled standalone">
        Escritas só ficam disponíveis ao abrir uma ação e passar pelo Action Broker privado. O browser nunca fala
        diretamente com Google, GitHub ou Vercel.
      </p>
    </>
  );
}

export function ExecutionView(
  { state, selectedRunId, onSelectRun }:
  { state: SystemState; selectedRunId: string | null; onSelectRun: (runId: string | null) => void },
) {
  const runs = [...state.runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const selected: ExecutionRun | null = runs.find(r => r.run_id === selectedRunId) ?? runs[0] ?? null;
  return (
    <>
      <BrokerRecentExecutions />
      {!selected
        ? <EmptyState title="Nenhuma execução canônica registrada."
            description="Receipts privados do Action Broker aparecem acima; EXECUTION_RUNS canônico aparece aqui quando disponível." />
        : <div className="execution-layout">
            <aside className="run-list" aria-label="Execuções recentes">
              {runs.map(run => (
                <button key={run.run_id} className={`run-row tone-${toneOf(run.status)}${run.run_id === selected.run_id ? ' active' : ''}`}
                  onClick={() => onSelectRun(run.run_id)} aria-current={run.run_id === selected.run_id ? 'true' : undefined}>
                  <span className="run-head">
                    <DomainBadge domain={run.lane} muted />
                    <StatusBadge state={run.status} compact />
                  </span>
                  <strong>{run.title}</strong>
                  <span className="run-meta">
                    <code>{run.run_id}</code>
                    <time>{dateTime(run.started_at)}</time>
                    {run.retries > 0 && <em>{run.retries} retries</em>}
                  </span>
                </button>
              ))}
            </aside>
            <section className="run-detail">
              <div className="section-head">
                <h2>{selected.title}</h2>
                <StatusBadge state={selected.status} />
              </div>
              <dl className="meta-row">
                <div><dt>action_id</dt><dd><code>{selected.action_id}</code></dd></div>
                <div><dt>capability</dt><dd>{selected.capability_id ? <code>{selected.capability_id}</code> : <em>nenhuma</em>}</dd></div>
                <div><dt>runtime</dt><dd>{label(selected.runtime)}</dd></div>
                <div><dt>effect_key</dt><dd>{selected.effect_key ? <code>{selected.effect_key}</code> : <em>sem efeito</em>}</dd></div>
                <div><dt>início</dt><dd>{dateTime(selected.started_at)}</dd></div>
                <div><dt>fim</dt><dd>{selected.ended_at ? dateTime(selected.ended_at) : <em>em aberto</em>}</dd></div>
                <div><dt>retries</dt><dd>{selected.retries}</dd></div>
                <div><dt>receipt</dt><dd>{selected.receipt_ref ? <SourceRef value={selected.receipt_ref} /> : <em>sem recibo</em>}</dd></div>
              </dl>
              <ExecutionTrace run={selected} />
              <div className={`readback-panel tone-${toneOf(selected.readback.status)}`}>
                <div className="readback-head">
                  <ReadbackBadge readback={selected.readback} />
                  <Fingerprint value={selected.readback.observed_fingerprint} />
                </div>
                <p>{selected.readback.explanation}</p>
                {selected.readback.status === 'FAILED' && (
                  <p className="readback-rule" role="alert">
                    Um efeito sem readback confirmado não conta como aplicado. Reexecutar só depois de reconciliar a fonte.
                  </p>
                )}
              </div>
              <footer className="run-footer">
                <ProvenanceButton title={`Execução ${selected.run_id}`} provenance={provenanceOf({
                  source_ref: selected.receipt_ref ?? `action://register/${selected.action_id}`,
                  fingerprint: selected.steps.find(s => s.fingerprint)?.fingerprint ?? selected.run_id,
                  checked_at: selected.readback.checked_at ?? selected.started_at,
                  derivation_rule: 'execution_runs(limit=50)', projection_role: 'AUDIT', authority_class: 'DERIVED',
                })} />
              </footer>
            </section>
          </div>}
    </>
  );
}