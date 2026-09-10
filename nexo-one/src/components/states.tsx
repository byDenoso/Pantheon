// Estados de superfície. Uma falha nunca vira skeleton eterno, e uma leitura
// anterior nunca é exibida sem o rótulo STALE.
import type { ReactNode } from 'react';
import type { Freshness, LoadState } from '../contracts/system.ts';
import { FreshnessIndicator } from './primitives.tsx';

export function EmptyState({ title, description, hint }: { title: string; description: string; hint?: string }) {
  return (
    <div className="surface-state empty" role="status">
      <span className="surface-glyph" aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {hint && <p className="surface-hint">{hint}</p>}
    </div>
  );
}

export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div className="surface-state error" role="alert">
      <span className="surface-glyph" aria-hidden="true">⊘</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry && <button className="primary-button" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

export function StaleState({ freshness, children }: { freshness: Freshness; children: ReactNode }) {
  return (
    <div className="stale-wrap">
      <div className="stale-banner" role="status">
        <FreshnessIndicator freshness={freshness} />
        <span>Conteúdo da última leitura válida. Não confirma o estado atual da fonte.</span>
      </div>
      {children}
    </div>
  );
}

export function LoadingState({ label: text = 'Compilando o estado do sistema…' }: { label?: string }) {
  return (
    <div className="surface-state loading" role="status" aria-live="polite">
      <span className="loading-bar" aria-hidden="true"><i /></span>
      <p>{text}</p>
    </div>
  );
}

export function UnauthorizedState({ description }: { description: string }) {
  return (
    <div className="surface-state unauthorized" role="alert">
      <span className="surface-glyph" aria-hidden="true">⌾</span>
      <h3>Acesso privado necessário.</h3>
      <p>{description}</p>
    </div>
  );
}

/**
 * Envelope de superfície: resolve loading/erro/vazio de uma vez e nunca deixa
 * a UI escolher silenciosamente entre "sem dados" e "falha ao ler".
 */
export function Surface(
  { load, error, empty, children, onRetry }:
  { load: LoadState; error?: string; empty?: { title: string; description: string }; children: ReactNode; onRetry?: () => void },
) {
  if (load === 'LOADING') return <LoadingState />;
  if (load === 'UNAUTHORIZED') return <UnauthorizedState description={error || 'Entre na sessão privada para continuar.'} />;
  if (load === 'ERROR') {
    return <ErrorState title="Não foi possível compilar esta visão." description={error || 'A origem do estado não respondeu.'} onRetry={onRetry} />;
  }
  if (load === 'EMPTY' && empty) return <EmptyState title={empty.title} description={empty.description} />;
  return <>{children}</>;
}
