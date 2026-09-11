import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { loadOverviewSources } from '../data/load-overview';
import { buildOverviewModel } from '../data/overview-model';

type Sources=Awaited<ReturnType<typeof loadOverviewSources>>;
const nf=new Intl.NumberFormat('pt-BR');
const value=(v:number|string|null)=>v===null?'—':typeof v==='number'?nf.format(v):v;
const statusTone=(status:string)=>/BLOCK|FAIL|ERROR/.test(status)?'danger':/PASS|SUCCESS|RECOVER/.test(status)?'ok':'neutral';

export default function OverviewPage(){
  const [sources,setSources]=useState<Sources|null>(null);
  const [loading,setLoading]=useState(true);
  const reload=useCallback(async()=>{
    setLoading(true);
    setSources(await loadOverviewSources());
    setLoading(false);
  },[]);
  useEffect(()=>{void reload()},[reload]);
  const model=useMemo(()=>buildOverviewModel(sources??{state:null,ops:null,audit:null}),[sources]);
  const metrics=[
    ['Claims ativas',model.metrics.activeClaims,'science'],
    ['Bloqueios',model.metrics.blockedActions,'attention'],
    ['Testes',model.metrics.tests,'tests'],
    ['Readback',model.metrics.readback,'readback'],
  ] as const;
  return <div className="nexo-page overview-page">
    <PageHeader eyebrow="NEXO ATLAS" title="Observatório científico" description="O que mudou, o que está bloqueado e onde vale olhar agora. A home resume; os Universos explicam."
      actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>

    <div className="overview-source-row">
      <span className={`overview-source ${model.availability.state?'ok':'offline'}`}>
        <i/>{model.availability.state?model.source.label:'Fonte indisponível'}
      </span>
      {model.source.version&&model.availability.state&&<span className="overview-version">snapshot {model.source.version}</span>}
    </div>

    <section className="overview-metrics" aria-label="Indicadores principais">
      {metrics.map(([label,v,key])=><article className={`overview-metric ${key}`} key={key}>
        <span>{label}</span><strong>{value(v)}</strong>
      </article>)}
    </section>

    <section className="overview-grid">
      <article className="overview-panel changes-panel">
        <header><div><span className="panel-kicker">RECENTE</span><h2>O que mudou</h2></div><span>{model.changes.length}</span></header>
        <div className="overview-list">
          {model.changes.length?model.changes.map(item=><div className="overview-list-item" key={item.id}>
            <span className={`status-dot ${statusTone(item.status)}`}/><div><b>{item.label}</b><p>{item.summary||'Sem resumo publicado.'}</p><small>{item.domain} · {item.status}</small></div>
          </div>):<p className="overview-empty">{model.availability.ops?'Nenhuma mudança recente publicada.':'Fonte indisponível.'}</p>}
        </div>
      </article>
      <article className="overview-panel blockers-panel">
        <header><div><span className="panel-kicker">ATENÇÃO</span><h2>Bloqueios</h2></div><span>{model.attention.length}</span></header>
        <div className="overview-list compact">
          {model.attention.length?model.attention.map(item=><div className="overview-list-item" key={item.id}>
            <span className="status-dot danger"/><div><b>{item.label}</b><p>{item.reason||'Motivo não publicado.'}</p><small>{item.domain} · prioridade {Number.isFinite(item.priority)?item.priority:'—'}</small></div>
          </div>):<p className="overview-empty">{model.availability.ops?'Nenhum bloqueio operacional declarado.':'Fonte indisponível.'}</p>}
        </div>
      </article>

      <article className="overview-panel science-panel">
        <header><div><span className="panel-kicker">CORPUS</span><h2>Estado científico</h2></div></header>
        <dl className="overview-facts">
          <div><dt>Domínios</dt><dd>{value(model.science.domains)}</dd></div>
          <div><dt>Testes</dt><dd>{value(model.science.tests)}</dd></div>
          <div><dt>Resultados</dt><dd>{value(model.science.results)}</dd></div>
          <div><dt>Claims</dt><dd>{value(model.science.claims)}</dd></div>
          <div><dt>Claims bloqueadas</dt><dd>{value(model.science.blockedClaims)}</dd></div>
        </dl>
      </article>
      <article className="overview-panel provenance-panel">
        <header><div><span className="panel-kicker">TRUST</span><h2>Proveniência</h2></div></header>
        <dl className="overview-facts">
          <div><dt>Issues abertas</dt><dd>{value(model.provenance.openIssues)}</dd></div>
          <div><dt>Resolvidas</dt><dd>{value(model.provenance.resolvedIssues)}</dd></div>
          <div><dt>Total auditado</dt><dd>{value(model.provenance.totalIssues)}</dd></div>
        </dl>
        <p className="provenance-note">{model.availability.audit?'Leitura derivada do contrato de auditoria.':'Fonte indisponível.'}</p>
      </article>
    </section>
  </div>;
}
