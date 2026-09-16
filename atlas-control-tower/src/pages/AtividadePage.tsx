import {useEffect,useState} from 'react';
import {semanticCommand} from '../core/google-session';

type Item=Record<string,unknown>;
type ReadState='LOADING'|'READY'|'ERROR';

type LivePayload={state?:string;error?:string;data?:{changes?:Item[];next?:Item[];tests?:Item[];filaments?:Item[]}};

function label(item:Item){return String(item.label||item.title||item.name||item.id||item.work_id||item.test_id||item.run_id||item.request_id||'Item sem título')}
function status(item:Item){return String(item.status||item.state||item.outcome||item._kind||'UNKNOWN')}

export function AtividadePage(){
  const [state,setState]=useState<ReadState>('LOADING');
  const [payload,setPayload]=useState<LivePayload|null>(null);
  const [title,setTitle]=useState('');
  const [writeState,setWriteState]=useState<'IDLE'|'WRITING'|'DONE'|'ERROR'>('IDLE');
  const [writeMessage,setWriteMessage]=useState('');

  const load=()=>{
    setState('LOADING');
    void fetch('/api/live/activity',{headers:{Accept:'application/json'}}).then(async response=>{
      const body=await response.json() as LivePayload;
      if(!response.ok||body.state!=='LIVE')throw new Error(body.error||`HTTP_${response.status}`);
      setPayload(body);setState('READY');
    }).catch(error=>{setPayload({state:'ERROR',error:String(error?.message||error)});setState('ERROR')});
  };

  useEffect(()=>{load()},[]);

  const createWork=async()=>{
    const value=title.trim();
    if(!value)return;
    setWriteState('WRITING');setWriteMessage('');
    try{
      const correlation=`ATLAS-${crypto.randomUUID()}`;
      const result=await semanticCommand('nexo.create_work',{title:value,correlation_id:correlation,domain:'SCIENCE',kind:'RESEARCH',priority:'NORMAL'});
      setWriteState('DONE');setWriteMessage(JSON.stringify(result));setTitle('');load();
    }catch(error){setWriteState('ERROR');setWriteMessage(String(error instanceof Error?error.message:error));}
  };

  const changes=payload?.data?.changes||[];
  const next=payload?.data?.next||[];

  return <div className="page-wrap atividade-page">
    <div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / ATIVIDADE</span><h1>Atividade operacional</h1><p>Estado lido diretamente da TOWER_V06 e operações autenticadas via NEXO.</p></div></div>

    <section className="atlas-card">
      <span className="eyebrow">NOVO WORK</span>
      <h2>Enviar para a Tower</h2>
      <div className="command-row"><input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Ex.: testar hipótese DE-017 contra selection effect" aria-label="Título do novo work"/><button type="button" disabled={!title.trim()||writeState==='WRITING'} onClick={()=>void createWork()}>{writeState==='WRITING'?'Enviando…':'Criar WORK'}</button></div>
      {writeState==='DONE'&&<p role="status">WORK criado e readback recebido.</p>}
      {writeState==='ERROR'&&<p role="alert">{writeMessage}</p>}
    </section>

    {state==='LOADING'&&<p role="status">Lendo TOWER_V06…</p>}
    {state==='ERROR'&&<p role="alert">Falha ao ler a API live: {payload?.error||'erro desconhecido'}</p>}
    {state==='READY'&&<>
      <section className="atlas-card"><span className="eyebrow">PRÓXIMAS AÇÕES</span>{!next.length?<p>Nenhum WORK ativo.</p>:<ul className="activity-drawer-list">{next.slice(0,20).map((item,index)=><li key={String(item.id||item.work_id||index)}><span>{label(item)}</span><small>{status(item)}</small></li>)}</ul>}</section>
      <section className="atlas-card"><span className="eyebrow">MUDANÇAS / EXECUÇÕES</span>{!changes.length?<p>Nenhuma mutação ou execução recente.</p>:<ol className="activity-timeline">{changes.slice(0,30).map((item,index)=><li key={String(item.id||item.run_id||item.request_id||index)} className="activity-event"><div><span className="eyebrow">{String(item._kind||'EVENT')}</span><b>{label(item)}</b></div><div className="activity-event-meta"><strong>{status(item)}</strong></div></li>)}</ol>}</section>
    </>}
  </div>;
}
