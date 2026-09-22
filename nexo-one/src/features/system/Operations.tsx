// Human Inbox, Actions e Execution trace.
import { useState } from 'react';
import type { ActionRecord, ExecutionRun, GraphNode, InboxItem, InboxKind, SystemState } from '../../contracts/system.ts';
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

export function InboxView(
  { state, onOpenInbox }: { state: SystemState; onOpenInbox: (item: InboxItem) => void },
) {
  const [kind, setKind] = useState<InboxKind | 'ALL'>('ALL');
  const groups = inboxGroups(state).filter(group => kind === 'ALL' || group.kind === kind);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <>
      <div className="filter-row" role="group" aria-label="Filtrar por tipo de intervenção">
        <button className={kind === 'ALL' ? 'filter active' : 'filter'} aria-pressed={kind === 'ALL'}
          onClick={() => setKind('ALL')}>Needs Dener <b>{state.inbox.length}</b></button>
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
        ? <EmptyState title="Nenhum Needs Dener pendente neste filtro."
            description="Esta superfície mostra apenas gates com requisito humano explícito vindo da Tower. Ações autônomas continuam em Actions." />
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


type ActionFilter = 'ALL' | 'AUTONOMOUS' | 'HUMAN' | 'WAITING' | 'BLOCKED';
type ProjectedWorkNode = GraphNode & { type: 'ACTION' };
const PROJECTED_WORK_PAGE = 40;

const priorityRank = (value?: string): number =>
  ({ P0: 0, CRITICAL: 0, HIGH: 1, P1: 1, MEDIUM: 2, NORMAL: 3, LOW: 4 }[String(value || '').toUpperCase()] ?? 5);

const sortProjectedWork = (rows: ProjectedWorkNode[]): ProjectedWorkNode[] =>
  [...rows].sort((a, b) => Number(Boolean(b.human_gate)) - Number(Boolean(a.human_gate))
    || Number(b.operational_status === 'BLOCKED') - Number(a.operational_status === 'BLOCKED')
    || Number(b.operational_status === 'WAIT_DEPENDENCY') - Number(a.operational_status === 'WAIT_DEPENDENCY')
    || priorityRank(a.priority) - priorityRank(b.priority)
    || a.domain.localeCompare(b.domain)
    || a.label.localeCompare(b.label));

function ProjectedWorkQueue({ rows, visible, onMore }:
  { rows: ProjectedWorkNode[]; visible: number; onMore: () => void }) {
  const shown = rows.slice(0, visible);
  return (
    <>
      <div className="work-queue" role="list" aria-label="WORK projetado pela Tower">
        {shown.map(node => (
          <article key={node.id} className={'work-row tone-' + toneOf(node.state)} role="listitem">
            <div className="work-row-main">
              <header>
                <DomainBadge domain={node.domain} muted />
                <StatusBadge state={node.operational_status || node.state} tone={toneOf(node.state)} compact />
                {node.human_gate && <span className="work-human-chip">Needs Dener</span>}
                {node.priority && <span className="work-priority">{node.priority}</span>}
              </header>
              <h3>{node.label}</h3>
              <div className="work-row-meta">
                <code>{node.id.replace(/^work:/, '')}</code>
                {node.campaign_id && <span>{node.campaign_id}</span>}
                {node.owner_role && <span>{node.owner_role}</span>}
                {node.dependency_class && <span>{node.dependency_class}</span>}
              </div>
            </div>
          </article>
        ))}
      </div>
      {rows.length > shown.length && (
        <button className="work-more" onClick={onMore}>
          Mostrar mais <b>{Math.min(PROJECTED_WORK_PAGE, rows.length - shown.length)}</b>
          <span>{shown.length} de {rows.length}</span>
        </button>
      )}
    </>
  );
}

export function ActionsView(
  { state, onOpenAction }: { state: SystemState; onOpenAction: (action: ActionRecord) => void },
) {
  const [filter, setFilter] = useState<ActionFilter>('ALL');
  const [visibleWork, setVisibleWork] = useState(PROJECTED_WORK_PAGE);
  const actionBuckets: Record<ActionFilter, ActionRecord[]> = {
    ALL: state.actions,
    AUTONOMOUS: resolvableActions(state),
    HUMAN: humanActions(state),
    WAITING: state.actions.filter(action => action.state === 'BLOCKED' && action.dependency_ids.length > 0),
    BLOCKED: blockedActions(state),
  };

  // Pages intentionally publishes WORK as a read-only Tower projection, not as an
  // executable ActionRecord. Showing these nodes prevents "0 actions" from erasing
  // real canonical work while preserving the capability/runtime authority boundary.
  const projectedWork = sortProjectedWork(
    (state.projected_work || state.graph.nodes)
      .filter((node): node is ProjectedWorkNode => node.type === 'ACTION'),
  );
  const projectedBuckets: Record<ActionFilter, ProjectedWorkNode[]> = {
    ALL: projectedWork,
    AUTONOMOUS: [],
    HUMAN: projectedWork.filter(node => node.human_gate),
    WAITING: projectedWork.filter(node => node.operational_status === 'WAIT_DEPENDENCY'),
    BLOCKED: projectedWork.filter(node => node.operational_status === 'BLOCKED'),
  };

  const hasActionRecords = state.actions.length > 0;
  const counts = hasActionRecords
    ? Object.fromEntries(Object.entries(actionBuckets).map(([key, value]) => [key, value.length])) as Record<ActionFilter, number>
    : Object.fromEntries(Object.entries(projectedBuckets).map(([key, value]) => [key, value.length])) as Record<ActionFilter, number>;
  const actionRows = actionBuckets[filter];
  const workRows = projectedBuckets[filter];

  const selectFilter = (value: ActionFilter) => {
    setFilter(value);
    setVisibleWork(PROJECTED_WORK_PAGE);
  };

  const emptyForProjectedWork = filter === 'AUTONOMOUS'
    ? {
        title: 'Nenhuma autonomia comprovada.',
        description: 'Há ' + projectedWork.length + ' WORK projetados, mas esta projeção pública não publica o binding ActionRecord → capability → runtime.',
        hint: 'Por isso o NEXO não presume elegibilidade de execução.',
      }
    : {
        title: 'Nenhum WORK neste filtro.',
        description: 'A Tower não projetou nenhum item que corresponda a este recorte.',
        hint: 'Isso é um vazio do filtro atual, não uma afirmação sobre outras fontes.',
      };

  return (
    <>
      <div className="filter-row" role="group" aria-label="Filtrar ações">
        {(['ALL', 'AUTONOMOUS', 'HUMAN', 'WAITING', 'BLOCKED'] as ActionFilter[]).map(value => (
          <button key={value} className={filter === value ? 'filter active' : 'filter'} aria-pressed={filter === value}
            onClick={() => selectFilter(value)}>
            {{ ALL: 'Todas', AUTONOMOUS: 'NEXO pode resolver', HUMAN: 'Exigem você', WAITING: 'Aguardam dependência', BLOCKED: 'Bloqueadas' }[value]}
            <b>{counts[value]}</b>
          </button>
        ))}
      </div>

      {!hasActionRecords && projectedWork.length > 0 && (
        <div className="work-projection-note" role="status"
          data-work-count={projectedWork.length}
          data-human-count={projectedBuckets.HUMAN.length}
          data-waiting-count={projectedBuckets.WAITING.length}
          data-blocked-count={projectedBuckets.BLOCKED.length}>
          <div>
            <strong>{projectedWork.length} WORK na projeção da Tower.</strong>
            <span>Fila canônica visível; execução autônoma só é afirmada quando existir ActionRecord com capability e runtime vinculados.</span>
          </div>
          <span className="work-projection-mode">READ ONLY</span>
        </div>
      )}

      {hasActionRecords
        ? actionRows.length
          ? <div className="card-grid">
              {actionRows.map(action => (
                <ActionCard key={action.action_id} action={action}
                  capability={capabilityById(state, action.capability_id)} onOpen={onOpenAction} />
              ))}
            </div>
          : <EmptyState title="Nenhuma ação neste filtro."
              description="Não há ActionRecord que corresponda a este recorte."
              hint="A contagem reflete o registro executável, não todo WORK existente na Tower." />
        : projectedWork.length
          ? workRows.length
            ? <ProjectedWorkQueue rows={workRows} visible={visibleWork}
                onMore={() => setVisibleWork(value => value + PROJECTED_WORK_PAGE)} />
            : <EmptyState {...emptyForProjectedWork} />
          : <EmptyState title="Nenhuma ação projetada."
              description="Não há ActionRecord nem WORK da Tower nesta compilação."
              hint="Nesse caso, Sources e Integrity determinam se o vazio é real ou se faltou cobertura." />}

      <p className="write-disabled standalone">
        Esta visão é read-only. WORK representa a fila canônica projetada; ActionRecord representa trabalho com contrato
        executável. A interface não promove um WORK a ação autônoma sem capability, runtime e readback explícitos.
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
  if (!selected) {
    return <>
      <EmptyState title="Nenhuma execução registrada."
        description="Não existe ExecutionRun nesta compilação. A ausência do trace não deve ser interpretada como execução bem-sucedida nem como sistema ocioso."
        hint="Quando houver execução, ela aparece abaixo segundo o contrato auditável completo." />
      <p className="rule-note">
        <strong>Fluxo esperado:</strong> ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK. Um efeito só conta como aplicado depois de readback confirmado.
      </p>
    </>;
  }
  return (
    <div className="execution-layout">
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
    </div>
  );
}
