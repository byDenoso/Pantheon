import { useEffect, useMemo, useState } from 'react';
import { BreakthroughAtlas } from './scene/BreakthroughAtlas';
import { useAtlasSession } from './state/useAtlasSession';
import { cockpitCopy, nodeDisplayLabel } from '../ui/cockpit-copy.mjs';
import type { AtlasNode } from './scene/types';
import './styles/breakthrough-hybrid.css';

type Lens='structure'|'learning'|'evidence'|'time';

const LENSES:[Lens,string][]=[
  ['structure','Estrutura'],
  ['learning','Aprendizado'],
  ['evidence','Evidência'],
  ['time','Tempo']
];

function useMedia(query:string){
  const [matches,setMatches]=useState(()=>typeof matchMedia==='function'?matchMedia(query).matches:false);
  useEffect(()=>{
    if(typeof matchMedia!=='function')return;
    const media=matchMedia(query);
    const update=()=>setMatches(media.matches);
    update();
    media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[query]);
  return matches;
}

function displayNode(node:AtlasNode){
  return String(nodeDisplayLabel(node,32)||node.label||node.id);
}

export default function BreakthroughApp(){
  const {state,actions}=useAtlasSession();
  const [query,setQuery]=useState('');
  const [lens,setLens]=useState<Lens>('structure');
  const [autoOrbit,setAutoOrbit]=useState(false);
  const [panelOpen,setPanelOpen]=useState(false);
  const compact=useMedia('(max-width: 760px)');
  const reducedMotion=useMedia('(prefers-reduced-motion: reduce)');
  const graph=state.graph;
  const visibleNodes=graph?.nodes||[];
  const total=Number(graph?.visualTotal??graph?.total??visibleNodes.length);
  const domains=useMemo(()=>visibleNodes.filter(node=>String(node.type||'').toUpperCase()==='DOMAIN').slice(0,10),[visibleNodes]);
  const selectedRecord=(state.selectedEntity?.entity||state.selectedEntity||visibleNodes.find(n=>n.id===state.selectedId)||{}) as AtlasNode;
  const selectedCopy=cockpitCopy(selectedRecord);
  const structural=new Set(['SYSTEM','DOMAIN','CAMPAIGN']);
  const source=String(state.health?.dataSource?.effective||state.health?.contract||'projection').toUpperCase();
  const freshness=String(state.health?.dataSource?.freshness||'LIVE').toUpperCase();

  useEffect(()=>{
    document.documentElement.dataset.atlasVisual='breakthrough-hybrid';
    document.body.dataset.btStack='react-css-svg-d3-three-gsap';
    return()=>{
      delete document.documentElement.dataset.atlasVisual;
      delete document.body.dataset.btStack;
    };
  },[]);

  const submit=()=>actions.search(query);

  return <div className="bt-app" data-bt-stack="react-css-svg-d3-three-gsap" data-bt-lens={lens}>
    <header className="bt-topbar">
      <button className="bt-mark" onClick={()=>void actions.home()} aria-label="Voltar ao NEXO">
        <i>✦</i><span><b>NEXO</b><small>BREAKTHROUGH ATLAS</small></span>
      </button>
      <div className="bt-search">
        <span>⌕</span>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit()}} placeholder="Buscar campanha, memória, teste…" aria-label="Buscar no NEXO"/>
      </div>
      <div className="bt-status" aria-live="polite"><i/><span>{state.syncing?'LENDO':freshness}</span><small>{source}</small></div>
      <button className="bt-icon-button" onClick={()=>void actions.sync()} disabled={state.syncing} aria-label="Atualizar estado">↻</button>
      <button className="bt-icon-button bt-mobile-menu" onClick={()=>setPanelOpen(v=>!v)} aria-label="Abrir navegação">☰</button>
    </header>

    <aside className={`bt-rail ${panelOpen?'open':''}`} aria-label="Navegação do Atlas">
      <div className="bt-rail-heading"><span>CAMPO</span><b>{state.focusId.replace('system:','')}</b></div>
      <button className="bt-rail-home" onClick={()=>{void actions.home();setPanelOpen(false)}}>◎ NEXO</button>
      <div className="bt-domain-list">
        {domains.map(node=><button key={node.id} onClick={()=>{void actions.open(node);setPanelOpen(false)}}>
          <span className="bt-domain-seal">◌</span><span><b>{displayNode(node)}</b><small>{String(node.status||'DOMAIN')}</small></span>
        </button>)}
      </div>
      <div className="bt-rail-footer"><span>PROJEÇÃO RASTREÁVEL</span><small>React · SVG/D3 · Three/WebGPU · GSAP</small></div>
    </aside>

    <main className="bt-main">
      <section className="bt-stage-shell">
        <div className="bt-title-card" aria-hidden="true"><span>OBSERVATÓRIO COGNITIVO</span><h1>Mapeie relações.<br/>Encontre o inesperado.</h1><small>NEXO / LIVING KNOWLEDGE FIELD</small></div>

        <BreakthroughAtlas graph={graph} focusId={state.focusId} selectedId={state.selectedId} onSelect={actions.select} onOpen={actions.open} reducedMotion={reducedMotion} autoOrbit={autoOrbit} compact={compact} lens={lens}/>

        <nav className="bt-breadcrumbs" aria-label="Caminho atual">
          {state.path.map((item,index)=><span key={item.id}>{index>0&&<i>/</i>}<button onClick={()=>void actions.focusSystem(item.id,item.label||item.id)}>{item.label||item.id}</button></span>)}
        </nav>

        <div className="bt-scene-controls"><button onClick={()=>void actions.back()} aria-label="Voltar">←</button><button onClick={()=>void actions.home()} aria-label="NEXO">⌂</button><button onClick={()=>setAutoOrbit(v=>!v)} aria-pressed={autoOrbit}>{autoOrbit?'PAUSAR':'PULSO'}</button></div>

        <div className="bt-lens-bar" aria-label="Lentes do Atlas">
          {LENSES.map(([key,label])=><button key={key} className={lens===key?'active':''} onClick={()=>setLens(key)} aria-pressed={lens===key}>{label}</button>)}
        </div>

        <div className="bt-readout"><b>{state.loading?'LENDO…':`${visibleNodes.length}/${total}`}</b><span>NÓS VISÍVEIS</span><i/><b>{graph?.edges?.length||0}</b><span>RELAÇÕES</span></div>
        {state.error&&<div className="bt-error">RECORTE PRESERVADO · {state.error}</div>}
      </section>
    </main>

    {state.selectedId&&<aside className="bt-inspector" aria-label="Detalhes da entidade">
      <div className="bt-inspector-kicker"><span>ENTIDADE SELECIONADA</span><button onClick={actions.clearSelection} aria-label="Fechar">×</button></div>
      <h2>{displayNode(selectedRecord.id?selectedRecord:{id:state.selectedId,label:state.selectedId})}</h2>
      <p className="bt-id">{state.selectedId}</p>
      <div className="bt-inspector-triad"><article><small>O QUÊ</small><p>{selectedCopy.what}</p></article><article><small>COMO</small><p>{selectedCopy.how}</p></article><article><small>POR QUÊ</small><p>{selectedCopy.why}</p></article></div>
      <div className="bt-inspector-meta"><span><small>TIPO</small><b>{String(selectedRecord.type||'—')}</b></span><span><small>STATUS</small><b>{String(selectedRecord.status||'—')}</b></span></div>
      {structural.has(String(selectedRecord.type||'').toUpperCase())&&<button className="bt-open-entity" onClick={()=>void actions.open(selectedRecord)}>ABRIR SUBGRAFO ↗</button>}
    </aside>}
  </div>;
}
