import { useMemo, useState } from 'react';
import type { ActionRecord, Capability } from '../../contracts/system.ts';
import {
  BrokerClientError, executeAction, planAction, readbackAction,
  type ActionIntentInput, type BrokerReceipt, type ConfirmationLevel,
} from '../../data/actionBroker.ts';
import { Fingerprint, SourceRef, StatusBadge } from '../../components/primitives.tsx';

const ACTIONS_BY_PROVIDER: Record<string, string[]> = {
  gmail: ['gmail.draft', 'gmail.send'],
  calendar: ['calendar.create', 'calendar.update', 'calendar.delete'],
  drive: ['drive.create', 'drive.update'],
  nexo: ['nexo.sheet.update'],
  github: ['github.issue.create', 'github.issue.update', 'github.branch.create', 'github.commit.create', 'github.pr.create', 'github.merge'],
  vercel: ['vercel.deploy', 'vercel.promote'],
};
const PROVIDERS = Object.keys(ACTIONS_BY_PROVIDER);

function defaultProvider(action: ActionRecord, capability: Capability | null): string {
  const raw = String(capability?.provider || '').toLowerCase();
  if (raw.includes('github')) return 'github';
  if (raw.includes('vercel')) return 'vercel';
  if (raw.includes('calendar')) return 'calendar';
  if (raw.includes('gmail')) return 'gmail';
  if (action.required_operation === 'NOTIFY') return 'gmail';
  if (action.required_operation === 'SCHEDULE') return 'calendar';
  if (action.required_operation === 'DEPLOY') return 'vercel';
  if (action.lane === 'ENGINEERING') return 'github';
  if (action.lane === 'NEXO') return 'nexo';
  return 'drive';
}
function defaultActionType(provider: string): string {
  return ACTIONS_BY_PROVIDER[provider]?.[0] || '';
}
function errorMessage(code: string): string {
  const labels: Record<string, string> = {
    AUTH_REQUIRED: 'Sessão ou credencial do provider ausente.',
    SCOPE_REQUIRED: 'A credencial atual não possui o escopo exigido.',
    CAPABILITY_BLOCKED: 'A capability não está PASS para esta operação.',
    AUTHORITY_CONFLICT: 'A operação conflita com a autoridade canônica.',
    TARGET_AMBIGUOUS: 'O alvo ou payload ainda é ambíguo.',
    RATE_LIMITED: 'O provider limitou temporariamente a operação.',
    PROVIDER_UNAVAILABLE: 'O provider não está disponível para esta execução.',
    PROVIDER_REJECTED: 'O provider rejeitou a mutação.',
    READBACK_MISMATCH: 'O efeito retornado não coincide com o readback.',
    READBACK_TIMEOUT: 'O readback ainda não conseguiu fechar o efeito.',
    IDEMPOTENCY_CONFLICT: 'A mesma chave de idempotência foi reutilizada com outro conteúdo.',
    CONFIRMATION_REQUIRED: 'A confirmação exigida ainda não foi fornecida.',
    INVALID_INTENT: 'O intent não obedece ao contrato do Action Broker.',
  };
  return labels[code] || code;
}

function Receipt({ receipt }: { receipt: BrokerReceipt }) {
  const trace = receipt.trace ?? [];
  return (
    <div className="readback-panel">
      <div className="section-head secondary">
        <h2>Receipt <code>{receipt.receipt_id}</code></h2>
        <StatusBadge state={receipt.status} />
      </div>
      <dl className="meta-row">
        <div><dt>provider</dt><dd><code>{receipt.provider}</code></dd></div>
        <div><dt>capability</dt><dd><code>{receipt.capability_id}</code></dd></div>
        <div><dt>confirmação</dt><dd><code>{receipt.confirmation_level}</code></dd></div>
        <div><dt>efeito</dt><dd><code>{receipt.provider_effect_id || 'nenhum'}</code></dd></div>
        <div><dt>before</dt><dd><code>{receipt.before_revision || '∅'}</code></dd></div>
        <div><dt>after</dt><dd><code>{receipt.after_revision || '∅'}</code></dd></div>
        <div><dt>readback</dt><dd><code>{receipt.readback_status || 'pendente'}</code></dd></div>
        <div><dt>fingerprint</dt><dd><Fingerprint value={receipt.intent_fingerprint} /></dd></div>
      </dl>
      <p>{receipt.explanation}</p>
      {receipt.source_ref && <p><SourceRef value={receipt.source_ref} /></p>}
      <ol className="execution-trace" aria-label="Trace do Action Broker">
        {trace.map((step, index) => <li key={`${step.stage}-${index}`}><strong>{step.stage}</strong><time>{new Date(step.at).toLocaleString('pt-BR')}</time></li>)}
      </ol>
    </div>
  );
}

