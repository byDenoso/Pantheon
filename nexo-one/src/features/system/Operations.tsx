// Intervenções, tarefas e histórico de execução.
import { useCallback, useState } from 'react';
import type { ActionRecord, ExecutionRun, GraphNode, InboxItem, InboxKind, SystemState } from '../../contracts/system.ts';
import { INBOX_KINDS } from '../../contracts/system.ts';
import { ActionCard, ExecutionTrace, HumanInboxItem } from '../../components/composites.tsx';
import { EmptyState } from '../../components/states.tsx';
import { DetailDrawer } from '../../components/DetailDrawer.tsx';
import { DomainSpotlight, countByDomain } from '../../components/DomainSpotlight.tsx';
import {
  DomainBadge, Fingerprint, ReadbackBadge, SourceRef, StatusBadge,
} from '../../components/primitives.tsx';
import { ProvenanceButton } from '../../components/provenance.tsx';
import {
  actionById, blockedActions, capabilityById, humanActions, inboxGroups, provenanceOf, resolvableActions,
} from '../../viewmodels/system.ts';
import { dateTime, domainLabel, humanizeText, label, toneOf } from '../../viewmodels/tokens.ts';

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
        onClick={() => setKind('ALL')}>Exigem sua análise <b>{state.inbox.length}</b></button>
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
        ? <EmptyState title="Nenhuma decisão sua é necessária neste filtro."
            description="Aqui aparecem apenas itens que aguardam uma decisão ou informação sua. Tarefas que podem seguir sozinhas ficam na seção de tarefas." />
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

const isStalled = (node: ProjectedWorkNode) =>
  node.operational_status === 'BLOCKED' || node.operational_status === 'WAIT_DEPENDENCY';

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function AutomationChip({ node }: { node: ProjectedWorkNode }) {
  if (node.human_gate) return <span className="work-auto-chip manual" title="Esta tarefa precisa de uma decisão sua">Exige você</span>;
  if (node.automation_eligible === true) return <span className="work-auto-chip auto" title={humanizeText(node.automation_reason) || 'A tarefa está marcada como possível de automatizar'}>Pode seguir sozinha</span>;
  if (node.automation_eligible === false) return <span className="work-auto-chip manual" title={humanizeText(node.automation_reason) || 'A tarefa está marcada como não automatizável'}>Ação manual</span>;
  return <span className="work-auto-chip unknown" title="Ainda não há informação para dizer se esta tarefa pode ser automatizada" aria-label="Ainda sem informação sobre automação">Ainda sem informação sobre automação</span>;
}

const workIdOf = (node: ProjectedWorkNode) => node.id.replace(/^work:/, '').replace(/^WORK::/, '');
const technicalWorkTitle = (title: string) => /^(?:[A-Z]\d{1,3}(?:[-_: ]|$)|[A-Z0-9]+(?:[_-][A-Z0-9]+)+|[A-Z0-9][A-Z0-9 _:-]{5,})/.test(title.trim());
const workTitleOf = (node: ProjectedWorkNode) => {
  const title = node.label.replace(/^WORK::/, '');
  return title === workIdOf(node) || technicalWorkTitle(title) ? 'Etapa sem descrição simples' : humanizeText(title);
};
const priorityLabel = (value?: string) => ({
  P0: 'Urgente', CRITICAL: 'Urgente', P1: 'Alta', HIGH: 'Alta', P2: 'Normal', MEDIUM: 'Média', LOW: 'Baixa',
}[String(value || '').toUpperCase()] ?? label(value));

function stallText(node: ProjectedWorkNode) {
  const verb = node.operational_status === 'BLOCKED' ? 'Impedida de avançar' : 'Aguardando outra tarefa';
  return node.blocked_since ? `${verb} desde ${dateTime(node.blocked_since)} · há ${daysSince(node.blocked_since)} dias` : `${verb} · data de início não informada`;
}

function WorkDetail({ node, onClose }: { node: ProjectedWorkNode; onClose: () => void }) {
  const originalTitle = node.label.replace(/^WORK::/, '');
  const showOriginalTitle = originalTitle === workIdOf(node) || technicalWorkTitle(originalTitle);
  return (
    <DetailDrawer kicker={`Fila de trabalho · ${domainLabel(node.domain)}`} title={workTitleOf(node)} code={workIdOf(node)} onClose={onClose}
      fields={[
        ['Situação', <StatusBadge state={node.operational_status || node.state} tone={toneOf(node.state)} compact title={label(node.operational_status || node.state)} />],
        ['Título original da tarefa', showOriginalTitle ? <code>{originalTitle}</code> : null],
        ['Prioridade', priorityLabel(node.priority)],
        ['Como pode avançar', node.human_gate ? 'Precisa de uma decisão sua' : node.automation_eligible === true ? 'Pode seguir automaticamente' : node.automation_eligible === false ? 'Precisa de ação manual' : 'Ainda não informado'],
        ['Por que está assim', humanizeText(node.automation_reason)],
        ['Espera ou impedimento', isStalled(node) ? stallText(node) : null],
        ['O que falta', humanizeText(node.blocker)],
        ['Precisa de você', node.human_gate ? 'Sim' : null],
        ['Identificador da campanha', node.campaign_id ? <code>{node.campaign_id}</code> : null],
        ['Equipe responsável', label(node.owner_role)],
        ['Tarefa necessária antes', label(node.dependency_class)],
      ]} />
  );
}

