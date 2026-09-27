import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createConfiguredApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { LearningMesh } from '../components/LearningMesh';
import { loadLearningSource } from '../data/load-learning';
import { buildLearningMeshModel } from '../data/learning-vnext-model';

type Mode='mesh'|'transfers'|'items'|'memory';
const MODES:Array<{id:Mode;label:string}>=[
 {id:'mesh',label:'Mapa de relações'},{id:'transfers',label:'Ligações entre áreas'},
 {id:'items',label:'Aprendizados'},{id:'memory',label:'Orientações para reutilizar'}
];
const STAGE_LABEL:Record<string,string>={OBSERVATION:'Observação',PATTERN:'Padrão identificado',LESSON:'Lição',STRATEGY:'Estratégia',POLICY:'Orientação'};
const STATUS_LABEL:Record<string,string>={
 OBSERVED:'Observado',CANDIDATE:'Em avaliação',EMERGING:'Sinal inicial',VALIDATED:'Validado',ACTIVE:'Em uso',
 DISPROVED:'Não confirmado',ROLLED_BACK:'Retirado',DRAFT:'Rascunho',PENDING:'Aguardando revisão'
};
const stageLabel=(stage:string)=>STAGE_LABEL[stage]||'Etapa não informada';
const statusLabel=(status:string|null|undefined)=>STATUS_LABEL[String(status||'').toUpperCase()]||'Status não informado';
const itemTitle=(item:any)=>item.label&&item.label!==item.id?item.label:`${stageLabel(item.stage)} sem título`;
const relationLabel=(relation:string|null|undefined)=>({
 METHOD_TRANSFER:'Método compartilhado entre áreas',RELATED_TO:'Relação registrada entre áreas'
}[String(relation||'').toUpperCase()]||'Relação registrada entre áreas');
const fmt=(value:number|null)=>value===null?'—':new Intl.NumberFormat('pt-BR').format(value);
const api=createConfiguredApi();