export function ActionBrokerPanel({
  action, capability, authenticated, onChanged,
}: {
  action: ActionRecord;
  capability: Capability | null;
  authenticated: boolean;
  onChanged: () => void;
}) {
  const initialProvider = useMemo(() => defaultProvider(action, capability), [action, capability]);
  const [provider, setProvider] = useState(initialProvider);
  const [actionType, setActionType] = useState(defaultActionType(initialProvider));
  const [target, setTarget] = useState('');
  const [payload, setPayload] = useState('{}');
  const [idempotency, setIdempotency] = useState(`${action.action_id}:${action.input_fingerprint}`.slice(0, 160));
  const [receipt, setReceipt] = useState<BrokerReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const capabilityPass = capability?.status === 'PASS';
  const canPlan = authenticated && capabilityPass && !!action.capability_id && !!provider && !!actionType && !!target.trim() && !!idempotency.trim();

  const intent = (): ActionIntentInput => {
    let requested_payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(payload || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID');
      requested_payload = parsed as Record<string, unknown>;
    } catch {
      throw new BrokerClientError('INVALID_INTENT');
    }
    return {
      action_id: action.action_id,
      action_type: actionType,
      domain: action.lane,
      provider,
      capability_id: action.capability_id || '',
      target_ref: target.trim(),
      requested_payload,
      idempotency_key: idempotency.trim(),
    };
  };

  const run = async (mode: 'plan' | 'execute' | 'readback') => {
    setBusy(true); setError('');
    try {
      let next: BrokerReceipt;
      if (mode === 'readback') {
        if (!receipt) return;
        next = await readbackAction(receipt.receipt_id);
      } else if (mode === 'plan') {
        next = await planAction(intent());
      } else {
        const level: ConfirmationLevel | false = receipt?.confirmation_level === 'STRONG_CONFIRM'
          ? 'STRONG_CONFIRM' : receipt?.confirmation_level === 'CONFIRM' ? 'CONFIRM' : 'NONE';
        next = await executeAction(intent(), level);
      }
      setReceipt(next); onChanged();
    } catch (failure) {
      const code = failure instanceof BrokerClientError ? failure.code : 'PROVIDER_UNAVAILABLE';
      setError(errorMessage(code));
    } finally { setBusy(false); }
  };

  return (
    <section className="drawer-run" aria-label="Action Broker">
      <div className="section-head secondary">
        <h2>ACTION BROKER</h2>
        <StatusBadge state={capabilityPass ? 'PASS' : capability?.status || 'UNKNOWN'} />
      </div>
      <p className="fixture-note">
        A interface não escreve diretamente em provider algum. Primeiro o servidor revalida autoridade + capability;
        depois exige a confirmação correspondente e só fecha PASS após readback.
      </p>

      {!authenticated && <p role="alert" className="write-disabled standalone">Entre na sessão privada para planejar ou executar ações.</p>}
      {authenticated && !capabilityPass && <p role="alert" className="write-disabled standalone">
        Controle bloqueado: a capability vinculada precisa estar exatamente PASS.
      </p>}

      <div className="login-form">
        <label>Provider
          <select value={provider} onChange={event => { const next = event.target.value; setProvider(next); setActionType(defaultActionType(next)); setReceipt(null); }}>
            {PROVIDERS.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Operação
          <select value={actionType} onChange={event => { setActionType(event.target.value); setReceipt(null); }}>
            {(ACTIONS_BY_PROVIDER[provider] || []).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Alvo explícito
          <input value={target} onChange={event => { setTarget(event.target.value); setReceipt(null); }} placeholder="ID, repo#issue, event_id, file_id ou range canônico" />
        </label>
        <label>Idempotency key
          <input value={idempotency} maxLength={160} onChange={event => { setIdempotency(event.target.value); setReceipt(null); }} />
        </label>
        <label>Payload JSON
          <textarea value={payload} rows={8} spellCheck={false} onChange={event => { setPayload(event.target.value); setReceipt(null); }} />
        </label>
      </div>

      {error && <p role="alert" className="notice-box">{error}</p>}
      <div className="filter-row" role="group" aria-label="Controles do Action Broker">
        <button className="filter" disabled={!canPlan || busy} onClick={() => void run('plan')}>{busy ? 'Validando…' : '1 · Planejar'}</button>
        <button className="primary-button" disabled={!receipt || receipt.status !== 'GATED' || busy} onClick={() => void run('execute')}>
          {receipt?.confirmation_level === 'STRONG_CONFIRM' ? '2 · CONFIRMAR FORTE E EXECUTAR' : receipt?.confirmation_level === 'CONFIRM' ? '2 · Confirmar e executar' : '2 · Executar'}
        </button>
        <button className="filter" disabled={!receipt?.provider_effect_id || busy} onClick={() => void run('readback')}>Revalidar readback</button>
      </div>
      {receipt && <Receipt receipt={receipt} />}
    </section>
  );
}