function ProjectedWorkQueue({ rows, visible, onMore }:
  { rows: ProjectedWorkNode[]; visible: number; onMore: () => void }) {
  const shown = rows.slice(0, visible);
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const open = openId ? rows.find(node => node.id === openId) ?? null : null;
  return (
    <>
      <div className="work-queue" role="list" aria-label="Fila de trabalho publicada pela fonte oficial">
        {shown.map(node => (
          <article key={node.id} className={'work-row tone-' + toneOf(node.state) + (openId === node.id ? ' is-open' : '')} data-domain={node.domain} role="listitem">
            <button type="button" className="work-row-main" onClick={() => setOpenId(node.id)} aria-haspopup="dialog">
              <h3>{workTitleOf(node)}</h3>
              <header>
                <DomainBadge domain={node.domain} muted />
                <StatusBadge state={node.operational_status || node.state} tone={toneOf(node.state)} compact title={label(node.operational_status || node.state)} />
                {node.human_gate && <span className="work-human-chip">Exige você</span>}
                {node.priority && <span className="work-priority">{priorityLabel(node.priority)}</span>}
                <AutomationChip node={node} />
              </header>
              {isStalled(node) && (
                <p className="work-blocker">
                  <b>{stallText(node)}</b>
                  {node.blocker && <span>{humanizeText(node.blocker)}</span>}
                </p>
              )}
            </button>
          </article>
        ))}
      </div>
      {rows.length > shown.length && (
        <button className="work-more" onClick={onMore}>
          Mostrar mais <b>{Math.min(PROJECTED_WORK_PAGE, rows.length - shown.length)}</b>
          <span>{shown.length} de {rows.length}</span>
        </button>
      )}
      {open && <WorkDetail node={open} onClose={close} />}
    </>
  );
}

