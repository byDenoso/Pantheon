import { useCallback, useEffect, useState } from 'react';
import { emitSessionChange } from '../contracts/session-events.ts';

export interface SessionState { configured: boolean; authenticated: boolean }

/**
 * Sessão privada do cockpit pessoal. Preserva o comportamento já existente:
 * o browser nunca vê credencial, apenas o cookie HttpOnly emitido pelo servidor.
 */
export function useSession(onChange?: (authenticated: boolean) => void) {
  const [session, setSession] = useState<SessionState>({ configured: false, authenticated: false });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/session')
      .then(r => r.json())
      .then(value => { if (alive) setSession(value); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (password: string) => {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'Muitas tentativas. Aguarde 15 minutos.' : 'Não foi possível entrar. Confira a senha.');
        return false;
      }
      setSession(await response.json());
      if (typeof window !== 'undefined') emitSessionChange(window, true);
      onChange?.(true);
      return true;
    } catch {
      setError('Falha na conexão.');
      return false;
    } finally {
      setPending(false);
    }
  }, [onChange]);

  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setSession(s => ({ ...s, authenticated: false }));
      if (typeof window !== 'undefined') emitSessionChange(window, false);
      onChange?.(false);
      return true;
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
      return false;
    }
  }, [onChange]);

  return { session, error, pending, login, logout, setError };
}
