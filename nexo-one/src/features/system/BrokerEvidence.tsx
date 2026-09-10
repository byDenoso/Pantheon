import { useEffect, useState } from 'react';
import { recentActionReceipts, type BrokerReceipt } from '../../data/actionBroker.ts';
import { Fingerprint, SourceRef, StatusBadge } from '../../components/primitives.tsx';

const TERMINAL = new Set(['PASS', 'PENDING_READBACK', 'BLOCKED', 'FAILED', 'DEGRADED', 'CONFLICT']);
const STAGES = ['PLANNED', 'GATED', 'CONFIRMED', 'DISPATCHED', 'PROVIDER_ACK', 'READBACK', 'FINAL'];

function useReceipts() {
  const [rows, setRows] = useState<BrokerReceipt[]>([]);
  const [error, setError] = useState('');
  const reload = () => recentActionReceipts().then(setRows).catch(() => setError('AUTH_REQUIRED'));
  useEffect(() => { void reload(); }, []);
  return { rows, error, reload };
}

function finalStage(receipt: BrokerReceipt) {
  return TERMINAL.has(receipt.status) ? receipt.status : null;
}

function BrokerReceiptCard({ receipt }: { receipt: BrokerReceipt }) {
  const observed = new Map((receipt.trace || []).map(step => [step.stage, step.at]));
  const final = finalStage(receipt);
  return (
    <article className="run-detail">
      <div className="section-head secondary">
        <h2>{receipt.action_id}</h2>
        <StatusBadge state={receipt.status} />
      </div>
      <dl className="meta-row">
        <div><dt>receipt</dt><dd><code>{receipt.receipt_id}</code></dd></div>
        <div><dt>provider</dt><dd><code>{receipt.provider}</code></dd></div>
        <div><dt>target</dt><dd><code>{receipt.target_ref}</code></dd></div>
        <div><dt>capability</dt><dd><code>{receipt.capability_id}</code></dd></div>
        <div><dt>confirmation</dt><dd><code>{receipt.confirmation_level}</code></dd></div>
        <div><dt>effect</dt><dd><code>{receipt.provider_effect_id || '∅'}</code></dd></div>
        <div><dt>before</dt><dd><code>{receipt.before_revision || '∅'}</code></dd></div>
        <div><dt>after</dt><dd><code>{receipt.after_revision || '∅'}</code></dd></div>
      </dl>
      <ol className="trace-rail" aria-label="Trace do Action Broker">
        {STAGES.map(stage => {
          const actual = stage === 'FINAL' ? final : stage;
          const at = actual ? observed.get(actual) || (stage === 'FINAL' && final ? receipt.checked_at : null) : null;
          const reached = !!at;
          return (
            <li key={stage} className={`trace-step tone-${reached ? 'live' : 'unknown'}`}>
              <span className="trace-stage">{stage}</span>
              <span className="trace-node" aria-hidden="true"><i /></span>
              <span className="trace-label">{stage === 'FINAL' ? final || 'sem estado final' : reached ? 'registrado' : 'não atingido'}</span>
              <span className="trace-status">{reached ? 'OK' : '—'}</span>
              <span className="trace-detail">{stage === 'FINAL' ? receipt.explanation : stage}</span>
              <span className="trace-meta"><time>{at ? new Date(at).toLocaleString('pt-BR') : '—'}</time></span>
            </li>
          );
        })}
      </ol>
      <div className="readback-panel">
        <p><strong>Readback:</strong> {receipt.readback_status || 'pendente'} · {receipt.explanation}</p>
        <Fingerprint value={receipt.intent_fingerprint} />
        {receipt.source_ref && <SourceRef value={receipt.source_ref} />}
      </div>
    </article>
  );
}

export function BrokerPendingConfirmations({ onOpenAction }: { onOpenAction?: (actionId: string) => void }) {
  const { rows, error } = useReceipts();
  if (error) return null;
  const pending = rows.filter(row => row.status === 'GATED' && row.confirmation_level !== 'NONE');
  if (!pending.length) return null;
  return (
    <section aria-labelledby="broker-confirmations-title">
      <div className="section-head">
        <h2 id="broker-confirmations-title">Confirmações do Action Broker <span>{pending.length}</span></h2>
        <span className="eyebrow">PRIVATE · SERVER-GATED</span>
      </div>
      {pending.map(receipt => (
        <article key={receipt.receipt_id} className="inbox-item">
          <header><StatusBadge state="GATED" /><code>{receipt.confirmation_level}</code></header>
          <h3>{receipt.action_id}</h3>
          <p className="inbox-question">{receipt.action_type} em <code>{receipt.provider}</code> · alvo <code>{receipt.target_ref}</code></p>
          <p className="inbox-why"><span className="eyebrow">GATE</span>{receipt.explanation}</p>
          <footer>
            <Fingerprint value={receipt.intent_fingerprint} />
            {onOpenAction && <button className="text-button" onClick={() => onOpenAction(receipt.action_id)}>Abrir ação ↗</button>}
          </footer>
        </article>
      ))}
    </section>
  );
}

export function BrokerRecentExecutions() {
  const { rows, error, reload } = useReceipts();
  if (error) return null;
  if (!rows.length) return null;
  return (
    <section aria-labelledby="broker-execution-title">
      <div className="section-head">
        <h2 id="broker-execution-title">Action Broker · receipts recentes <span>{rows.length}</span></h2>
        <button className="text-button" onClick={reload}>Atualizar receipts ↻</button>
      </div>
      <div className="card-grid">
        {rows.slice(0, 12).map(receipt => <BrokerReceiptCard key={receipt.receipt_id} receipt={receipt} />)}
      </div>
    </section>
  );
}