export function ActionsView(
  { state, onOpenAction }: { state: SystemState; onOpenAction: (action: ActionRecord) => void },
) {
  const [filter, setFilter] = useState<ActionFilter>('ALL');
  const [visibleWork, setVisibleWork] = useState(PROJECTED_WORK_PAGE);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const actionBuckets: Record<ActionFilter, ActionRecord[]> = {
    ALL: state.actions,
    AUTONOMOUS: resolvableActions(state),
    HUMAN: humanActions(state),
    WAITING: state.actions.filter(action => action.status === 'WAITING_SIDE_QUEST'),
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
    AUTONOMOUS: projectedWork.filter(node => node.automation_eligible === true && !node.human_gate),
    HUMAN: projectedWork.filter(node => node.human_gate),
    WAITING: projectedWork.filter(node => node.operational_status === 'WAIT_DEPENDENCY'),
    BLOCKED: projectedWork.filter(node => node.operational_status === 'BLOCKED'),
  };

  const hasActionRecords = state.actions.length > 0;
  const counts = hasActionRecords
    ? Object.fromEntries(Object.entries(actionBuckets).map(([key, value]) => [key, value.length])) as Record<ActionFilter, number>
    : Object.fromEntries(Object.entries(projectedBuckets).map(([key, value]) => [key, value.length])) as Record<ActionFilter, number>;
  const domainOf = (row: ActionRecord | ProjectedWorkNode) => String('lane' in row ? row.lane : row.domain ?? '');
  const inSpotlight = (row: ActionRecord | ProjectedWorkNode) => spotlight === null || domainOf(row) === spotlight;
  const actionRows = actionBuckets[filter].filter(inSpotlight);
  const workRows = projectedBuckets[filter].filter(inSpotlight);
  const spotlightDomains = countByDomain(
    (hasActionRecords ? actionBuckets[filter] : projectedBuckets[filter]).map(row => ({ domain: domainOf(row) })));

  const selectFilter = (value: ActionFilter) => {
    setFilter(value);
    setVisibleWork(PROJECTED_WORK_PAGE);
  };

  const emptyForProjectedWork = filter === 'AUTONOMOUS'
    ? {
        title: 'Nenhuma tarefa pode seguir automaticamente neste filtro.',
        description: projectedWork.some(node => typeof node.automation_eligible === 'boolean')
          ? 'A fonte oficial informou o estado de automação de ' + projectedWork.length + ' tarefas. Nenhuma delas pode seguir sozinha neste filtro.'
          : 'Ainda não há informação suficiente para dizer quais tarefas podem ser automatizadas.',
        hint: 'A lista mostra apenas o que a fonte oficial declarou; o sistema não presume automação.',
      }
    : {
        title: 'Nenhuma tarefa neste filtro.',
        description: 'A fonte oficial não publicou tarefas que correspondam a este filtro.',
        hint: 'Este resultado vale apenas para o filtro atual.',
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

      <DomainSpotlight domains={spotlightDomains} value={spotlight}
        onChange={value => { setSpotlight(value); setVisibleWork(PROJECTED_WORK_PAGE); }} />

      {!hasActionRecords && projectedWork.length > 0 && (
        <div className="work-projection-note" role="status"
          data-work-count={projectedWork.length}
          data-human-count={projectedBuckets.HUMAN.length}
          data-waiting-count={projectedBuckets.WAITING.length}
          data-blocked-count={projectedBuckets.BLOCKED.length}>
          <div>
          <strong>{projectedWork.length} tarefas publicadas pela fonte oficial.</strong>
            <span>Esta fila é somente para consulta. Uma tarefa só aparece como automática quando há autorização, serviço executor e confirmação da alteração.</span>
          </div>
          <span className="work-projection-mode">Somente leitura</span>
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
              description="Não há ações registradas que correspondam a este filtro."
              hint="A contagem inclui ações prontas para execução; pode haver outras tarefas ainda sem esse registro." />
        : projectedWork.length
          ? workRows.length
            ? <ProjectedWorkQueue rows={workRows} visible={visibleWork}
                onMore={() => setVisibleWork(value => value + PROJECTED_WORK_PAGE)} />
            : <EmptyState {...emptyForProjectedWork} />
          : <EmptyState title="Nenhuma tarefa publicada."
              description="A fonte oficial não publicou tarefas nem ações nesta atualização."
              hint="Consulte Fontes e Integridade para saber se a leitura está completa." />}

      <p className="write-disabled standalone">
        Esta tela é somente para consulta. As tarefas mostram a fila publicada pela fonte oficial; uma ação só aparece
        como automática quando há autorização, serviço executor e confirmação explícitos da alteração.
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
        description="Não há detalhes de execução nesta atualização. Isso não confirma sucesso nem indica que o sistema esteja parado."
        hint="Quando houver uma execução registrada, seus detalhes aparecerão aqui." />
      <p className="rule-note">
        <strong>Como confirmamos uma alteração:</strong> ação solicitada → recurso autorizado → serviço executor → alteração produzida → confirmação da fonte. Só consideramos a alteração aplicada quando a fonte confirma.
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
              <StatusBadge state={run.status} compact title={label(run.status)} />
            </span>
            <strong>{humanizeText(run.title)}</strong>
            <span className="run-meta">
              <time>{dateTime(run.started_at)}</time>
              {run.retries > 0 && <em>{run.retries} novas tentativas</em>}
            </span>
          </button>
        ))}
      </aside>
      <section className="run-detail">
        <div className="section-head">
          <h2>{humanizeText(selected.title)}</h2>
          <StatusBadge state={selected.status} title={label(selected.status)} />
        </div>
        <dl className="meta-row">
          <div><dt>Serviço executor</dt><dd>{label(selected.runtime)}</dd></div>
          <div><dt>Início</dt><dd>{dateTime(selected.started_at)}</dd></div>
          <div><dt>Fim</dt><dd>{selected.ended_at ? dateTime(selected.ended_at) : <em>em aberto</em>}</dd></div>
          <div><dt>Novas tentativas</dt><dd>{selected.retries}</dd></div>
        </dl>
        <details className="run-technical"><summary>Identificadores e comprovante</summary>
          <dl className="meta-row">
            <div><dt>Execução</dt><dd><code>{selected.run_id}</code></dd></div>
            <div><dt>Ação</dt><dd><code>{selected.action_id}</code></dd></div>
            <div><dt>Recurso autorizado</dt><dd>{selected.capability_id ? <code>{selected.capability_id}</code> : <em>nenhum</em>}</dd></div>
            <div><dt>Resultado produzido</dt><dd>{selected.effect_key ? <code>{selected.effect_key}</code> : <em>sem alteração registrada</em>}</dd></div>
            <div><dt>Comprovante</dt><dd>{selected.receipt_ref ? <SourceRef value={selected.receipt_ref} /> : <em>não disponível</em>}</dd></div>
          </dl>
        </details>
        <ExecutionTrace run={selected} />
        <div className={`readback-panel tone-${toneOf(selected.readback.status)}`}>
          <div className="readback-head">
            <ReadbackBadge readback={selected.readback} />
          </div>
          <p>{humanizeText(selected.readback.explanation)}</p>
          <details className="run-technical"><summary>Assinatura conferida na fonte</summary><Fingerprint value={selected.readback.observed_fingerprint} /></details>
          {selected.readback.status === 'FAILED' && (
            <p className="readback-rule" role="alert">
              Uma alteração sem confirmação da fonte não conta como aplicada. Tente novamente só depois de conferir a fonte.
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
