// Componentes compostos. Recebem contrato, nunca fixtures.
import type {
  ActionRecord, Capability, ExecutionRun, ExecutionStage, InboxItem, LaneSnapshot, ProjectionBus, TruthFinding,
} from '../contracts/system.ts';
import { EXECUTION_STAGES } from '../contracts/system.ts';
import type { CapabilityCell } from '../viewmodels/system.ts';
import { provenanceOf } from '../viewmodels/system.ts';
import { dateTime, humanizeActionText, humanizeText, label, shortTime, toneOf } from '../viewmodels/tokens.ts';
import {
  AuthorityBadge, CapabilityBadge, DomainBadge, Fingerprint, FreshnessIndicator,
  ReadbackBadge, SeverityBadge, SourceRef, StatusBadge,
} from './primitives.tsx';
import { ProvenanceButton } from './provenance.tsx';

const EXECUTION_STAGE_LABEL: Record<ExecutionStage, string> = {
  ACTION: 'Ação solicitada', CAPABILITY: 'Permissão conferida', RUNTIME: 'Serviço acionado',
  EFFECT: 'Resultado registrado', READBACK: 'Resultado confirmado na fonte',
};

export function ExecutionTrace({ run, compact }: { run: ExecutionRun; compact?: boolean }) {
  return (
    <div className={`execution-trace${compact ? ' compact' : ''}`}>
      <ol className="trace-rail">
        {EXECUTION_STAGES.map(stage => {
          const step = run.steps.find(s => s.stage === stage);
          const tone = step ? toneOf(step.status) : 'unknown';
          return (
            <li key={stage} className={`trace-step tone-${tone}`}>
              <span className="trace-stage">{EXECUTION_STAGE_LABEL[stage]}</span>
              <span className="trace-node" aria-hidden="true"><i /></span>
              <span className="trace-label">{humanizeText(step?.label) || 'sem registro'}</span>
              <span className="trace-status">{label(step?.status ?? 'UNKNOWN')}</span>
              {!compact && (
                <>
                  <span className="trace-detail">{humanizeText(step?.detail) || 'Nenhum evento registrado nesta etapa.'}</span>
                  <span className="trace-meta"><time>{step?.at ? shortTime(step.at) : 'sem horário registrado'}</time></span>
                  {step?.fingerprint && <details className="trace-technical"><summary>Dados técnicos</summary><Fingerprint value={step.fingerprint} /></details>}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TruthGraphCard({ finding, capability }: { finding: TruthFinding; capability?: Capability | null }) {
  const mismatch = finding.provider.observed !== finding.provider.expected;
  return (
    <article className={`truth-card tone-${toneOf(finding.status)}${finding.status === 'CONFLICT' ? ' conflict' : ''}`}>
      <header>
        <DomainBadge domain={finding.domain} />
        <SeverityBadge severity={finding.severity} />
        <StatusBadge state={finding.status} />
      </header>
      {finding.status === 'CONFLICT' && (
        <p className="conflict-banner" role="alert">
          <strong>Conflito de autoridade.</strong> Nenhuma leitura deste domínio pode ser tratada como verdade
          enquanto a posse não for resolvida.
        </p>
      )}
      <dl className="truth-grid">
        <div>
          <dt>Responsável pela fonte confiável</dt>
          <dd>{finding.authority.owner} <AuthorityBadge authority={finding.authority.class} /></dd>
        </div>
        <div>
          <dt>Fonte esperada</dt>
          <dd>{finding.provider.expected ? label(finding.provider.expected) : <em>nenhuma</em>}</dd>
        </div>
        <div className={mismatch ? 'mismatch' : undefined}>
          <dt>Fonte que respondeu</dt>
          <dd>{finding.provider.observed ? label(finding.provider.observed) : <em>nenhuma</em>}
            {mismatch && <span className="mismatch-flag">divergente</span>}</dd>
        </div>
        <div>
          <dt>Permissão de ação</dt>
          <dd>{finding.capability_state && finding.capability_state !== 'N/A'
              ? <span className={`capability-summary capability-${finding.capability_state.toLowerCase()}`}>
                {label(finding.capability_state)} · {finding.capability_summary}
              </span>
              : capability ? <CapabilityBadge status={capability.status} id={capability.capability_id} />
              : '— nenhuma'}</dd>
        </div>
        <div>
          <dt>Atualidade dos dados</dt>
          <dd>
            <FreshnessIndicator freshness={finding.freshness} />
            {finding.source_observed_at && <small className="freshness-detail">Fonte: {dateTime(finding.source_observed_at)} · verificado: {dateTime(finding.checked_at)}</small>}
          </dd>
        </div>
      </dl>
      <p className="truth-explanation">{humanizeText(finding.explanation)}</p>
      <footer>
        <ProvenanceButton title={`${finding.domain} · conferência de fontes`} provenance={provenanceOf({
          source_ref: finding.source_ref, fingerprint: finding.fingerprint,
          authority_class: finding.authority.class, checked_at: finding.checked_at,
          freshness: finding.freshness, derivation_rule: 'truth_findings(domain)', projection_role: 'INTEGRITY',
        })} />
      </footer>
      <details className="truth-technical">
        <summary>Identificadores e origem técnica</summary>
        <SourceRef value={finding.source_ref} dim /><Fingerprint value={finding.fingerprint} />
      </details>
    </article>
  );
}

function capabilityMeta(capability: Capability): string | null {
  if (!capability.operation && !capability.risk) return null;
  return `${capability.operation ? label(capability.operation) : 'operação não publicada'} · ${capability.risk ? `risco ${label(capability.risk).toLowerCase()}` : 'risco não publicado'}`;
}

function CapabilityChip({ capability, onSelect }: { capability: Capability; onSelect?: (capability: Capability) => void }) {
  const meta = capabilityMeta(capability);
  return (
    <button className="capability-chip" onClick={() => onSelect?.(capability)}
      title={[capability.explanation, meta ?? 'Operação e risco não publicados'].filter(Boolean).join(' — ')}>
      <i aria-hidden="true" className={`glyph glyph-${toneOf(capability.status)}`} />
      <span>{capability.label}</span>
      {meta && <small>{meta}</small>}
    </button>
  );
}

/** Agrupa séries numeradas (PEER.DETECTION.D00_V1…D25_V1) numa família expansível. */
export function capabilityFamilies(capabilities: Capability[]) {
  const families = new Map<string, Capability[]>();
  for (const capability of capabilities) {
    const key = capability.label.replace(/([._-])D\d+(?:[._-]V\d+)?$/i, '$1D*');
    families.set(key, [...(families.get(key) ?? []), capability]);
  }
  return [...families].map(([key, members]) => ({
    key, members,
    status: members.find(m => m.status !== 'PASS' && m.status !== 'UNVERIFIED')?.status
      ?? (members.some(m => m.status === 'UNVERIFIED') ? 'UNVERIFIED' : 'PASS'),
  }));
}

export function CapabilityMatrix(
  { runtimes, cells, onSelect }:
  { runtimes: string[]; cells: CapabilityCell[]; onSelect?: (capability: Capability) => void },
) {
  const domains = [...new Set(cells.map(c => c.domain))];
  return (
    <div className="matrix-scroll">
      <table className="capability-matrix">
        <caption className="visually-hidden">Capabilities por domínio e runtime</caption>
        <thead>
          <tr>
            <th scope="col">Domínio</th>
            {runtimes.map(runtime => <th key={runtime} scope="col">{label(runtime)}</th>)}
          </tr>
        </thead>
        <tbody>
          {domains.map(domain => (
            <tr key={domain}>
              <th scope="row"><DomainBadge domain={domain} /></th>
              {runtimes.map(runtime => {
                const cell = cells.find(c => c.domain === domain && c.runtime === runtime);
                if (!cell) return <td key={runtime} className="matrix-cell empty"><span className="no-capability">nenhum recurso publicado</span></td>;
                return (
                  <td key={runtime} className={`matrix-cell tone-${toneOf(cell.status)}`}>
                    <span className="cell-status"><CapabilityBadge status={cell.status} /></span>
                    <ul>
                      {capabilityFamilies(cell.capabilities).map(family => family.members.length < 3
                        ? family.members.map(capability => (
                            <li key={capability.capability_id}><CapabilityChip capability={capability} onSelect={onSelect} /></li>
                          ))
                        : (
                          <li key={family.key} className="capability-family">
                            <details>
                              <summary>
                                <i aria-hidden="true" className={`glyph glyph-${toneOf(family.status)}`} />
                                <span>{family.key}</span>
                                <b>{family.members.length}</b>
                              </summary>
                              <ul>
                                {family.members.map(capability => (
                                  <li key={capability.capability_id}><CapabilityChip capability={capability} onSelect={onSelect} /></li>
                                ))}
                              </ul>
                            </details>
                          </li>
                        ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HumanInboxItem(
  { item, action, onOpen }: { item: InboxItem; action?: ActionRecord | null; onOpen?: (item: InboxItem) => void },
) {
  const humanHeading = item.kind === 'CONFIGURAR_ACESSO'
    ? 'O QUE VOCÊ PRECISA AUTORIZAR / CONFIGURAR'
    : 'O QUE DEPENDE DE VOCÊ';
  return (
    <article className={`inbox-item tone-${toneOf(item.severity === 'P0' ? 'CONFLICT' : 'DEGRADED')}`}>
      <header>
        <span className="inbox-kind">{item.kind_label ?? label(item.kind)}</span>
        <DomainBadge domain={item.domain} muted />
        <SeverityBadge severity={item.severity} />
        {item.due_at && <time className="inbox-due">prazo {dateTime(item.due_at)}</time>}
      </header>
      <h3>{humanizeText(item.title)}</h3>
      <p className="inbox-question">{humanizeText(item.question)}</p>
      <p className="inbox-why"><span className="eyebrow">POR QUE ISSO IMPORTA</span>{humanizeText(item.why)}</p>
      {(item.human_requirements?.length ?? 0) > 0 && (
        <div className="inbox-requirements">
          <span className="eyebrow">{humanHeading}</span>
          <ul className="inbox-options">
            {item.human_requirements!.map(requirement => (
              <li key={requirement.id}>
                <strong>{humanizeText(requirement.label)}</strong>
                <span>{humanizeText(requirement.detail)}</span>
                {requirement.state && <small>situação: {label(requirement.state)}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.options.length > 0 && !(item.human_requirements?.length) && (
        <ul className="inbox-options">
          {item.options.map(option => (
            <li key={option.id}>
              <strong>{humanizeText(option.label)}</strong>
              <span>{humanizeText(option.consequence)}</span>
            </li>
          ))}
        </ul>
      )}
      {item.action_location && (
        <p className="inbox-why inbox-location">
          <span className="eyebrow">ONDE RESOLVER</span>{humanizeText(item.action_location)}
        </p>
      )}
      {(item.automatic_requirements?.length ?? 0) > 0 && (
        <div className="inbox-requirements inbox-automatic">
          <span className="eyebrow">NÃO É AÇÃO SUA</span>
          <ul className="inbox-options">
            {item.automatic_requirements!.map(requirement => (
              <li key={requirement.id}>
                <strong>{humanizeText(requirement.label)}{requirement.retryable ? ' · nova tentativa automática' : ''}</strong>
                <span>{humanizeText(requirement.detail)}</span>
                {requirement.state && <small>situação: {label(requirement.state)}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.system_next && (
        <p className="inbox-why inbox-system-next">
          <span className="eyebrow">DEPOIS DISSO</span>{humanizeText(item.system_next)}
        </p>
      )}
      {(item.readback_criteria?.length ?? 0) > 0 && (
        <div className="inbox-readback">
          <span className="eyebrow">O QUE PRECISA SER CONFIRMADO</span>
          <ul>
            {item.readback_criteria!.map((criterion, index) => <li key={index}>{humanizeText(criterion)}</li>)}
          </ul>
        </div>
      )}
      <footer>
        {onOpen && <button className="text-button" onClick={() => onOpen(item)}>Abrir contexto ↗</button>}
      </footer>
      <details className="inbox-technical">
        <summary>Rastreabilidade técnica</summary>
        {action && <span className="inbox-action-ref">ação {action.action_id}</span>}
        <SourceRef value={item.source_ref} dim />
        <ProvenanceButton title={item.title} provenance={provenanceOf({
          source_ref: item.source_ref, fingerprint: item.fingerprint, checked_at: item.checked_at,
          freshness: item.freshness, derivation_rule: 'human_gates(open=true)', projection_role: 'COCKPIT',
          authority_class: 'DERIVED',
        })} />
      </details>
      <p className="write-disabled">
        Decisões são registradas fora desta interface. O frontend não executa escrita.
      </p>
    </article>
  );
}

export function LaneState(
  { lane, actions, onSelectAction }:
  { lane: LaneSnapshot; actions: ActionRecord[]; onSelectAction?: (action: ActionRecord) => void },
) {
  const next = actions.find(a => a.status !== 'APPLIED' && a.status !== 'NO_OP_ALREADY_APPLIED') ?? actions[0] ?? null;
  return (
    <article className={`lane-card tone-${toneOf(lane.state)}`} data-domain={lane.domain}>
      <header>
        <DomainBadge domain={lane.domain} />
        <StatusBadge state={lane.state} />
        <FreshnessIndicator freshness={lane.freshness} showTime={false} />
      </header>
      <p className="lane-current">{humanizeText(lane.current_state)}</p>
      <div className="lane-next">
        <span className="eyebrow">PRÓXIMA AÇÃO</span>
        <p>{humanizeActionText(lane.next_action, lane.domain)}</p>
        {next && onSelectAction && (
          <button className="text-button" onClick={() => onSelectAction(next)}>Ver detalhes da ação ↗</button>
        )}
      </div>
      <dl className="lane-meta">
        <div>
          <dt>Último resultado registrado</dt>
          <dd>{typeof lane.last_effect === 'string'
            ? <span>{humanizeText(lane.last_effect)}</span>
            : lane.last_effect
            ? <><StatusBadge state={lane.last_effect.status} compact /> <time>{dateTime(lane.last_effect.at)}</time></>
            : <em>nenhum efeito registrado</em>}</dd>
        </div>
        <div>
          <dt>O que está impedindo</dt>
          <dd>{lane.blockers.length
            ? <ul className="blocker-list">{lane.blockers.map(b => <li key={b}>{humanizeText(b)}</li>)}</ul>
            : <em>nenhum</em>}</dd>
        </div>
        <div>
          <dt>Tarefas de apoio</dt>
          <dd>{lane.side_quests.length
            ? <ul className="quest-list">{lane.side_quests.map(q => (
                <li key={q.id}><StatusBadge state={q.status} compact /> {humanizeText(q.title)}</li>))}</ul>
            : <em>nenhuma</em>}</dd>
        </div>
      </dl>
      <footer>
        <ProvenanceButton title={`Lane ${lane.domain}`} provenance={provenanceOf({
          source_ref: lane.source_ref, fingerprint: lane.fingerprint, checked_at: lane.checked_at,
          freshness: lane.freshness, derivation_rule: `lane_snapshot(domain=${lane.domain})`,
          projection_role: 'COCKPIT', authority_class: 'DERIVED',
        })} />
      </footer>
      {lane.last_effect && typeof lane.last_effect !== 'string' && <details className="lane-technical"><summary>Identificador do resultado</summary><code>{lane.last_effect.effect_key}</code></details>}
    </article>
  );
}

export function ProjectionHealth({ bus }: { bus: ProjectionBus }) {
  return (
    <section className={`projection-health tone-${toneOf(bus.state)}`}>
      <header>
        <div>
          <span className="eyebrow">ATUALIZAÇÃO COMPARTILHADA</span>
          <h3>{bus.envelope_count} registros publicados · {bus.sources.length} fontes</h3>
        </div>
        <div className="bus-state">
          <StatusBadge state={bus.state} />
        </div>
      </header>
      <p className="quiet-note">Este painel mostra se as telas estão recebendo a mesma versão das informações e quais fontes contribuíram para ela.</p>
      <div className="bus-grid">
        <div>
          <span className="eyebrow">FONTES</span>
          <ul className="bus-list">
            {bus.sources.map(source => (
              <li key={source.id} className={`tone-${toneOf(source.state)}`}>
                <span className="bus-name">{humanizeText(source.label)}</span>
                <StatusBadge state={source.state} compact />
                <FreshnessIndicator freshness={source.freshness} showTime={false} />
                <span className="bus-count">{source.envelopes} registros</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="eyebrow">CONSUMIDORES</span>
          <ul className="bus-list">
            {bus.consumers.map(consumer => (
              <li key={consumer.id} className={`tone-${toneOf(consumer.state)}`}>
                <span className="bus-name">{humanizeText(consumer.label)}</span>
                <StatusBadge state={consumer.state} compact />
                <time>{dateTime(consumer.last_pull_at)}</time>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="quiet-note">
        NEXO ONE e Atlas consomem o mesmo estado. Divergência entre consumidores indica projeção parcial,
        não duas verdades.
      </p>
      <details className="bus-technical"><summary>Versão e assinatura da publicação</summary><Fingerprint value={bus.fingerprint} /></details>
    </section>
  );
}

export function ActionCard(
  { action, capability, onOpen }:
  { action: ActionRecord; capability?: Capability | null; onOpen?: (action: ActionRecord) => void },
) {
  return (
    <article className={`action-card tone-${toneOf(action.status)}`} data-domain={action.lane}>
      <header>
        <DomainBadge domain={action.lane} muted />
        <StatusBadge state={action.status} />
        <span className="op-chip">{label(action.required_operation)}</span>
        <span className="runtime-chip">{label(action.runtime)}</span>
        <span className={`risk-chip risk-${action.risk.toLowerCase()}`}>risco {label(action.risk).toLowerCase()}</span>
      </header>
      <h3>{humanizeActionText(action.title, action.lane)}</h3>
      <p className="action-eligibility">{humanizeText(action.eligibility)}</p>
      <dl className="action-meta">
        <div>
          <dt>Permissão de ação</dt>
          <dd>{capability
            ? <CapabilityBadge status={capability.status} id={capability.capability_id} />
            : <em>nenhuma declarada</em>}</dd>
        </div>
        <div>
          <dt>Confirmação depois da execução</dt>
          <dd><ReadbackBadge readback={action.readback} /></dd>
        </div>
      </dl>
      {action.blocker && <p className="action-blocker" role="alert"><strong>O que impede a execução:</strong> {humanizeText(action.blocker)}</p>}
      <p className="action-next"><span className="eyebrow">PRÓXIMO PASSO</span>{humanizeActionText(action.next_action, action.lane)}</p>
      <footer>
        <ProvenanceButton title={action.title} provenance={provenanceOf({
          source_ref: action.source_ref, fingerprint: action.fingerprint, checked_at: action.checked_at,
          freshness: action.freshness, derivation_rule: 'action_register(open=true)',
          projection_role: 'COCKPIT', authority_class: 'DERIVED',
        })} />
        {onOpen && <button className="text-button" onClick={() => onOpen(action)}>Ver execução ↗</button>}
      </footer>
      <details className="action-technical">
        <summary>Identificadores e confirmação técnica</summary>
        <SourceRef value={action.receipt_ref ?? action.source_ref} dim />
        <dl className="action-meta">
          <div><dt>Chave do resultado</dt><dd>{action.effect_key ? <code>{action.effect_key}</code> : <em>sem efeito emitido</em>}</dd></div>
          <div><dt>Assinatura dos dados de entrada</dt><dd><Fingerprint value={action.input_fingerprint} /></dd></div>
        </dl>
      </details>
    </article>
  );
}
