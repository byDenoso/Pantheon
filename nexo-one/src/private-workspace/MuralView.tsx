import {useMemo, useState} from 'react';
import type {SystemState} from '../contracts/system.ts';
import type {Lang} from '../i18n/state-language.ts';
import {hashForView} from '../app/navigation.ts';
import {privateMuralData} from './mural.ts';

const PAGE=40;
const statusLabel=(value:string,pt:boolean)=>({
  PENDING:pt?'Solicitado':'Requested',ACK:pt?'Recebido':'Acknowledged',DONE:pt?'Concluído':'Completed',
  FAILED:pt?'Impedido':'Blocked',SUPERSEDED:pt?'Substituído':'Superseded'
} as Record<string,string>)[value]||value;
const active=(status:string)=>status==='PENDING'||status==='ACK';
const when=(value:string)=>value?value.replace('T',' ').replace(/Z$/,' UTC'):'—';
export function MuralView({state,lang}:{state:SystemState;lang:Lang}){
  const pt=lang==='pt-BR',data=useMemo(()=>privateMuralData(state),[state]);
  const [role,setRole]=useState('ALL'),[filter,setFilter]=useState<'open'|'all'|'closed'>('open');
  const [query,setQuery]=useState(''),[count,setCount]=useState(PAGE);
  const roles=useMemo(()=>[...new Set([...data.requests.flatMap(row=>[row.from,row.to]),...data.messages.flatMap(row=>[row.from,row.to])].filter(Boolean))].sort(),[data]);
  const match=(...fields:string[])=>!query.trim()||fields.some(value=>value.toLowerCase().includes(query.trim().toLowerCase()));
  const scoped=(from:string,to:string)=>role==='ALL'||from===role||to===role||to==='ALL';
  const requests=data.requests.filter(row=>scoped(row.from,row.to)
    &&(filter==='all'||(filter==='open'?active(row.status):!active(row.status)))
    &&match(row.summary,row.action,row.id,row.from,row.to,row.entity,row.thread));
  const messages=data.messages.filter(row=>scoped(row.from,row.to)&&match(row.text,row.id,row.from,row.to,...row.replies.map(reply=>reply.text)));
  const proposals=data.campaigns.filter(row=>match(row.title,row.question,row.id,row.proposedBy));
  const approval=hashForView('INBOX');
  return <main className="pw-page pw-mural">
    <header className="pw-page-title"><p>{pt?'Área privada':'Private area'}</p>
      <h1 tabIndex={-1} data-private-heading>{pt?'Mural operacional':'Operational board'}</h1>
      <p>{pt?'Solicitações entre agentes, respostas vinculadas e novas campanhas aguardando decisão. Exibição somente leitura da Tower verificada.':'Cross-agent requests, linked replies and proposed campaigns. Read-only view of the verified Tower.'}</p>
    </header>
    {proposals.length>0&&<section className="pw-summary" aria-label={pt?'Campanhas propostas':'Proposed campaigns'}>
      <h2>{pt?'Campanhas para sua decisão':'Campaigns requiring your decision'} ({proposals.length})</h2>
      <p className="pw-muted">{pt?'Proposta não é autorização. Aprovação ou rejeição deve ocorrer no fluxo humano autenticado e ser confirmada pelo Writer.':'A proposal is not permission to execute. Approval or rejection requires the authenticated human flow and Writer readback.'}</p>
      <div className="pw-operations">{proposals.map(row=><article key={row.id} className="pw-operation">
        <p className="pw-eyebrow">{pt?'Proposta científica':'Scientific proposal'} · {row.proposedBy||'UNKNOWN'}</p>
        <h3>{row.title}</h3><p>{row.question||'—'}</p>
        <p className="pw-muted">{when(row.proposedAt)}</p>
        <a href={approval}>{pt?'Abrir fluxo de aprovação →':'Open approval flow →'}</a>
        <details><summary>{pt?'Origem e referências':'Source and references'}</summary><p>{row.id}</p>{row.refs.length>0&&<p>{row.refs.join(', ')}</p>}</details>
      </article>)}</div>
    </section>}
    <section className="pw-summary" aria-label={pt?'Solicitações entre agentes':'Agent requests'}>
      <h2>{pt?'Solicitações entre agentes':'Agent handoffs'} ({requests.length})</h2>
      <div className="pw-research-tools">
        <label>{pt?'Destinatário ou remetente':'Sender or recipient'}
          <select value={role} onChange={e=>{setRole(e.target.value);setCount(PAGE);}}>
            <option value="ALL">{pt?'Todos':'All'}</option>{roles.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="pw-search">{pt?'Buscar':'Search'}
          <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setCount(PAGE);}} placeholder={pt?'Pedido, agente ou referência':'Request, role or reference'}/>
        </label>
      </div>
      <div className="pw-tabs" role="group" aria-label={pt?'Estado dos pedidos':'Request status'}>
        {(['open','all','closed'] as const).map(key=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>{setFilter(key);setCount(PAGE);}}>{({open:pt?'Abertos':'Open',all:pt?'Todos':'All',closed:pt?'Encerrados':'Closed'})[key]}</button>)}
      </div>
      <div className="pw-operations" aria-live="polite">{requests.slice(0,count).map(row=><article key={row.id} className="pw-operation">
        <p className="pw-eyebrow">{row.from||'UNKNOWN'} → {row.to||'UNKNOWN'} · {statusLabel(row.status,pt)}</p>
        <h3>{row.summary||row.id}</h3><p>{row.action}</p>
        {row.why&&<p className="pw-muted">{row.why}</p>}
        <details><summary>{pt?'Pedido original e histórico':'Original request and history'}</summary>
          <dl><dt>ID</dt><dd>{row.id}</dd><dt>{pt?'Estado':'Status'}</dt><dd>{row.status}</dd>
            <dt>{pt?'Atualização':'Updated'}</dt><dd>{when(row.updatedAt)}</dd>
            <dt>{pt?'Entidade':'Entity'}</dt><dd>{row.entity||'—'}</dd>
            <dt>{pt?'Conversa':'Thread'}</dt><dd>{row.thread||'—'}</dd>
            <dt>{pt?'Evidências':'Evidence'}</dt><dd>{row.refs.join(', ')||'—'}</dd>
          </dl></details>
      </article>)}</div>
      {requests.length===0&&<p className="pw-empty" role="status">{pt?'Nenhum pedido comprovado neste filtro. Isto não demonstra fila canônica vazia.':'No proven requests match this filter. This does not prove an empty canonical queue.'}</p>}
      {requests.length>count&&<button className="pw-button" type="button" onClick={()=>setCount(v=>v+PAGE)}>{pt?'Mostrar mais':'Show more'}</button>}
    </section>
    <section className="pw-summary" aria-label={pt?'Conversas do mural':'Board conversations'}>
      <h2>{pt?'Conversas do mural':'Board conversations'} ({messages.length})</h2>
      <div className="pw-operations">{messages.slice(0,60).map(row=><article key={row.id} className="pw-operation">
        <p className="pw-eyebrow">{row.from} → {row.to} · {when(row.at)}</p>
        <p>{row.text}</p>
        <p className="pw-muted">{row.replies.length?(pt?`${row.replies.length} resposta(s) registrada(s)`:`${row.replies.length} recorded reply/replies`):(pt?'Sem resposta vinculada':'No linked reply')}</p>
        {row.replies.length>0&&<details><summary>{pt?'Ver respostas':'View replies'}</summary>{row.replies.map(reply=><blockquote key={reply.id}>
          <p><b>{reply.from} → {reply.to}</b> · {when(reply.at)}</p><p>{reply.text}</p></blockquote>)}</details>}
        <details><summary>{pt?'Referências':'References'}</summary><p>{row.id}</p><p>{row.refs.join(', ')||'—'}</p></details>
      </article>)}</div>
      {messages.length===0&&<p className="pw-empty">{pt?'Nenhum recado disponível nesta projeção.':'No board posts available in this projection.'}</p>}
    </section>
    <p className="pw-coverage">{pt?'O mural só mostra registros persistidos na geração canônica. Envios pendentes no inbox do Writer não são confirmados aqui.':'Only materialized canonical records are shown. Writer inbox deliveries are not treated as applied.'} {data.sourceRevision}</p>
  </main>;
}
