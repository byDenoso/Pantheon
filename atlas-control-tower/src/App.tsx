import { useEffect, useMemo, useState } from 'react';
import { AtlasCanvas } from './scene/AtlasCanvas';
import { useAtlasSession } from './state/useAtlasSession';
import type { AtlasNode } from './scene/types';
import './styles/react-atlas.css';

const SYSTEMS=[
  ['system:NEXO','◈','Visão do sistema'],
  ['system:SCIENCE','✧','Universo científico'],
  ['system:AUTOMATION','▣','Black Box'],
  ['system:LEARNING','⌘','Learning']
] as const;

function useMedia(query:string){
  const [matches,setMatches]=useState(()=>typeof matchMedia==='function'?matchMedia(query).matches:false);
  useEffect(()=>{if(typeof matchMedia!=='function')return;const media=matchMedia(query);const update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[query]);
  return matches;
}

function displayNode(node:AtlasNode){return String(node.label||node.id)}

export default function App(){
  const {state,actions}=useAtlasSession();
  const [query,setQuery]=useState('');
  const [depth,setDepthState]=useState(1);
  const [autoOrbit,setAutoOrbit]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const compact=useMedia('(max-width: 760px)');
  const reducedMotion=useMedia('(prefers-reduced-motion: reduce)');
  const graph=state.graph;
  const total=Number(graph?.visualTotal??graph?.total??graph?.nodes?.length??0);
  const domains=useMemo(()=>graph?.nodes?.filter(node=>String(node.type||'').toUpperCase()==='DOMAIN').slice(0,12)||[],[graph]);
  const visibleNodes=graph?.nodes||[];
  const freshness=state.health?.dataSource?.freshness||'LIVE';
  const backend=state.health?.dataSource?.effective?.toUpperCase?.()||'V1';

  useEffect(()=>{
    document.body.classList.add('reference-one','atlas-react-body');
    document.body.dataset.mode='overview';
    return()=>{document.body.classList.remove('atlas-react-body')};
  },[]);

  const submitSearch=()=>actions.search(query);
  const changeDepth=(value:number)=>{setDepthState(value);actions.setDepth(value)};

  return <>
    <header className="topbar reference-topbar">
      <button id="menu" aria-label="Abrir menu" onClick={()=>setSidebarOpen(v=>!v)}>☰</button>
      <a className="brand" href="#" onClick={e=>{e.preventDefault();actions.home()}}>✧ <b>NEXO<span>ATLAS</span></b></a>
      <span className="official-badge">FRONTEND OFICIAL</span>
      <div className="searchbox"><span>⌕</span><input aria-label="Busca global" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitSearch()}} placeholder="Buscar campanha, claim, teste, sistema…"/><kbd>↵</kbd></div>
      <button className="sync" onClick={()=>void actions.sync()} disabled={state.syncing}>↻ <span>{state.syncing?'Lendo fontes…':'Sincronizar'}</span></button>
      <div id="source-status" className="source-status reference-live" aria-live="polite">● {freshness} · NEON {backend}</div>
      <button className="reference-ops" type="button" aria-label="Perfil Ops"><i>N</i><span><b>Ops</b><small>NEXO</small></span></button>
    </header>

    <aside id="sidebar" className={`reference-sidebar ${sidebarOpen?'open':''}`}>
      <p className="eyebrow">NAVEGAÇÃO</p>
      {SYSTEMS.map(([id,icon,label])=><button key={id} className={`nav ${state.focusId===id?'active':''}`} onClick={()=>{void actions.focusSystem(id,label);setSidebarOpen(false)}}>{icon} <span>{label}</span></button>)}
      <div className="reference-rule"/>
      <p className="eyebrow domains-label">DOMÍNIOS</p>
      <div id="domain-nav">{domains.map(node=><button key={node.id} className="nav domain-nav-react" onClick={()=>void actions.open(node)}>◎ <span>{displayNode(node)}</span></button>)}</div>
      <div className="sidebar-foot reference-trace"><span className="tiny-orbit">◎</span><b>Estado rastreável</b><p>Truth Owners no Neon.<br/>Atlas é projeção somente leitura.</p><span className="micro">React · R3F · WebGPU</span></div>
      <div className="reference-sidebar-signature"><b>NEXO</b><span>OBSERVAR<br/>CONECTAR<br/>DESCOBRIR</span><small>v4.0</small></div>
    </aside>

    <main className="reference-main atlas-react-main">
      <section className="universe reference-universe" id="map-workspace">
        <div className="graph-stage reference-stage atlas-react-stage">
          <div className="observatory-space reference-space" aria-hidden="true"><i className="observatory-nebula-left"/><i className="observatory-galaxy-right"/><i className="observatory-asteroid-field"/><i className="observatory-horizon-right"/></div>
          <div className="reference-hero-copy"><p className="eyebrow">ATLAS / OFICIAL</p><h1>Ideias em órbita.<br/>Descobertas em rede.</h1><span>EXPLORE · CONECTE · INVESTIGUE</span></div>
          <div className="reference-cosmos-index" aria-hidden="true"><i/><span>GALÁXIAS</span><span>DADOS</span><span>IDEIAS</span><span>PESSOAS</span><span>IMPACTO</span></div>
          <div className="reference-quote" aria-hidden="true">“OBSERVAR MAIS LONGE.<br/>CONECTAR IDEIAS.<br/>AMPLIFICAR O IMPACTO.”<small>— NEXO ATLAS</small></div>

          <AtlasCanvas graph={graph} focusId={state.focusId} selectedId={state.selectedId} onSelect={actions.select} onOpen={actions.open} reducedMotion={reducedMotion} autoOrbit={autoOrbit} compact={compact}/>

          <nav className="reference-breadcrumbs" aria-label="Navegação hierárquica">{state.path.map((item,index)=><span key={item.id}>{index>0&&<i>/</i>}<button onClick={()=>void actions.focusSystem(item.id,item.label||item.id)}>{item.label||item.id}</button></span>)}</nav>
          <div className="reference-map-tools"><select value={depth} aria-label="Camadas do subgrafo" onChange={e=>changeDepth(Number(e.target.value))}><option value={1}>1 camada</option><option value={2}>2 camadas</option><option value={3}>3 camadas</option></select><span className="micro">{state.loading?'LENDO…':`${visibleNodes.length} DE ${total||visibleNodes.length} NÓS · ${graph?.edges?.length||0} RELAÇÕES`}</span></div>
          <div className="graph-mode"><span className="dot"/><span>WEBGPU / R3F</span><button onClick={()=>setAutoOrbit(v=>!v)} aria-pressed={autoOrbit}>{autoOrbit?'Pausar órbita':'Órbita automática'}</button></div>
          <div className="graph-controls"><button onClick={()=>setAutoOrbit(v=>!v)} title="Órbita automática">{autoOrbit?'Ⅱ':'▷'}</button><button onClick={()=>void actions.back()} title="Voltar">←</button><button onClick={()=>void actions.home()} title="Sistema">⌂</button><button onClick={()=>actions.clearSelection()} title="Limpar seleção">◎</button></div>
          {state.error&&<div className="atlas-react-error">{state.error} · último recorte preservado</div>}
        </div>
        <div className="reference-visualization-bar"><div className="reference-tabs"><button className="active" type="button">◉ Órbita</button><button type="button">⌘ Rede</button><button type="button">▣ Galeria</button><button type="button">☷ Lista</button></div><div className="reference-sources"><b>FONTES</b><span><i className="line canonical"/>Fonte científica</span><span><i className="line derived"/>Relação derivada</span></div><div className="reference-map-hint">Arraste para orbitar · Scroll para zoom · botão direito para mover</div></div>
        <div className="graph-bottom reference-selection"><span>{state.selectedId?`Selecionado: ${state.selectedId}`:'Selecione um nó para ver fontes e relações.'}</span></div>
      </section>

      <section id="command-center" className="command-center observatory-deck reference-deck atlas-react-deck" aria-live="polite">
        <article><small>RUNTIME</small><b>{state.health?.ok===false?'DEGRADED':'LIVE'}</b><span>{backend} · {freshness}</span></article>
        <article><small>RECORTE</small><b>{visibleNodes.length}</b><span>{total||visibleNodes.length} entidades declaradas</span></article>
        <article><small>FOCO</small><b>{state.focusId.replace('system:','')}</b><span>{state.path.map(x=>x.label||x.id).join(' / ')}</span></article>
        <article><small>RENDER</small><b>WEBGPU</b><span>R3F · instancing · semantic LOD</span></article>
      </section>

      <section className="analytics reference-secondary atlas-react-analytics">
        <article><div className="chart-title"><span>Atividade por domínio</span><small>RECORTE ATUAL</small></div><p>{domains.length} domínios visíveis no recorte.</p></article>
        <article><div className="chart-title"><span>Estado do grafo</span><small>RELAÇÕES</small></div><p>{graph?.edges?.length||0} relações carregadas; {graph?.truncated?'recorte limitado':'recorte completo'}.</p></article>
        <article><div className="chart-title"><span>Pipeline gráfico</span><small>GPU</small></div><p>Instancing + TSL + GPU picking + HTML label overlay.</p></article>
      </section>

      <section className="entity-section reference-secondary"><div className="chart-title"><span>Radar vivo</span><small>{visibleNodes.length} NO RECORTE</small></div><div className="atlas-react-radar">{visibleNodes.slice(0,40).map(node=><button key={node.id} onClick={()=>actions.select(node)}><b>{displayNode(node)}</b><small>{String(node.type||'ENTITY')} · {String(node.status||'')}</small></button>)}</div></section>

      <footer className="reference-footer"><b>NEXO ATLAS</b><span>OBSERVATÓRIO PARA UMA CIÊNCIA MAIS CONECTADA</span><span className="official-flow">REACT · THREE.JS · R3F · WEBGPU · TSL</span></footer>
    </main>

    {state.selectedId&&<aside id="inspector" aria-label="Detalhes da entidade" className="atlas-react-inspector"><div className="inspector-top"><span className="eyebrow">INSPETOR DA ENTIDADE</span><button onClick={actions.clearSelection} aria-label="Fechar detalhes">×</button></div><div className="atlas-inspector-body"><h2>{String(state.selectedEntity?.label||state.selectedEntity?.entity?.label||state.selectedId)}</h2><p className="micro">{state.selectedId}</p><dl><dt>Tipo</dt><dd>{String(state.selectedEntity?.type||state.selectedEntity?.entity?.type||'—')}</dd><dt>Status</dt><dd>{String(state.selectedEntity?.status||state.selectedEntity?.entity?.status||'—')}</dd><dt>Autoridade</dt><dd>{String(state.selectedEntity?.authority||state.selectedEntity?.entity?.authority||'DERIVED_NOT_EVIDENCE')}</dd></dl><pre>{JSON.stringify(state.selectedEntity?.entity||state.selectedEntity||{},null,2).slice(0,5000)}</pre></div></aside>}
  </>;
}
