import { useEffect, useState, type ReactNode } from 'react';
import type { AtlasSession } from '../core/auth';

export function PrivateGate({ session, area, onGoToLogin, children }: {
  session: AtlasSession | null;
  area: string;
  onGoToLogin: () => void;
  children: ReactNode;
}) {
  const [authenticated,setAuthenticated]=useState(Boolean(session));
  const [loading,setLoading]=useState(!session);

  useEffect(()=>{
    if(session){setAuthenticated(true);setLoading(false);return;}
    let live=true;
    setLoading(true);
    void fetch('/api/auth/session',{headers:{Accept:'application/json'},credentials:'include'})
      .then(async response=>({ok:response.ok,body:await response.json() as {authenticated?:boolean}}))
      .then(({ok,body})=>{if(live)setAuthenticated(Boolean(ok&&body.authenticated));})
      .catch(()=>{if(live)setAuthenticated(false);})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false};
  },[session]);

  if(authenticated) return <>{children}</>;
  if(loading) return <div className="page-wrap"><section className="panel-empty" role="status"><span className="eyebrow">ÁREA OPERACIONAL</span><h2>{area}</h2><p>Validando sessão…</p></section></div>;
  return <div className="page-wrap"><section className="panel-empty"><span className="eyebrow">ÁREA OPERACIONAL</span><h2>{area}</h2><p>Autentique-se para acessar readers privados e comandos de escrita governados pelo NEXO.</p><button type="button" onClick={onGoToLogin}>Entrar no Atlas</button></section></div>;
}
