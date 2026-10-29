import { useCallback, useEffect, useRef, useState } from 'react';
import { emitSessionChange } from '../contracts/session-events.ts';
import { clearStoredSessionToken, createAppsScriptAuthBridge } from '../auth/apps-script-bridge.mjs';

export interface SessionState { configured: boolean; authenticated: boolean; access?: 'PUBLIC'|'PRIVATE'; mode?: string }
export type SessionRuntime='VERCEL_NATIVE'|'APPS_SCRIPT_BRIDGE'|'NONE';
type BridgeResponse={ok?:boolean;status?:number;error?:string;state?:SessionState};
type AuthBridge={iframeUrl:string;getSession:()=>Promise<BridgeResponse>;login:(pin:string)=>Promise<BridgeResponse>;logout:()=>Promise<BridgeResponse>;dispose:()=>void};

const PUBLIC_SESSION:SessionState={configured:false,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'};
const BRIDGE_URL=import.meta.env.VITE_NEXO_AUTH_BRIDGE_URL?.trim()||'';

const nativeEligible=()=>typeof window!=='undefined' && (
  window.location.hostname.endsWith('.vercel.app') ||
  window.location.hostname==='localhost' ||
  window.location.hostname==='127.0.0.1'
);

async function nativeSession(method:'GET'|'POST'|'DELETE',pin=''):Promise<BridgeResponse>{
  const response=await fetch('/api/session',{
    method,
    credentials:'same-origin',
    cache:'no-store',
    headers:method==='POST'?{'Content-Type':'application/json'}:undefined,
    body:method==='POST'?JSON.stringify({password:pin}):undefined,
  });
  let payload:any={};
  try{payload=await response.json();}catch{}
  return {ok:response.ok,status:response.status,error:payload?.error,state:payload?.state||(payload?.configured!==undefined?payload:undefined)};
}

export function useSession(onChange?: (authenticated: boolean) => void) {
  const [session,setSession]=useState<SessionState>(PUBLIC_SESSION);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [runtimeAvailable,setRuntimeAvailable]=useState<boolean|null>(null);
  const [runtime,setRuntimeState]=useState<SessionRuntime>('NONE');
  const bridgeRef=useRef<AuthBridge|null>(null);
  const runtimeRef=useRef<SessionRuntime>('NONE');
  const bindRuntime=(next:SessionRuntime)=>{runtimeRef.current=next;setRuntimeState(next);};

  useEffect(()=>{
    let alive=true;
    let iframe:HTMLIFrameElement|null=null;
    const bindBridge=async()=>{
      if(!BRIDGE_URL){
        if(alive){setSession(PUBLIC_SESSION);setRuntimeAvailable(false);bindRuntime('NONE');}
        return;
      }
      try{
        const bridge=createAppsScriptAuthBridge({bridgeUrl:BRIDGE_URL,parentWindow:window}) as AuthBridge;
        bridgeRef.current=bridge;
        iframe=document.createElement('iframe');
        iframe.src=bridge.iframeUrl;iframe.title='NEXO private authentication bridge';
        iframe.setAttribute('aria-hidden','true');iframe.tabIndex=-1;iframe.style.display='none';document.body.appendChild(iframe);
        const value=await bridge.getSession();
        if(!alive)return;
        bindRuntime('APPS_SCRIPT_BRIDGE');setRuntimeAvailable(true);
        if(value.error==='SESSION_EXPIRED')clearStoredSessionToken(window);
        setSession(value.state||PUBLIC_SESSION);
      }catch{
        if(alive){setSession(PUBLIC_SESSION);setRuntimeAvailable(false);bindRuntime('NONE');}
      }
    };
    void (async()=>{
      if(nativeEligible()){
        try{
          const value=await nativeSession('GET');
          if(alive&&value.status!==404){
            bindRuntime('VERCEL_NATIVE');setRuntimeAvailable(true);setSession(value.state||PUBLIC_SESSION);return;
          }
        }catch{}
      }
      await bindBridge();
    })();
    return()=>{alive=false;bridgeRef.current?.dispose();bridgeRef.current=null;iframe?.remove();};
  },[]);

  const login=useCallback(async(pin:string)=>{
    setPending(true);setError('');
    try{
      const activeRuntime=runtimeRef.current;
      const response=activeRuntime==='VERCEL_NATIVE'
        ? await nativeSession('POST',pin)
        : activeRuntime==='APPS_SCRIPT_BRIDGE'&&bridgeRef.current
          ? await bridgeRef.current.login(pin)
          : null;
      if(!response){setRuntimeAvailable(false);setError('Runtime privado indisponível.');return false;}
      setRuntimeAvailable(true);
      if(!response.ok||!response.state?.authenticated){
        if(activeRuntime==='APPS_SCRIPT_BRIDGE'&&response.error==='SESSION_EXPIRED')clearStoredSessionToken(window);
        setSession(response.state||PUBLIC_SESSION);
        setError(response.status===429?'Muitas tentativas. Aguarde 15 minutos.':'PIN inválido.');
        return false;
      }
      setSession(response.state);emitSessionChange(window,true);onChange?.(true);return true;
    }catch{setRuntimeAvailable(false);setError('Runtime privado indisponível.');return false;}
    finally{setPending(false);}
  },[onChange]);

  const logout=useCallback(async()=>{
    const activeRuntime=runtimeRef.current;
    if(activeRuntime==='APPS_SCRIPT_BRIDGE')clearStoredSessionToken(window);
    setSession(PUBLIC_SESSION);emitSessionChange(window,false);onChange?.(false);
    try{
      const response=activeRuntime==='VERCEL_NATIVE'
        ? await nativeSession('DELETE')
        : activeRuntime==='APPS_SCRIPT_BRIDGE'&&bridgeRef.current
          ? await bridgeRef.current.logout()
          : null;
      if(!response){setRuntimeAvailable(false);return true;}
      setRuntimeAvailable(true);if(response.state)setSession(response.state);return Boolean(response.ok);
    }catch{setError('Não foi possível confirmar o encerramento remoto da sessão.');return false;}
  },[onChange]);

  return {session,error,pending,runtimeAvailable,runtime,login,logout,setError};
}
