import {useEffect,useRef,useState} from 'react';
import type {Lang} from '../i18n/state-language.ts';
import {mcpGrantTransport} from '../private-legacy/install.ts';
import {frameMessage,postToParent} from '../private-legacy/state.ts';
import {parseMcpGrantStatus,type McpGrantStatus} from './mcpGrant.ts';
import './mcp-grant.css';

/** Loaded only inside the owner/PIN-guarded private frame. No auto-grant. */
export default function McpGrantPanel({lang}:{lang:Lang}) {
  const en=lang==='en';
  const [status,setStatus]=useState<McpGrantStatus|null>(null),[consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(false);
  const pending=useRef(false),lifecycle=useRef<AbortController|null>(null);
  async function perform(action:'status'|'create'|'revoke') {
    if(pending.current||!lifecycle.current||lifecycle.current.signal.aborted)return;
    if(action==='create'&&(!status?.approvalEnabled||status.active||!consent))return;
    if(action==='revoke'&&!status?.active)return;
    pending.current=true;setBusy(true);setError(false);setConsent(false);
    const signal=lifecycle.current.signal;
    try {
      const value=await mcpGrantTransport(action,signal);
      const next=parseMcpGrantStatus(action==='status'?value:await mcpGrantTransport('status',signal));
      if(!signal.aborted)setStatus(next);
    }catch(reason){
      if(!signal.aborted){setStatus(null);setError(true);
        if((reason as {status?:number})?.status===401)postToParent(frameMessage.logout());}
    }finally{pending.current=false;if(!signal.aborted)setBusy(false);}
  }
  useEffect(()=>{
    const controller=new AbortController();lifecycle.current=controller;void perform('status');
    return()=>{controller.abort();lifecycle.current=null;};
  },[]);
  return <section className="mcp-grant" aria-labelledby="mcp-grant-heading" aria-busy={busy}>
    <h3 id="mcp-grant-heading">{en?'Read-only MCP access':'Acesso MCP somente leitura'}</h3>
    <p>{en?'Current scientific search and explicit relations with citations through the NEXO Site plugin, using your verified account and LEARNER access.':'Busca científica atual e relações explícitas com citações pelo plugin do Site NEXO, usando sua conta verificada e acesso LEARNER.'}</p>
    {status&&<p role="status">{status.active
      ? <>{en?'Active until ':'Ativo até '}<time dateTime={status.expiresAt!}>{new Date(status.expiresAt!).toLocaleString(en?'en':'pt-BR')}</time>.</>
      : en?'No active grant.':'Nenhuma autorização ativa.'}</p>}
    {busy&&<p role="status">{en?'Checking authorization…':'Verificando autorização…'}</p>}
    {error&&<p role="alert">{en?'The server could not confirm the status. Refresh before trying another change.':'O servidor não confirmou o estado. Atualize antes de tentar outra alteração.'}</p>}
    {status&&!status.active&&!status.approvalEnabled&&<p>{en?'Grant creation is awaiting explicit approval and server activation.':'A criação aguarda aprovação explícita e ativação no servidor.'}</p>}
    {status&&!status.active&&<>
      <label className="mcp-grant-consent"><input type="checkbox" checked={consent} disabled={busy||!status.approvalEnabled} onChange={e=>setConsent(e.target.checked)}/>
        <span>{en?'I authorize read-only LEARNER scientific search and explicit relations for 30 days. This access continues after browser sign-out; I can revoke it here at any time. The private scientific read index may refresh from Tower; no source edits are allowed.':'Autorizo a busca científica atual e relações explícitas LEARNER somente leitura por 30 dias. O acesso continua após sair do navegador; posso revogá-lo aqui a qualquer momento. O índice científico privado pode ser atualizado a partir da Tower; nenhuma edição da fonte é permitida.'}</span>
      </label>
      <button type="button" disabled={busy||!status.approvalEnabled||!consent} onClick={()=>void perform('create')}>{en?'Authorize for 30 days':'Autorizar por 30 dias'}</button>
    </>}
    {status?.active&&<button type="button" disabled={busy} onClick={()=>void perform('revoke')}>{en?'Revoke MCP access':'Revogar acesso MCP'}</button>}
    <button type="button" disabled={busy} onClick={()=>void perform('status')}>{en?'Refresh authorization status':'Atualizar estado da autorização'}</button>
    <p className="pw-quiet">{en?'Requires a current browser PIN session. After authorization, connect the Site plugin in Plugins → Personal → Created by you. Each chat must use that plugin; this does not grant access to every chat automatically.':'Exige uma sessão atual validada por PIN. Após autorizar, conecte o plugin do Site em Plugins → Personal → Created by you. Cada conversa precisa usar esse plugin; a autorização não dá acesso automático a todas as conversas.'}</p>
  </section>;
}
