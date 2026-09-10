// Componentes compostos. Recebem contrato, nunca fixtures.
import type {
  ActionRecord, Capability, ExecutionRun, InboxItem, LaneSnapshot, ProjectionBus, TruthFinding,
} from '../contracts/system.ts';
import { EXECUTION_STAGES } from '../contracts/system.ts';
import type { CapabilityCell } from '../viewmodels/system.ts';
import { provenanceOf } from '../viewmodels/system.ts';
import { dateTime, label, shortTime, toneOf } from '../viewmodels/tokens.ts';
import {
  AuthorityBadge, CapabilityBadge, DomainBadge, Fingerprint, FreshnessIndicator,
  ReadbackBadge, SeverityBadge, SourceRef, StatusBadge,
} from './primitives.tsx';
import { ProvenanceButton } from './provenance.tsx';

export function ExecutionTrace({ run, compact }: { run: ExecutionRun; compact?: boolean }) {
  return (
    <div className={`execution-trace${compact ? ' compact' : ''}`}>
      <ol className="trace-rail">
        {EXECUTION_STAGES.map(stage => {
          const step = run.steps.find(s => s.stage === stage);
          const tone = step ? toneOf(step.status) : 'unknown';
          return (
            <li key={stage} className={`trace-step tone-${tone}`}>
              <span className="trace-stage">{stage}</span>
              <span className="trace-node" aria-hidden="true"><i /></span>
              <span className="trace-label">{step?.label ?? 'sem registro'}</span>
              <span className="trace-status">{label(step?.status ?? 'UNKNOWN')}</span>
              {!compact && (
                <>
                  <span className="trace-detail">{step?.detail ?? 'Nenhum evento registrado nesta etapa.'}</span>
                  <span className="trace-meta">
                    <time>{step?.at ? shortTime(step.at) : '—'}</time>
                    <Fingerprint value={step?.fingerprint ?? null} />
                  </span>
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
          <dt>Truth Owner</dt>
          <dd>{finding.authority.owner} <AuthorityBadge authority={finding.authority.class} /></dd>
        </div>
        <div>
          <dt>Provider esperado</dt>
          <dd><code>{finding.provider.expected}</code></dd>
        </div>
        <div className={mismatch ? 'mismatch' : undefined}>
          <dt>Provider observado</dt>
          <dd>{finding.provider.observed ? <code>{finding.provider.observed}</code> : <em>nenhum</em>}
            {mismatch && <span className="mismatch-flag">divergente</span>}</dd>
        </div>
        <div>
          <dt>Capability</dt>
          <dd>{capability ? <CapabilityBadge status={capability.status} id={capability.capability_id} /> : '— nenhuma'}</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd><FreshnessIndicator freshness={finding.freshness} /></dd>
        </div>
        <div>
          <dt>Fingerprint</dt>
          <dd><Fingerprint value={finding.fingerprint} /></dd>
        </div>
      </dl>
      <p className="truth-explanation">{finding.explanation}</p>
      <footer>
        <SourceRef value={finding.source_ref} dim />
        <ProvenanceButton title={`${finding.domain} · TruthGraph`} provenance={provenanceOf({
          source_ref: finding.source_ref, fingerprint: finding.fingerprint,
          authority_class: finding.authority.class, checked_at: finding.checked_at,
          freshness: finding.freshness, derivation_rule: 'truth_findings(domain)', projection_role: 'INTEGRITY',
        })} />
      </footer>
    </article>
  );
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
                if (!cell) return <td key={runtime} className="matrix-cell empty"><span className="no-capability">sem capability</span></td>;
                return (
                  <td key={runtime} className={`matrix-cell tone-${toneOf(cell.status)}`}>
                    <span className="cell-status"><CapabilityBadge status={cell.status} /></span>
                    <ul>
                      {cell.capabilities.map(capability => (
                        <li key={capability.capability_id}>
                          <button className="capability-chip" onClick={() => onSelect?.(capability)}
                            title={capability.explanation}>
                            <i aria-hidden="true" className={`glyph glyph-${toneOf(capability.status)}`} />
                            <span>{capability.label}</span>
                            <small>{label(capability.operation)} · risco {label(capability.risk).toLowerCase()}</small>
                          </button>
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
  return (
    <article className={`inbox-item tone-${toneOf(item.severity === 'P0' ? 'CONFLICT' : 'DEGRADED')}`}>
      <header>
        <span className="inbox-kind">{label(item.kind)}</span>
        <DomainBadge domain={item.domain} muted />
        <SeverityBadge severity={item.severity} />
        {item.due_at && <time className="inbox-due">prazo {dateTime(item.due_at)}</time>}
      </header>
      <h3>{item.title}</h3>
      <p className="inbox-question">{item.question}</p>
      <p className="inbox-why"><span className="eyebrow">POR QUE VOCÊ</span>{item.why}</p>
      {item.options.length > 0 && (
        <ul className="inbox-options">
          {item.options.map(option => (
            <li key={option.id}>
              <strong>{option.label}</strong>
              <span>{option.consequence}</span>
            </li>
          ))}
        </ul>
      )}
      <footer>
        {action && <span className="inbox-action-ref">ação {action.action_id}</span>}
        <SourceRef value={item.source_ref} dim />
        <ProvenanceButton title={item.title} provenance={provenanceOf({
          source_ref: item.source_ref, fingerprint: item.fingerprint, checked_at: item.checked_at,
          freshness: item.freshness, derivation_rule: 'human_gates(open=true)', projection_role: 'COCKPIT',
          authority_class: 'DERIVED',
        })} />
        {onOpen && <button className="text-button" onClick={() => onOpen(item)}>Abrir contexto ↗</button>}
      </footer>
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
    <article className={`lane-card tone-${toneOf(lane.state)}`}>
      <header>
        <DomainBadge domain={lane.domain} />
        <StatusBadge state={lane.state} />
        <FreshnessIndicator freshness={lane.freshness} showTime={false} />
      </header>
      <p className="lane-current">{lane.current_state}</p>
      <div className="lane-next">
        <span className="eyebrow">PRÓXIMA AÇÃO</span>
        <p>{lane.next_action}</p>
        {next && onSelectAction && (
          <button className="text-button" onClick={() => onSelectAction(next)}>{next.title} ↗</button>
        )}
      </div>
      <dl className="lane-meta">
        <div>
          <dt>Último efeito</dt>
          <dd>{lane.last_effect
            ? <><code>{lane.last_effect.effect_key}</code> <StatusBadge state={lane.last_effect.status} compact /> <time>{dateTime(lane.last_effect.at)}</time></>
            : <em>nenhum efeito registrado</em>}</dd>
        </div>
        <div>
          <dt>Blockers</dt>
          <dd>{lane.blockers.length
            ? <ul className="blocker-list">{lane.blockers.map(b => <li key={b}>{b}</li>)}</ul>
            : <em>nenhum</em>}</dd>
        </div>
        <div>
          <dt>Side quests</dt>
          <dd>{lane.side_quests.length
            ? <ul className="quest-list">{lane.side_quests.map(q => (
                <li key={q.id}><StatusBadge state={q.status} compact /> {q.title}</li>))}</ul>
            : <em>nenhuma</em>}</dd>
        </div>
      </dl>
      <footer>
        <SourceRef value={lane.source_ref} dim />
        <ProvenanceButton title={`Lane ${lane.domain}`} provenance={provenanceOf({
          source_ref: lane.source_ref, fingerprint: lane.fingerprint, checked_at: lane.checked_at,
          freshness: lane.freshness, derivation_rule: `lane_snapshot(domain=${lane.domain})`,
          projection_role: 'COCKPIT', authority_class: 'DERIVED',
        })} />
      </footer>
    </article>
  );
}

export function ProjectionHealth({ bus }: { bus: ProjectionBus }) {
  return (
    <section className={`projection-health tone-${toneOf(bus.state)}`}>
      <header>
        <div>
          <span className="eyebrow">UNIVERSAL PROJECTION BUS</span>
          <h3>{bus.envelope_count} envelopes · {bus.sources.length} fontes</h3>
        </div>
        <div className="bus-state">
          <StatusBadge state={bus.state} />
          <Fingerprint value={bus.fingerprint} />
        </div>
      </header>
      <div className="bus-grid">
        <div>
          <span className="eyebrow">FONTES</span>
          <ul className="bus-list">
            {bus.sources.map(source => (
              <li key={source.id} className={`tone-${toneOf(source.state)}`}>
                <span className="bus-name">{source.label}</span>
                <StatusBadge state={source.state} compact />
                <code className="fingerprint-chip">{source.source_revision ?? 'sem revisão'}</code>
                <FreshnessIndicator freshness={source.freshness} showTime={false} />
                <span className="bus-count">{source.envelopes} env.</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="eyebrow">CONSUMIDORES</span>
          <ul className="bus-list">
            {bus.consumers.map(consumer => (
              <li key={consumer.id} className={`tone-${toneOf(consumer.state)}`}>
                <span className="bus-name">{consumer.label}</span>
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
    </section>
  );
}

export function ActionCard(
  { action, capability, onOpen }:
  { action: ActionRecord; capability?: Capability | null; onOpen?: (action: ActionRecord) => void },
) {
  return (
    <article className={`action-card tone-${toneOf(action.status)}`}>
      <header>
        <DomainBadge domain={action.lane} muted />
        <StatusBadge state={action.status} />
        <span className="op-chip">{label(action.required_operation)}</span>
        <span className="runtime-chip">{label(action.runtime)}</span>
        <span className={`risk-chip risk-${action.risk.toLowerCase()}`}>risco {label(action.risk).toLowerCase()}</span>
      </header>
      <h3>{action.title}</h3>
      <p className="action-eligibility">{action.eligibility}</p>
      <dl className="action-meta">
        <div>
          <dt>Capability</dt>
          <dd>{capability
            ? <CapabilityBadge status={capability.status} id={capability.capability_id} />
            : <em>nenhuma declarada</em>}</dd>
        </div>
        <div>
          <dt>Readback</dt>
          <dd><ReadbackBadge readback={action.readback} /></dd>
        </div>
        <div>
          <dt>effect_key</dt>
          <dd>{action.effect_key ? <code>{action.effect_key}</code> : <em>sem efeito emitido</em>}</dd>
        </div>
        <div>
          <dt>input_fingerprint</dt>
          <dd><Fingerprint value={action.input_fingerprint} /></dd>
        </div>
      </dl>
      {action.blocker && <p className="action-blocker" role="alert"><strong>Blocker.</strong> {action.blocker}</p>}
      <p className="action-next"><span className="eyebrow">PRÓXIMO PASSO</span>{action.next_action}</p>
      <footer>
        {action.receipt_ref ? <SourceRef value={action.receipt_ref} dim /> : <SourceRef value={action.source_ref} dim />}
        <ProvenanceButton title={action.title} provenance={provenanceOf({
          source_ref: action.source_ref, fingerprint: action.fingerprint, checked_at: action.checked_at,
          freshness: action.freshness, derivation_rule: 'action_register(open=true)',
          projection_role: 'COCKPIT', authority_class: 'DERIVED',
        })} />
        {onOpen && <button className="text-button" onClick={() => onOpen(action)}>Ver execução ↗</button>}
      </footer>
    </article>
  );
}
