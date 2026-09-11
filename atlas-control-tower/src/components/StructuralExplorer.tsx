import { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/atlas-api.mjs';
import { AtlasCanvas } from '../scene/AtlasCanvas';
import type { AtlasGraph, AtlasNode } from '../scene/types';

type View='map'|'summary'|'claims'|'tests'|'evidence'|'sources';
type Props={rootFocusId:string};
const VIEWS:Array<[View,string]>=[['map','Mapa'],['summary','Resumo'],['claims','Claims'],['tests','Testes'],['evidence','Evidências'],['sources','Fontes']];
const nodeType=(node:AtlasNode)=>String(node.type||'').toUpperCase();

function useReducedMotion(){
 const [value,setValue]=useState(()=>typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)').matches:false);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setValue(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 return value;
}

export function StructuralExplorer({rootFocusId}:Props){
 const api=useMemo(()=>createApi(),[]);
 const reducedMotion=useReducedMotion();
 const [view,setView]=useState<View>('map');
 const [focusId,setFocusId]=useState(rootFocusId);
 const [graph,setGraph]=useState<AtlasGraph|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [limit,setLimit]=useState(180);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [selectedEntity,setSelectedEntity]=useState<any>(null);
 const [autoOrbit,setAutoOrbit]=useState(false);
 useEffect(()=>{setFocusId(rootFocusId);setLimit(180);setSelectedId(null);setSelectedEntity(null)},[rootFocusId]);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');
  void api.graph({focus:focusId,depth:2,limit}).then((next:any)=>{if(!live)return;setGraph(next);setLoading(false)}).catch(()=>{if(!live)return;setLoading(false);setError('GRAPH_READ_FAILED')});
  return()=>{live=false};
 },[api,focusId,limit]);
 useEffect(()=>{
  if(!selectedId){setSelectedEntity(null);return}
  let live=true;void api.entity(selectedId).then((entity:any)=>{if(live)setSelectedEntity(entity)}).catch(()=>{if(live)setSelectedEntity(null)});
  return()=>{live=false};
 },[api,selectedId]);

 const selected=(selectedEntity?.entity||{}) as Record<string,any>;
 const sourceRefs=Array.isArray(selected.sourceRefs)?selected.sourceRefs:[];
 const meta=selected.metadata&&typeof selected.metadata==='object'?selected.metadata:{};
 const grouped=useMemo(()=>{
  const nodes=graph?.nodes||[];
  return {
   claims:nodes.filter(n=>nodeType(n)==='CLAIM'),
   tests:nodes.filter(n=>nodeType(n)==='TEST'),
   evidence:nodes.filter(n=>['RESULT','EVIDENCE'].includes(nodeType(n))),
  };
 },[graph]);
 const counts=useMemo(()=>{
  const out:Record<string,number>={};
  for(const node of graph?.nodes||[])out[nodeType(node)]=(out[nodeType(node)]||0)+1;
  return out;
 },[graph]);
 const select=(node:AtlasNode)=>setSelectedId(node.id);
 const open=(node:AtlasNode)=>{setFocusId(node.id);setSelectedId(null);setSelectedEntity(null);setLimit(180)};
 const resetFocus=()=>{setFocusId(rootFocusId);setSelectedId(null);setSelectedEntity(null);setLimit(180)};

 const listForView=view==='claims'?grouped.claims:view==='tests'?grouped.tests:view==='evidence'?grouped.evidence:[];
 return <section className="structural-explorer">
  <div className="structural-tabs" role="tablist" aria-label="Modos do subdomínio">
   {VIEWS.map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}>{label}</button>)}
  </div>
  {view==='map'?<div className="structural-map-shell">
   <div className="structural-map-toolbar">
    <span><b>{focusId}</b>{loading?' · carregando…':''}</span>
    <div>{focusId!==rootFocusId&&<button onClick={resetFocus}>Voltar ao subdomínio</button>}<button onClick={()=>setAutoOrbit(v=>!v)}>{autoOrbit?'Pausar órbita':'Órbita automática'}</button></div>
   </div>
   <div className="structural-map-canvas">
    <AtlasCanvas graph={graph} focusId={focusId} selectedId={selectedId} onSelect={select} onOpen={open} reducedMotion={reducedMotion} autoOrbit={autoOrbit}/>
    {error&&<div className="structural-error">Falha ao ler o recorte. O último grafo válido foi preservado.</div>}
   </div>
   <div className="structural-map-footer"><span>{graph?.nodes?.length||0} nós · {graph?.edges?.length||0} relações</span>{(graph?.truncated||graph?.hasMore)&&<button onClick={()=>setLimit(v=>v+180)}>Mais entidades</button>}</div>
  </div>:null}

  {view==='summary'?<div className="structural-summary">{Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([type,count])=><article key={type}><span>{type}</span><strong>{count}</strong></article>)}</div>:null}
  {['claims','tests','evidence'].includes(view)?<div className="structural-list">{listForView.length?listForView.map(node=><button key={node.id} onClick={()=>select(node)}><div><span>{nodeType(node)}</span><b>{String(node.label||node.id)}</b></div><em className="status-pill">{String(node.status||'—')}</em></button>):<p className="universe-inline-empty">Nenhuma entidade desse tipo no recorte atual.</p>}</div>:null}

  {view==='sources'?<div className="structural-sources">{selectedId?<>
   <div className="structural-source-head"><span className="panel-kicker">Fonte da entidade selecionada</span><h3>{String(selected.label||selected.id||selectedId)}</h3></div>
   {sourceRefs.length?sourceRefs.map((ref:any,index:number)=><article key={`${String(ref.sourceRef||ref.url||index)}`}>
    <div><b>{String(ref.source||'Fonte')}</b><p>{String(ref.sourceRef||'Referência publicada')}</p></div>
    {ref.url?<a href={String(ref.url)} target="_blank" rel="noreferrer">Abrir ↗</a>:<span className="status-pill">SEM URL</span>}
   </article>):<p className="universe-inline-empty">Nenhuma referência de fonte publicada para esta entidade.</p>}
  </>:<p className="universe-inline-empty">Selecione uma entidade no mapa ou nas listas para ver suas fontes.</p>}</div>:null}

  {selectedId&&<aside className="structural-inspector" aria-label="Detalhes da entidade selecionada">
   <button className="inspector-close" onClick={()=>setSelectedId(null)} aria-label="Fechar inspector">×</button>
   <span className="panel-kicker">{String(selected.type||'ENTIDADE')}</span>
   <h2>{String(selected.label||selected.id||selectedId)}</h2>
   <div className="inspector-meta"><span className="status-pill">{String(selected.status||'—')}</span>{selected.domain&&<span>{String(selected.domain)}</span>}</div>
   {selected.summary&&<p className="inspector-summary">{String(selected.summary)}</p>}
   <div className="inspector-triad">
    <article><span>O QUÊ</span><p>{String(meta.what_pt||'Ainda não indexado em linguagem humana.')}</p></article>
    <article><span>COMO</span><p>{String(meta.how_pt||'Método não publicado neste recorte.')}</p></article>
    <article><span>POR QUÊ</span><p>{String(meta.why_pt||'Racional não publicado neste recorte.')}</p></article>
   </div>
   <div className="inspector-source-summary"><b>Fonte</b><span>{sourceRefs.length?`${sourceRefs.length} referência${sourceRefs.length===1?'':'s'} publicada${sourceRefs.length===1?'':'s'}`:'Sem referência publicada'}</span></div>
  </aside>}
 </section>;
}
