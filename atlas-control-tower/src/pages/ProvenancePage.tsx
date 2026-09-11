import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LineageDag } from '../components/LineageDag';
import { loadProvenanceSources } from '../data/load-provenance';
import { buildAuditModel, buildLineageModel } from '../data/provenance-vnext-model';

type Sources=Awaited<ReturnType<typeof loadProvenanceSources>>;
const nf=new Intl.NumberFormat('pt-BR');
const value=(v:number|null)=>v===null?'—':nf.format(v);
const safeUrl=(url:string)=>/^https:\/\//i.test(url)?url:'';

export default function ProvenancePage(){
 const [params,setParams]=useSearchParams();
 const focusId=params.get('id')||'';
 const auditId=params.get('audit')||'';
 const [query,setQuery]=useState(focusId);
 const [sources,setSources]=useState<Sources|null>(null);
 const [loading,setLoading]=useState(true);
 const [selectedId,setSelectedId]=useState<string|null>(focusId||null);
 const reload=useCallback(async()=>{setLoading(true);setSources(await loadProvenanceSources(undefined,focusId));setLoading(false)},[focusId]);
 useEffect(()=>{setQuery(focusId);setSelectedId(focusId||null);void reload()},[focusId,reload]);
 const audit=useMemo(()=>buildAuditModel(sources?.audit??null),[sources]);
 const lineage=useMemo(()=>buildLineageModel(sources?.lineage??null,focusId),[sources,focusId]);
 const selected=lineage.nodes.find((node:any)=>node.id===(selectedId||focusId))||lineage.nodes.find((node:any)=>node.id===focusId)||null;
 const submit=(event:FormEvent)=>{event.preventDefault();const id=query.trim();if(id)setParams({id})};
 return <div className="nexo-page provenance-page">
  <PageHeader eyebrow="TRUST" title="Proveniência" description="Fontes, lineage e integridade verificável. O panorama vem da auditoria; a cadeia vem da entidade selecionada."
   actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>
  <section className="provenance-metrics" aria-label="Saúde da proveniência">
   <article><span>Auditadas</span><strong>{value(audit.metrics.total)}</strong></article>
   <article><span>Abertas</span><strong>{value(audit.metrics.open)}</strong></article>
   <article><span>Resolvidas</span><strong>{value(audit.metrics.resolved)}</strong></article>
  </section>
  <section className="provenance-grid">
   <article className="provenance-panel audit-panel">
    <header><div><span>AUDITORIA</span><h2>Saúde da proveniência</h2></div><b>{audit.available?'publicada':'indisponível'}</b></header>
    <div className="audit-categories">{audit.categories.length?audit.categories.map(category=><article className={category.id===auditId?'search-target':''} key={category.id}>
     <div><b>{category.label}</b><span>{category.openCount??'—'} abertas</span></div><strong>{category.count??'—'}</strong>
    </article>):<p className="provenance-empty">{sources?.audit?'Nenhuma categoria publicada.':'Fonte indisponível.'}</p>}</div>
   </article>
   <article className="provenance-panel issues-panel">
    <header><div><span>ISSUES</span><h2>Itens recentes</h2></div><b>{audit.issues.length}</b></header>
    <div className="provenance-issues">{audit.issues.slice(0,8).map(issue=><article key={issue.id}>
     <span className={`issue-state ${issue.open?'open':'resolved'}`}>{issue.open?'OPEN':'RESOLVED'}</span><div><b>{issue.label}</b><p>{issue.detail||issue.missing||'Sem detalhe publicado.'}</p><small>{issue.issueType}</small></div>
    </article>)}</div>
   </article>
  </section>
  <section className="provenance-panel lineage-panel">
   <header className="lineage-header"><div><span>CADEIA DA ENTIDADE</span><h2>Lineage</h2></div>
    <form className="lineage-search" onSubmit={submit}><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ID canônico da entidade" aria-label="Entidade para lineage"/><button className="nexo-button" type="submit">Abrir</button></form>
   </header>
   {!focusId?<div className="lineage-prompt"><b>Selecione uma entidade</b><p>Informe um ID canônico ou abra esta página a partir da busca global para visualizar a cadeia dirigida.</p></div>:
   !lineage.available?<div className="lineage-prompt"><b>Lineage indisponível</b><p>A entidade não pôde ser carregada; nenhum DAG substituto foi sintetizado.</p></div>:
   <div className="lineage-workspace">
    <LineageDag model={lineage} selectedId={selectedId} onSelect={setSelectedId}/>
    <aside className="lineage-inspector"><span>ENTIDADE</span>{selected?<>
     <h3>{selected.label}</h3><p>{selected.summary||'Sem resumo publicado.'}</p>
     <dl><div><dt>Tipo</dt><dd>{selected.type||'—'}</dd></div><div><dt>Status</dt><dd>{selected.status||'—'}</dd></div></dl>
     <div className="source-refs"><b>SourceRefs</b>{selected.sourceRefs?.length?selected.sourceRefs.map((ref:any,index:number)=>{
      const url=safeUrl(ref.url);return url?<a key={`${ref.sourceRef}:${index}`} href={url} target="_blank" rel="noreferrer"><span>{ref.source||'Fonte'}</span><small>{ref.sourceRef||url}</small></a>:<div key={`${ref.sourceRef}:${index}`}><span>{ref.source||'Fonte'}</span><small>{ref.sourceRef||'—'}</small></div>;
     }):<p>Nenhuma referência publicada para esta entidade.</p>}</div>
    </>:<p>Selecione um nó do DAG.</p>}</aside>
   </div>}
  </section>
 </div>;
}
