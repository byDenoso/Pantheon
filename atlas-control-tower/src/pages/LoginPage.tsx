import { isAuthConfigured } from '../core/auth';

export function LoginPage() {
  const configured = isAuthConfigured();
  return (
    <div className="page-wrap panel-empty auth-gate" role="status">
      <span aria-hidden="true">⚿</span>
      <h2>{configured ? 'Entrar com Google' : 'AUTH_SETUP_REQUIRED'}</h2>
      {configured ? (
        <p>Login com Google Identity Services está configurado, mas o botão de entrada ainda não foi implementado nesta build.</p>
      ) : (
        <>
          <p>
            Nenhum provedor de login está configurado neste ambiente. Cockpit, Atividade, Laboratório e detalhes de
            teste exigem uma conta Google na allowlist do NEXO — nada disso pode ser simulado aqui.
          </p>
          <small>Configuração pendente: VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID / NEXO_ALLOWED_EMAILS.</small>
        </>
      )}
    </div>
  );
}
