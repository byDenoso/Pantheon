import { useEffect, useRef, useState } from 'react';
import { routeFor } from '../atlas-route';
import { storeGoogleCredential } from '../core/google-session';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; auto_select?: boolean }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT='https://accounts.google.com/gsi/client';

type AuthConfig={authConfigured?:boolean;clientId?:string|null};

export function LoginPage() {
  const buttonRef=useRef<HTMLDivElement|null>(null);
  const [error,setError]=useState('');
  const [id,setId]=useState('');

  useEffect(()=>{
    let live=true;
    void fetch('/api/auth/session',{headers:{Accept:'application/json'}}).then(async response=>{
      const config=await response.json() as AuthConfig;
      if(!response.ok)throw new Error(`AUTH_CONFIG_HTTP_${response.status}`);
      if(!config.authConfigured||!config.clientId)throw new Error('AUTH_NOT_CONFIGURED');
      if(live)setId(String(config.clientId));
    }).catch(error=>{if(live)setError(String(error?.message||error)==='AUTH_NOT_CONFIGURED'?'Autenticação operacional ainda não configurada no servidor.':'Falha ao ler configuração de autenticação.');});
    return()=>{live=false};
  },[]);

  useEffect(()=>{
    if(!id)return;
    let disposed=false;
    const mount=()=>{
      if(disposed||!buttonRef.current||!window.google?.accounts?.id)return;
      window.google.accounts.id.initialize({
        client_id:id,
        auto_select:false,
        callback:response=>{
          const session=response.credential?storeGoogleCredential(response.credential):null;
          if(!session){ setError('Não foi possível validar a credencial recebida do Google.'); return; }
          window.location.replace(routeFor('cockpit'));
        }
      });
      buttonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonRef.current,{theme:'outline',size:'large',shape:'pill',text:'signin_with',width:280});
    };
    if(window.google?.accounts?.id){ mount(); return ()=>{disposed=true;}; }
    const existing=document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    const script=existing||document.createElement('script');
    const onLoad=()=>mount();
    const onError=()=>setError('Falha ao carregar Google Identity Services.');
    script.addEventListener('load',onLoad);
    script.addEventListener('error',onError);
    if(!existing){ script.src=GOOGLE_SCRIPT; script.async=true; script.defer=true; document.head.appendChild(script); }
    return ()=>{ disposed=true; script.removeEventListener('load',onLoad); script.removeEventListener('error',onError); };
  },[id]);

  return (
    <div className="page-wrap">
      <section className="panel-empty" aria-live="polite">
        <span className="eyebrow">NEXO ATLAS · ACESSO OPERACIONAL</span>
        <h1>Entrar no Atlas</h1>
        <p>Autentique-se para acessar readers privados e comandos de escrita governados pelo NEXO.</p>
        <div ref={buttonRef}/>
        {!id&&!error&&<p role="status">Carregando autenticação…</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
