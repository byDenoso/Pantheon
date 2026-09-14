import type { ReactNode } from 'react';
import { resolveAuthGateState, type AtlasSession } from '../core/auth';

export function PrivateGate({
  session,
  area,
  onGoToLogin,
  children
}: {
  session: AtlasSession | null;
  area: string;
  onGoToLogin: () => void;
  children: ReactNode;
}) {
  const state = resolveAuthGateState(session);

  if (state === 'SIGNED_IN') return <>{children}</>;

  if (state === 'AUTH_SETUP_REQUIRED') {
    return (
      <div className="page-wrap panel-empty auth-gate" role="status">
        <span aria-hidden="true">⚿</span>
        <h2>Área protegida</h2>
        <p>
          {area} reúne execução e histórico operacional. O acesso ainda não está configurado neste ambiente, então o
          Atlas preservou a leitura pública e não simulou uma sessão.
        </p>
        <details>
          <summary>Detalhe técnico</summary>
          <small>AUTH_SETUP_REQUIRED · configure o provedor Google e a lista NEXO_ALLOWED_EMAILS.</small>
        </details>
      </div>
    );
  }

  const message = state === 'EXPIRED' ? 'Sua sessão expirou.' : 'É necessário entrar com uma conta Google autorizada.';
  return (
    <div className="page-wrap panel-empty auth-gate" role="status">
      <span aria-hidden="true">⚿</span>
      <h2>Acesso à área restrito</h2>
      <p>{message}</p>
      <button className="sync-button" onClick={onGoToLogin}>
        Entrar →
      </button>
    </div>
  );
}
