import { useCallback, useEffect, useState } from 'react';
import { emitSessionChange } from '../contracts/session-events.ts';

export interface SessionState { configured: boolean; authenticated: boolean; access?: 'PUBLIC'|'PRIVATE'; mode?: string }

/** Sessão privada: o PIN existe apenas durante o submit; o browser recebe somente o cookie HttpOnly. */
export function useSession(onChange?: (authenticated: boolean) => void) {
  const [session, setSession] = useState<SessionState>({ configured: false, authenticated: false, access:'PUBLIC' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [runtimeAvailable,setRuntimeAvailable]=useState<boolean|null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/session',{credentials:'same-origin'})
      .then(async r => {
        if(!r.ok)throw new Error('SESSION_RUNTIME_UNAVAILABLE');
        const value=await r.json();
        if(alive){setSession(value);setRuntimeAvailable(true);}
      })
      .catch(() => { if(alive)setRuntimeAvailable(false); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (pin: string) => {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST', credentials:'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin }),
      });
      setRuntimeAvailable(true);
      if (!response.ok) {
        setError(response.status === 429 ? 'Muitas tentativas. Aguarde 15 minutos.' : 'PIN inválido.');
        return false;
      }
      const value=await response.json();
      setSession(value);
      if (typeof window !== 'undefined') emitSessionChange(window, true);
      onChange?.(true);
      return true;
    } catch {
      setRuntimeAvailable(false);
      setError('Runtime privado indisponível.');
      return false;
    } finally {
      setPending(false);
    }
  }, [onChange]);

  const logout = useCallback(async () => {
    try {
      const response = await fetch('/api/session', { method: 'DELETE',credentials:'same-origin' });
      if (!response.ok) throw new Error();
      setSession(await response.json());
      if (typeof window !== 'undefined') emitSessionChange(window, false);
      onChange?.(false);
      return true;
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
      return false;
    }
  }, [onChange]);

  return { session, error, pending, runtimeAvailable, login, logout, setError };
}
