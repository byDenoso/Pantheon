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

function clientId(){ return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim(); }

export function LoginPage() {
  const buttonRef=useRef<HTMLDivElement|null>(null);
  const [error,setError]=useState('');
  const id=clientId();

  useEffect(()=>{
    if(!id){ setError('Autenticação ainda não configurada: VITE_GOOGLE_CLIENT_ID ausente.'); return; }
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
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
