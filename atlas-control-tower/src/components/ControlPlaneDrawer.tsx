import { useEffect, useState } from 'react';
import { createControlApi, type ControlApiClient, type ControlEnvelope, type ControlContext, type OutboxItem, type JsonValue } from '../api/control';

type Props = { open: boolean; onClose: () => void };

function envelopeState(value: ControlEnvelope<JsonValue> | null) {
  if (!value) return 'LOADING';
  return String(value.status || value.freshness || 'READY').toUpperCase();
}

export function ControlPlaneDrawer({ open, onClose }: Props) {
  const [client] = useState<ControlApiClient>(() => createControlApi());
  const [context, setContext] = useState<ControlEnvelope<ControlContext> | null>(null);
  const [outbox, setOutbox] = useState<ControlEnvelope<OutboxItem[]> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError('');
    void Promise.allSettled([client.getContext(), client.listOutbox()]).then(results => {
      if (!active) return;
      const contextResult = results[0];
      const outboxResult = results[1];
      if (contextResult.status === 'fulfilled') setContext(contextResult.value);
      if (outboxResult.status === 'fulfilled') setOutbox(outboxResult.value);
      if (contextResult.status === 'rejected' && outboxResult.status === 'rejected') setError('CONTROL_API_UNAVAILABLE');
    });
    return () => { active = false; };
  }, [client, open]);

  if (!open) return null;
  const contextKeys = context?.data ? Object.keys(context.data).slice(0, 12) : [];
  const outboxCount = Array.isArray(outbox?.data) ? outbox.data.length : null;
  return <aside className="control-plane-drawer" aria-label="Controle operacional do NEXO" role="dialog">
    <div className="control-plane-heading"><div><span className="eyebrow">NEXO CONTROL-PLANE</span><h2>Readback operacional</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar controle operacional">×</button></div>
    {error ? <div className="panel-empty"><strong>DATA_UNAVAILABLE</strong><p>O backend de controle ainda não respondeu.</p><small>O restante do Atlas continua navegável.</small></div> : <>
      <section className="control-plane-card"><div><span>CONTEXTO</span><strong>{envelopeState(context)}</strong></div><p>{context ? `${contextKeys.length} campos publicados` : 'Carregando contexto…'}</p>{context?.freshness && <small>Freshness: {String(context.freshness)}</small>}</section>
      <section className="control-plane-card"><div><span>OUTBOX</span><strong>{outboxCount === null ? envelopeState(outbox) : outboxCount}</strong></div><p>{outboxCount === null ? 'Sem leitura confirmada.' : 'itens publicados no endpoint'}</p>{outbox?.freshness && <small>Freshness: {String(outbox.freshness)}</small>}</section>
      <details className="technical-details"><summary>Campos do contexto publicado</summary><pre>{contextKeys.length ? contextKeys.join('\n') : 'Nenhum campo disponível.'}</pre></details>
      <p className="control-plane-note">Ações de dispatch e execute permanecem disponíveis somente via cliente tipado; a interface não fabrica comandos nem registros.</p>
    </>}
  </aside>;
}
