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
        <h2>AUTH_SETUP_REQUIRED</h2>
        <p>
          {area} é uma área privada, mas nenhum provedor de login (Google Identity Services) está configurado neste
          ambiente. Nenhuma sessão foi simulada.
        </p>
        <small>Configuração pendente: VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID / NEXO_ALLOWED_EMAILS.</small>
      </div>
    );
  }

  const message = state === 'EXPIRED' ? 'Sua sessão expirou.' : 'É necessário entrar com uma conta Google autorizada.';
  return (
    <div className="page-wrap panel-empty auth-gate" role="status">
      <span aria-hidden="true">⚿</span>
      <h2>{state}</h2>
      <p>{message}</p>
      <button className="sync-button" onClick={onGoToLogin}>
        Entrar →
      </button>
    </div>
  );
}