export default function LearningPage(){
 const [searchParams]=useSearchParams();
 const deepLinkedItem=searchParams.get('item');
 const [source,setSource]=useState<any>(null);
 const [loading,setLoading]=useState(true);
 const [mode,setMode]=useState<Mode>('mesh');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [reducedMotion,setReducedMotion]=useState(false);
 const reload=useCallback(async()=>{setLoading(true);setSource(await loadLearningSource(api));setLoading(false)},[]);
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
 const contextLabel=(anchor:string):string=>contextMap.get(String(anchor).replace(/^context:/,''))||'Outra área';

 if(source&&!source.available)return <div className="nexo-page learning-page">
  <PageHeader eyebrow="APRENDIZADO" title="Aprendizado" description="Observações, padrões e lições registradas entre áreas."
   actions={<button className="nexo-button" onClick={()=>void reload()}>{loading?'Atualizando…':'Tentar novamente'}</button>}/>
  <section className="nexo-empty-state"><span className="nexo-empty-kicker">INDISPONÍVEL</span><h2>Dados de aprendizado indisponíveis</h2><p>Tente novamente para carregar os registros publicados.</p></section>
 </div>;

const metrics=[
  ['Aprendizados registrados',model.metrics?.total],['Validados ou em uso',model.metrics?.promoted],
  ['Ligações entre áreas',model.metrics?.crossDomain],['Áreas relacionadas',model.contexts?.length??null]
 ];
 return <div className="nexo-page learning-page">
  <PageHeader eyebrow="APRENDIZADO" title="Aprendizado" description="Veja observações, padrões, lições e orientações registradas. As conexões mostram relações publicadas; por si só, não comprovam uma hipótese."
   actions={<button className="nexo-button" onClick={()=>void reload()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button>}/>
  <section className="learning-metrics" aria-label="Resumo dos registros de aprendizado">
   {metrics.map(([label,value])=><article key={String(label)}><span>{label}</span><strong>{typeof value==='number'?fmt(value):'—'}</strong></article>)}
  </section>
  <p>“Validados ou em uso” conta itens marcados como validados ou ativos; “ligações entre áreas” conta relações publicadas; “áreas relacionadas” conta as áreas presentes nesses registros.</p>
  <div className="learning-tabs" role="tablist" aria-label="Seções de aprendizado">
   {MODES.map(item=><button key={item.id} className={mode===item.id?'active':''} onClick={()=>setMode(item.id)}>{item.label}</button>)}
  </div>

  {mode==='mesh'&&<section className="learning-stage-shell">
   <div className="learning-canvas-card">
    <div className="learning-canvas-head"><div><span>RELAÇÕES ENTRE ÁREAS</span><h2>Mapa de relações</h2></div><div className="learning-legend"><i className="association"/>Área <i className="lineage"/>Deriva de <i className="transfer"/>Ligação entre áreas</div></div>
    <LearningMesh model={model} selectedId={selected?.id||null} onSelect={setSelectedId} reducedMotion={reducedMotion}/>
   </div>
   <aside className="learning-inspector">
    <span className="learning-inspector-kicker">APRENDIZADO SELECIONADO</span>
    {selected?<>
     <h2>{itemTitle(selected)}</h2><p>{selected.notes||'Sem explicação adicional publicada.'}</p>
     <p>A confiança é uma estimativa entre 0 (menor) e 1 (maior). Registros de apoio contam as evidências ou ocorrências associadas.</p>
     <dl>
      <div><dt>Etapa</dt><dd>{stageLabel(selected.stage)}</dd></div>
      <div><dt>Situação</dt><dd>{statusLabel(selected.status)}</dd></div>
      <div><dt>Área relacionada</dt><dd>{contextLabel(`context:${selected.contextId||'operation'}`)}</dd></div>
      <div><dt>Confiança (0 a 1)</dt><dd>{selected.confidence===null?'Não informada':selected.confidence}</dd></div>
      <div><dt>Registros de apoio</dt><dd>{selected.support===null?'Não informado':selected.support}</dd></div>
     </dl>
    </>:<p>Nenhum registro de aprendizado foi publicado.</p>}
   </aside>
  </section>}
  {mode==='transfers'&&<section className="learning-list-panel">
   <header><span>MÉTODOS COMPARTILHADOS</span><h2>Ligações entre áreas</h2><p>Mostra quando um método ou aprendizado foi relacionado a mais de uma área.</p></header>
   <div className="learning-rows">{transfers.length?transfers.map((item:any)=><article key={item.id}>
    <div><b>{contextLabel(item.source)} → {contextLabel(item.target)}</b><p>{relationLabel(item.relationType)}</p></div>
    <div className="learning-row-meta"><span>{statusLabel(item.status)}</span><span>Confiança (0 a 1): {item.confidence===null?'não informada':item.confidence}</span><span>Registros de apoio: {item.support===null?'não informado':item.support}</span></div>
   </article>):<p className="learning-empty">Nenhuma ligação entre áreas foi publicada.</p>}</div>
  </section>}

  {mode==='items'&&<section className="learning-list-panel">
   <header><span>REGISTROS</span><h2>Aprendizados publicados</h2></header>
   <div className="learning-rows">{(model.items||[]).map((item:any)=><button className="learning-item-row" key={item.id} onClick={()=>{setSelectedId(item.id);setMode('mesh')}}>
    <div><b>{itemTitle(item)}</b><p>{item.notes||'Sem explicação adicional publicada.'}</p></div><span>{stageLabel(item.stage)}</span>
   </button>)}</div>
  </section>}

  {mode==='memory'&&<section className="learning-list-panel">
   <header><span>PARA CONSULTA FUTURA</span><h2>Lições e orientações</h2><p>Conhecimentos registrados para apoiar decisões e atividades futuras.</p></header>
   <div className="learning-rows">{memories.length?memories.map((item:any)=><button className="learning-item-row" key={item.id} onClick={()=>{setSelectedId(item.id);setMode('mesh')}}>
    <div><b>{itemTitle(item)}</b><p>{item.notes||'Sem explicação adicional publicada.'}</p></div><span>{stageLabel(item.stage)}</span>
   </button>):<p className="learning-empty">Nenhuma lição ou orientação foi publicada.</p>}</div>
  </section>}
 </div>;
}
