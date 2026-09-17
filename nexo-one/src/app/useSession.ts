import { useCallback, useEffect, useRef, useState } from 'react';
import { emitSessionChange } from '../contracts/session-events.ts';
import { clearStoredSessionToken, createAppsScriptAuthBridge } from '../auth/apps-script-bridge.mjs';

export interface SessionState { configured: boolean; authenticated: boolean; access?: 'PUBLIC'|'PRIVATE'; mode?: string }
type BridgeResponse={ok?:boolean;status?:number;error?:string;state?:SessionState};
type AuthBridge={iframeUrl:string;getSession:()=>Promise<BridgeResponse>;login:(pin:string)=>Promise<BridgeResponse>;logout:()=>Promise<BridgeResponse>;dispose:()=>void};

const PUBLIC_SESSION:SessionState={configured:false,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'};
const BRIDGE_URL=import.meta.env.VITE_NEXO_AUTH_BRIDGE_URL?.trim()||'';

/** Sessão privada via Apps Script. O PIN vive apenas durante o submit; só o token opaco fica em sessionStorage. */
export function useSession(onChange?: (authenticated: boolean) => void) {
  const [session, setSession] = useState<SessionState>(PUBLIC_SESSION);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [runtimeAvailable,setRuntimeAvailable]=useState<boolean|null>(null);
  const bridgeRef=useRef<AuthBridge|null>(null);

  useEffect(() => {
    let alive=true;
    if(!BRIDGE_URL){
      setSession(PUBLIC_SESSION);
      setRuntimeAvailable(false);
      return () => { alive=false; };
    }

    let bridge:AuthBridge;
    try{
      bridge=createAppsScriptAuthBridge({bridgeUrl:BRIDGE_URL,parentWindow:window}) as AuthBridge;
    }catch{
      setSession(PUBLIC_SESSION);
      setRuntimeAvailable(false);
      return () => { alive=false; };
    }

    bridgeRef.current=bridge;
    const iframe=document.createElement('iframe');
    iframe.src=bridge.iframeUrl;
    iframe.title='NEXO private authentication bridge';
    iframe.setAttribute('aria-hidden','true');
    iframe.tabIndex=-1;
    iframe.style.display='none';
    document.body.appendChild(iframe);

    bridge.getSession()
      .then(value=>{
        if(!alive)return;
        setRuntimeAvailable(true);
        if(value.error==='SESSION_EXPIRED')clearStoredSessionToken(window);
        setSession(value.state||PUBLIC_SESSION);
      })
      .catch(()=>{
        if(!alive)return;
        setSession(PUBLIC_SESSION);
        setRuntimeAvailable(false);
      });

    return () => {
      alive=false;
      bridge.dispose();
      if(bridgeRef.current===bridge)bridgeRef.current=null;
      iframe.remove();
    };
  }, []);

  const login = useCallback(async (pin: string) => {
    setPending(true);
    setError('');
    const bridge=bridgeRef.current;
    if(!bridge){
      setRuntimeAvailable(false);
      setError('Runtime privado indisponível.');
      setPending(false);
      return false;
    }
    try {
      const response=await bridge.login(pin);
      setRuntimeAvailable(true);
      if (!response.ok) {
        if(response.error==='SESSION_EXPIRED')clearStoredSessionToken(window);
        setSession(response.state||PUBLIC_SESSION);
        setError(response.status === 429 ? 'Muitas tentativas. Aguarde 15 minutos.' : 'PIN inválido.');
        return false;
      }
      const value=response.state||PUBLIC_SESSION;
      setSession(value);
      emitSessionChange(window, true);
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
    const bridge=bridgeRef.current;
    clearStoredSessionToken(window);
    setSession(PUBLIC_SESSION);
    emitSessionChange(window, false);
    onChange?.(false);
    if(!bridge){
      setRuntimeAvailable(false);
      return true;
    }
    try {
      const response=await bridge.logout();
      setRuntimeAvailable(true);
      if(response.state)setSession(response.state);
      return Boolean(response.ok);
    } catch {
      setError('Não foi possível confirmar o encerramento remoto da sessão.');
      return false;
    }
  }, [onChange]);

  return { session, error, pending, runtimeAvailable, login, logout, setError };
}
