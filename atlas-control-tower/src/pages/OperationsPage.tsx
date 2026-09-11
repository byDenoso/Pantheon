import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { loadOperationsSources } from '../data/load-operations';
import { buildOperationsModel } from '../data/operations-vnext-model';

type Sources=Awaited<ReturnType<typeof loadOperationsSources>>;
const nf=new Intl.NumberFormat('pt-BR');
const value=(v:number|string|null)=>v===null||v===''?'—':typeof v==='number'?nf.format(v):v;
const tone=(status:string)=>/FAIL|BLOCK|DEGRADED/.test(status)?'danger':/PASS|SUCCESS/.test(status)?'ok':'neutral';
const when=(stamp:string)=>stamp?new Date(stamp).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';

export default function OperationsPage(){
 const [searchParams]=useSearchParams();
 const focusedId=searchParams.get('run')||searchParams.get('event')||searchParams.get('action')||'';
 const [sources,setSources]=useState<Sources|null>(null);
 const [loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{setLoading(true);setSources(await loadOperationsSources());setLoading(false)},[]);
 useEffect(()=>{void reload()},[reload]);
 const model=useMemo(()=>buildOperationsModel(sources??{}),[sources]);
 const focusedItem=useMemo(()=>focusedId?[...model.runs,...model.events,...model.actions].find(item=>item.id===focusedId)||null:null,[focusedId,model]);
 const metrics=[
  ['Runs',model.metrics.runs],['Sucesso',model.metrics.success],
  ['Bloqueios',model.metrics.blocked],['Readback',model.metrics.readback],
 ] as const;
 if(sources&&!model.available)return <div className="nexo-page operations-page">
  <PageHeader eyebrow="OPERAÇÃO" title="Operação" description="Execução, automações, Black Box e integridade operacional."/>
  <section className="nexo-empty-state"><span className="nexo-empty-kicker">INDISPONÍVEL</span><h2>Fonte indisponível</h2><p>Nenhum estado operacional foi sintetizado.</p></section>
 </div>;
 return <div className="nexo-page operations-page">
  <PageHeader eyebrow="OPERAÇÃO" title="Operação" description="Execução, runtime, automações e integridade. A página mostra estado publicado; não infere saúde a partir de silêncio."
   actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>
  {focusedId?<section className={`operation-focus ${focusedItem?'found':'missing'}`} aria-live="polite">
   <span className="panel-kicker">ABERTO PELA BUSCA</span><div><b>{focusedItem?.label||focusedId}</b><p>{focusedItem?.summary||'O item não está no recorte operacional carregado.'}</p></div><span className={`status-chip ${tone(focusedItem?.status||'')}`}>{focusedItem?.status||'—'}</span>
  </section>:null}
  <section className="operations-metrics" aria-label="Indicadores operacionais">
   {metrics.map(([label,v])=><article key={label}><span>{label}</span><strong>{value(v)}</strong></article>)}
  </section>
  <section className="operations-grid">
   <article className="operations-panel blockers-panel">
    <header><div><span>ATENÇÃO</span><h2>Bloqueios</h2></div><b>{model.blockers.length}</b></header>
    <div className="operations-list">{model.blockers.length?model.blockers.map(item=><div className="operations-row" key={item.id}>
     <i className="danger"/><div><b>{item.label}</b><p>{item.reason||'Motivo não publicado.'}</p><small>{item.domain||'—'} · prioridade {item.priority??'—'}</small></div>
    </div>):<p className="operations-empty">{sources?.ops?'Nenhum bloqueio declarado.':'Fonte indisponível.'}</p>}</div>
   </article>
   <article className="operations-panel integrity-panel">
    <header><div><span>CONTRATO</span><h2>Integridade</h2></div><i className={`integrity-light ${tone(model.integrity.health)}`}/></header>
    <dl className="operations-facts">
     <div><dt>Health</dt><dd>{model.integrity.health}</dd></div><div><dt>Contrato</dt><dd>{model.integrity.contract||'—'}</dd></div>
     <div><dt>Freshness</dt><dd>{model.integrity.freshness||'—'}</dd></div><div><dt>Fallback</dt><dd>{model.integrity.fallback===null?'—':model.integrity.fallback?'SIM':'NÃO'}</dd></div>
     <div><dt>Índice semântico</dt><dd>{value(model.integrity.semanticIndex)}</dd></div>
    </dl>
   </article>
  </section>
  <section className="operations-grid lower">
   <article className="operations-panel runs-panel">
    <header><div><span>EXECUÇÃO</span><h2>Runs recentes</h2></div><b>{model.recentRuns.length}</b></header>
    <div className="operations-list dense">{model.recentRuns.length?model.recentRuns.map(run=><div className="operations-run" key={run.id}>
     <span className={`status-chip ${tone(run.status)}`}>{run.status||'—'}</span><div><b>{run.label}</b><p>{run.summary||'Sem resumo publicado.'}</p><small>{run.loop||run.domain||'—'} · {when(run.updatedAt)} · readback {run.readbackVerified?'verificado':'não verificado'}</small></div>
    </div>):<p className="operations-empty">{sources?.runs?'Nenhum run publicado.':'Fonte indisponível.'}</p>}</div>
   </article>
   <article className="operations-panel automations-panel">
    <header><div><span>ROTINAS</span><h2>Automações</h2></div><b>{model.automations.length}</b></header>
    <div className="automation-grid">{model.automations.length?model.automations.map(item=><article key={item.name}>
     <div><b>{item.name}</b><span className={`status-chip ${tone(item.status)}`}>{item.status||'—'}</span></div>
     <p>{item.domain||'—'}</p><small>{when(item.lastRun)} · readback {item.readbackVerified?'verificado':'pendente'}</small>
    </article>):<p className="operations-empty">{sources?.runs?'Nenhuma automação inferível dos runs publicados.':'Fonte indisponível.'}</p>}</div>
   </article>
  </section>
  <section className="operations-panel blackbox-panel">
   <header><div><span>EVENTOS</span><h2>Black Box</h2></div><b>{model.blackBox.length}</b></header>
   <div className="blackbox-timeline">{model.blackBox.length?model.blackBox.map(event=><article key={event.id}>
    <time>{when(event.updatedAt)}</time><i className={tone(event.status)}/><div><b>{event.label}</b><p>{event.summary||'Sem resumo publicado.'}</p><small>{event.component||event.domain||'—'} · {event.status||'—'}</small></div>
   </article>):<p className="operations-empty">{sources?.ops?'Nenhum evento publicado.':'Fonte indisponível.'}</p>}</div>
  </section>
 </div>;
}
