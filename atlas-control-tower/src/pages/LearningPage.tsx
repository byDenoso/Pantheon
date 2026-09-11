import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LearningMesh } from '../components/LearningMesh';
import { loadLearningSource } from '../data/load-learning';
import { buildLearningMeshModel } from '../data/learning-vnext-model';

type Mode='mesh'|'transfers'|'items'|'memory';
const MODES:Array<{id:Mode;label:string}>=[
 {id:'mesh',label:'Mapa neural'},{id:'transfers',label:'Transferências'},
 {id:'items',label:'Aprendizados'},{id:'memory',label:'Memória procedural'}
];
const STAGE_LABEL:Record<string,string>={OBSERVATION:'Observação',PATTERN:'Padrão',LESSON:'Lição',STRATEGY:'Estratégia',POLICY:'Política'};
const fmt=(value:number|null)=>value===null?'—':new Intl.NumberFormat('pt-BR').format(value);

export default function LearningPage(){
 const [searchParams]=useSearchParams();
 const deepLinkedItem=searchParams.get('item');
 const [source,setSource]=useState<any>(null);
 const [loading,setLoading]=useState(true);
 const [mode,setMode]=useState<Mode>('mesh');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [reducedMotion,setReducedMotion]=useState(false);
 const reload=useCallback(async()=>{setLoading(true);setSource(await loadLearningSource());setLoading(false)},[]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{if(deepLinkedItem){setSelectedId(deepLinkedItem);setMode('mesh')}},[deepLinkedItem]);
 useEffect(()=>{
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if(!media)return;const update=()=>setReducedMotion(media.matches);update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);
 },[]);
 const model:any=useMemo(()=>buildLearningMeshModel(source?.report??null),[source]);
 const selected=model.items?.find((item:any)=>item.id===selectedId)||model.items?.find((item:any)=>item.status==='VALIDATED')||model.items?.[0]||null;
 const transfers=(model.filaments||[]).filter((item:any)=>item.type==='transfer');
 const memories=(model.items||[]).filter((item:any)=>['LESSON','STRATEGY','POLICY'].includes(String(item.stage)));
 const contextMap=new Map<string,string>((model.contexts||[]).map((item:any):[string,string]=>[String(item.id),String(item.label)]));
 const contextLabel=(anchor:string):string=>contextMap.get(String(anchor).replace(/^context:/,''))||String(anchor).replace(/^context:/,'');

 if(source&&!source.available)return <div className="nexo-page learning-page">
  <PageHeader eyebrow="LEARNING" title="Learning" description="Padrões, transferências e memória procedural entre contextos do NEXO."
   actions={<button className="nexo-button" onClick={()=>void reload()}>{loading?'Atualizando…':'Tentar novamente'}</button>}/>
  <section className="nexo-empty-state"><span className="nexo-empty-kicker">INDISPONÍVEL</span><h2>Fonte indisponível</h2><p>O Learning não foi sintetizado a partir de cache visual ou dados presumidos.</p></section>
 </div>;

 const metrics=[
  ['Aprendizados',model.metrics?.total],['Promovidos',model.metrics?.promoted],
  ['Transferências',model.metrics?.crossDomain],['Contextos conectados',model.contexts?.length??null]
 ];
 return <div className="nexo-page learning-page">
  <PageHeader eyebrow="LEARNING" title="Learning" description="Uma camada transversal de padrões, transferências e memória procedural. Os filamentos mostram relações publicadas, não evidência científica implícita."
   actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>
  <section className="learning-metrics" aria-label="Métricas do Learning">
   {metrics.map(([label,value])=><article key={String(label)}><span>{label}</span><strong>{typeof value==='number'?fmt(value):'—'}</strong></article>)}
  </section>
  <div className="learning-tabs" role="tablist" aria-label="Modos do Learning">
   {MODES.map(item=><button key={item.id} className={mode===item.id?'active':''} onClick={()=>setMode(item.id)}>{item.label}</button>)}
  </div>

  {mode==='mesh'&&<section className="learning-stage-shell">
   <div className="learning-canvas-card">
    <div className="learning-canvas-head"><div><span>REDE TRANSVERSAL</span><h2>Mapa neural</h2></div><div className="learning-legend"><i className="association"/>Contexto <i className="lineage"/>Lineage <i className="transfer"/>Transferência</div></div>
    <LearningMesh model={model} selectedId={selected?.id||null} onSelect={setSelectedId} reducedMotion={reducedMotion}/>
   </div>
   <aside className="learning-inspector">
    <span className="learning-inspector-kicker">APRENDIZADO SELECIONADO</span>
    {selected?<>
     <h2>{selected.label}</h2><p>{selected.notes||'Sem resumo adicional publicado.'}</p>
     <dl>
      <div><dt>Estágio</dt><dd>{STAGE_LABEL[selected.stage]||selected.stage||'—'}</dd></div>
      <div><dt>Status</dt><dd>{selected.status||'—'}</dd></div>
      <div><dt>Contexto</dt><dd>{contextLabel(`context:${selected.contextId||'operation'}`)}</dd></div>
      <div><dt>Confiança</dt><dd>{selected.confidence===null?'Não publicada':selected.confidence}</dd></div>
      <div><dt>Suporte</dt><dd>{selected.support===null?'—':selected.support}</dd></div>
     </dl>
    </>:<p>Nenhum aprendizado publicado.</p>}
   </aside>
  </section>}
  {mode==='transfers'&&<section className="learning-list-panel">
   <header><span>RELAÇÕES ENTRE CONTEXTOS</span><h2>Transferências declaradas</h2></header>
   <div className="learning-rows">{transfers.length?transfers.map((item:any)=><article key={item.id}>
    <div><b>{contextLabel(item.source)} → {contextLabel(item.target)}</b><p>{item.relationType||'Transferência entre contextos'}</p></div>
    <div className="learning-row-meta"><span>{item.status||'—'}</span><span>conf. {item.confidence===null?'—':item.confidence}</span><span>suporte {item.support===null?'—':item.support}</span></div>
   </article>):<p className="learning-empty">Nenhuma transferência cross-domain publicada.</p>}</div>
  </section>}

  {mode==='items'&&<section className="learning-list-panel">
   <header><span>CORPUS</span><h2>Aprendizados publicados</h2></header>
   <div className="learning-rows">{(model.items||[]).map((item:any)=><button className="learning-item-row" key={item.id} onClick={()=>{setSelectedId(item.id);setMode('mesh')}}>
    <div><b>{item.label}</b><p>{item.notes||'Sem resumo adicional publicado.'}</p></div><span>{STAGE_LABEL[item.stage]||item.stage}</span>
   </button>)}</div>
  </section>}

  {mode==='memory'&&<section className="learning-list-panel">
   <header><span>REUTILIZAÇÃO</span><h2>Memória procedural</h2></header>
   <div className="learning-rows">{memories.length?memories.map((item:any)=><button className="learning-item-row" key={item.id} onClick={()=>{setSelectedId(item.id);setMode('mesh')}}>
    <div><b>{item.label}</b><p>{item.notes||'Sem resumo adicional publicado.'}</p></div><span>{STAGE_LABEL[item.stage]||item.stage}</span>
   </button>):<p className="learning-empty">Nenhuma memória procedural publicada.</p>}</div>
  </section>}
 </div>;
}
