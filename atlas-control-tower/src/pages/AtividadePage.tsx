import {useEffect,useState} from 'react';
import {controlPlaneAction,type ControlPlaneAction,type ControlPlaneEnvelope} from '../core/google-session';

type Item=Record<string,unknown>;
type ReadState='LOADING'|'READY'|'ERROR';

type LivePayload={state?:string;error?:string;data?:{changes?:Item[];next?:Item[];tests?:Item[];filaments?:Item[]}};

function label(item:Item){return String(item.label||item.title||item.name||item.id||item.work_id||item.test_id||item.run_id||item.request_id||'Item sem título')}
function status(item:Item){return String(item.status||item.state||item.outcome||item._kind||'UNKNOWN').toUpperCase()}
function workId(item:Item){return String(item.work_id||item.id||'').trim()}
function runId(item:Item){return String(item.run_id||'').trim()}

export function AtividadePage(){
  const [state,setState]=useState<ReadState>('LOADING');
  const [payload,setPayload]=useState<LivePayload|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [operation,setOperation]=useState<ControlPlaneEnvelope|null>(null);
  const [actionError,setActionError]=useState('');

  const load=()=>{
    setState('LOADING');
    void fetch('/api/live/activity',{headers:{Accept:'application/json'}}).then(async response=>{
      const body=await response.json() as LivePayload;
      if(!response.ok||body.state!=='LIVE')throw new Error(body.error||`HTTP_${response.status}`);
      setPayload(body);setState('READY');
    }).catch(error=>{setPayload({state:'ERROR',error:String(error?.message||error)});setState('ERROR')});
  };

  useEffect(()=>{load()},[]);

  const runAction=async(action:ControlPlaneAction,target?:string,extra:Record<string,unknown>={})=>{
    const key=`${action}:${target||'TOWER_V06'}`;
    setBusy(key);setActionError('');setOperation(null);
    try{
      const result=await controlPlaneAction(action,target,extra);
      setOperation(result);
      if(result.acceptance==='accepted'&&(result.readback||result.evidence?.length))load();
    }catch(error){setActionError(String(error instanceof Error?error.message:error));}
    finally{setBusy(null);}
  };

  const changes=payload?.data?.changes||[];
  const next=payload?.data?.next||[];
  const verified=Boolean(operation&&operation.acceptance==='accepted'&&(operation.readback||operation.evidence?.length));

  return <div className="page-wrap atividade-page">
    <div className="page-heading"><div><span className="eyebrow">NEXO ATLAS / CONTROL PLANE</span><h1>Atividade operacional</h1><p>Estado lido diretamente da TOWER_V06. Ações passam pelo MCP/NEXO e só são confirmadas com readback ou evidência.</p></div></div>

    <section className="atlas-card">
      <span className="eyebrow">CONTROL PLANE V1</span>
      <h2>Operações canônicas</h2>
      <div className="command-row"><button type="button" disabled={busy!==null} onClick={()=>void runAction('SYNC')}>{busy==='SYNC:TOWER_V06'?'Sincronizando…':'SYNC'}</button></div>
      <p>RECONCILE, EXECUTE e RECOVER aparecem somente sobre WORKs já existentes. VALIDATE aparece somente para execuções com run_id.</p>
      {actionError&&<p role="alert">{actionError}</p>}
      {operation&&<div className="operation-readback" role="status">
        <p><b>{operation.action}</b> · {operation.acceptance} · {operation.state}</p>
        {verified?<p>Concluído com readback/evidence verificável.</p>:<p>Aguardando readback/evidence; nenhuma conclusão foi inferida do HTTP.</p>}
        {operation.blocker&&<pre>{JSON.stringify(operation.blocker,null,2)}</pre>}
        {operation.readback&&<pre>{JSON.stringify(operation.readback,null,2)}</pre>}
      </div>}
    </section>

    {state==='LOADING'&&<p role="status">Lendo TOWER_V06…</p>}
    {state==='ERROR'&&<p role="alert">Falha ao ler a API live: {payload?.error||'erro desconhecido'}</p>}
    {state==='READY'&&<>
      <section className="atlas-card"><span className="eyebrow">PRÓXIMAS AÇÕES</span>{!next.length?<p>Nenhum WORK ativo.</p>:<ul className="activity-drawer-list">{next.slice(0,20).map((item,index)=>{
        const id=workId(item),current=status(item);
        return <li key={id||String(index)}><span>{label(item)}</span><small>{current}</small><div className="command-row">
          {id&&<button type="button" disabled={busy!==null} onClick={()=>void runAction('RECONCILE',id)}>RECONCILE</button>}
          {id&&current==='READY'&&<button type="button" disabled={busy!==null} onClick={()=>void runAction('EXECUTE',id)}>EXECUTE</button>}
          {id&&current==='CHECKPOINTED'&&<button type="button" disabled={busy!==null} onClick={()=>void runAction('RECOVER',id)}>RECOVER</button>}
        </div></li>;
      })}</ul>}</section>
      <section className="atlas-card"><span className="eyebrow">MUDANÇAS / EXECUÇÕES</span>{!changes.length?<p>Nenhuma mutação ou execução recente.</p>:<ol className="activity-timeline">{changes.slice(0,30).map((item,index)=>{
        const id=runId(item);
        return <li key={String(item.id||id||item.request_id||index)} className="activity-event"><div><span className="eyebrow">{String(item._kind||'EVENT')}</span><b>{label(item)}</b></div><div className="activity-event-meta"><strong>{status(item)}</strong>{id&&<button type="button" disabled={busy!==null} onClick={()=>void runAction('VALIDATE',id)}>VALIDATE</button>}</div></li>;
      })}</ol>}</section>
    </>}
  </div>;
}
