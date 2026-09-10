// Proveniência universal. Qualquer estado importante da interface deve conseguir
// responder "de onde isto veio" sem sair da tela.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../shell/Modal.tsx';
import { AuthorityBadge, Fingerprint, FreshnessIndicator, SourceRef } from './primitives.tsx';
import type { Provenance } from '../viewmodels/system.ts';
import { dateTime, label } from '../viewmodels/tokens.ts';

export interface ProvenanceRequest { title: string; provenance: Provenance; note?: string }

const ProvenanceContext = createContext<(request: ProvenanceRequest) => void>(() => {});

export const useProvenance = () => useContext(ProvenanceContext);

export function ProvenanceProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ProvenanceRequest | null>(null);
  const open = useCallback((next: ProvenanceRequest) => setRequest(next), []);
  const value = useMemo(() => open, [open]);
  return (
    <ProvenanceContext.Provider value={value}>
      {children}
      {request && (
        <Modal title="PROVENIÊNCIA" className="provenance-modal" onClose={() => setRequest(null)}>
          <div className="drawer-body">
            <h2>{request.title}</h2>
            <p className="non-authoritative">
              Projeção não autoritativa. Esta tela mostra o que foi lido, quando e sob qual regra —
              nunca uma afirmação de verdade.
            </p>
            <ProvenanceBody provenance={request.provenance} />
            {request.note && <p className="surface-hint">{request.note}</p>}
          </div>
        </Modal>
      )}
    </ProvenanceContext.Provider>
  );
}

export function ProvenanceBody({ provenance }: { provenance: Provenance }) {
  return (
    <dl className="provenance-list">
      <div>
        <dt>source_ref</dt>
        <dd><SourceRef value={provenance.source_ref} /></dd>
      </div>
      <div>
        <dt>source_revision</dt>
        <dd>{provenance.source_revision ? <code className="fingerprint-chip">{provenance.source_revision}</code> : '— sem revisão declarada'}</dd>
      </div>
      <div>
        <dt>fingerprint</dt>
        <dd><Fingerprint value={provenance.fingerprint} /></dd>
      </div>
      <div>
        <dt>authority</dt>
        <dd>{provenance.authority_class ? <AuthorityBadge authority={provenance.authority_class} /> : '— não declarada'}</dd>
      </div>
      <div>
        <dt>checked_at</dt>
        <dd>{dateTime(provenance.checked_at)}</dd>
      </div>
      <div>
        <dt>freshness</dt>
        <dd>{provenance.freshness ? <FreshnessIndicator freshness={provenance.freshness} /> : '— desconhecida'}</dd>
      </div>
      <div>
        <dt>derivation_rule</dt>
        <dd>{provenance.derivation_rule ? <code className="rule">{provenance.derivation_rule}</code> : '— leitura direta da fonte'}</dd>
      </div>
      <div>
        <dt>projection_role</dt>
        <dd>{provenance.projection_role ? label(provenance.projection_role) : '—'}</dd>
      </div>
    </dl>
  );
}

/** Botão discreto que abre a proveniência de qualquer entidade. */
export function ProvenanceButton({ title, provenance, note }: ProvenanceRequest) {
  const open = useProvenance();
  return (
    <button className="provenance-button" onClick={() => open({ title, provenance, note })}
      aria-label={`Ver proveniência de ${title}`} title="De onde veio este estado?">
      ⌖ origem
    </button>
  );
}
