import { FormEvent, useEffect, useState } from 'react';
import { routeFor } from '../atlas-route';

type AuthConfig={authenticated?:boolean;authConfigured?:boolean;pinConfigured?:boolean;method?:string};

export function LoginPage() {
  const [pin,setPin]=useState('');
  const [ready,setReady]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let live=true;
    void fetch('/api/auth/session',{headers:{Accept:'application/json'},credentials:'include'}).then(async response=>{
      const config=await response.json() as AuthConfig;
      if(!response.ok)throw new Error(`AUTH_CONFIG_HTTP_${response.status}`);
      if(config.authenticated){window.location.replace(routeFor('cockpit'));return;}
      if(!config.pinConfigured)throw new Error('PIN_AUTH_NOT_CONFIGURED');
      if(live)setReady(true);
    }).catch(reason=>{
      if(!live)return;
      setError(String(reason?.message||reason)==='PIN_AUTH_NOT_CONFIGURED'?'Acesso por PIN ainda não configurado no servidor.':'Falha ao ler a configuração de autenticação.');
    });
    return()=>{live=false};
  },[]);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(submitting)return;
    const value=pin.trim();
    if(!/^\d{4,12}$/.test(value)){setError('Informe um PIN numérico válido.');return;}
    setSubmitting(true);setError('');
    try{
      const response=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'include',body:JSON.stringify({pin:value})});
      const result=await response.json() as {authenticated?:boolean;error?:string};
      if(!response.ok||!result.authenticated){
        if(response.status===429)throw new Error('TOO_MANY_ATTEMPTS');
        if(response.status===503)throw new Error('PIN_AUTH_NOT_CONFIGURED');
        throw new Error('INVALID_PIN');
      }
      setPin('');
      window.location.replace(routeFor('cockpit'));
    }catch(reason){
      const code=String((reason as Error)?.message||reason);
      setError(code==='TOO_MANY_ATTEMPTS'?'Muitas tentativas. Aguarde alguns minutos e tente novamente.':code==='PIN_AUTH_NOT_CONFIGURED'?'Acesso por PIN ainda não configurado no servidor.':'PIN inválido.');
    }finally{setSubmitting(false)}
  };

  return <div className="page-wrap"><section className="panel-empty" aria-live="polite"><span className="eyebrow">NEXO ATLAS · ACESSO OPERACIONAL</span><h1>Entrar no Atlas</h1><p>O PIN é validado apenas no servidor. A sessão fica em cookie HttpOnly e não é gravada no browser.</p><form onSubmit={submit} className="auth-pin-form"><label htmlFor="atlas-pin">PIN</label><input id="atlas-pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{4,12}" minLength={4} maxLength={12} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,12))} disabled={!ready||submitting} autoFocus/><button type="submit" disabled={!ready||submitting||pin.length<4}>{submitting?'Validando…':'Entrar'}</button></form>{!ready&&!error&&<p role="status">Lendo autenticação…</p>}{error&&<p role="alert">{error}</p>}</section></div>;
}
