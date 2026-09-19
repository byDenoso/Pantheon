import {useEffect,useMemo,useState} from 'react';
import {routeFor} from '../atlas-route';
import {SpatialGraph3D} from '../scene/SpatialGraph3D';
import type {AtlasNode} from '../scene/types';
import type {AtlasActions,AtlasUiState} from '../state/useAtlasSession';
import './home.css';

type Props={
  state:AtlasUiState;
  actions:AtlasActions;
  navigate:(href:string)=>void;
};

function useCompact(){
  const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 760px)');
    const sync=()=>setCompact(media.matches);
    sync();
    media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  },[]);
  return compact;
}

function countByType(nodes:AtlasNode[]){
  const counts=new Map<string,number>();
  for(const node of nodes){
    const type=String(node.type||'ENTITY').toUpperCase();
    counts.set(type,(counts.get(type)||0)+1);
  }
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
}

function displayLabel(node?:AtlasNode|null){
  return String(node?.label||node?.id||'Entidade');
}

export function HomePage({state,actions,navigate}:Props){
  const compact=useCompact();
  const graph=state.graph;
  const nodes=graph?.nodes||[];
  const edges=graph?.edges||[];
  const reducedMotion=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selected=useMemo(()=>nodes.find(node=>node.id===state.selectedId)||null,[nodes,state.selectedId]);
  const domains=useMemo(()=>nodes.filter(node=>['DOMAIN','SYSTEM'].includes(String(node.type||'').toUpperCase())&&node.id!=='system:NEXO').slice(0,6),[nodes]);
  const types=useMemo(()=>countByType(nodes),[nodes]);
  const freshness=String(state.health?.dataSource?.freshness||'SNAPSHOT').toUpperCase();

  const go=(href:string)=>navigate(href);
  const openNode=(node:AtlasNode)=>{
    void actions.open(node);
    go(routeFor('graphs'));
  };

  return <div className="nexo-home">
    <header className="nexo-home-nav">
      <a href="/" className="nexo-home-brand" onClick={event=>{event.preventDefault();go('/')}}>
        <span className="nexo-home-mark">N</span><span>NEXO</span>
      </a>
      <nav aria-label="Navegação principal">
        <a href={routeFor('graphs')} onClick={event=>{event.preventDefault();go(routeFor('graphs'))}}>Mapa</a>
        <a href={routeFor('observatory')} onClick={event=>{event.preventDefault();go(routeFor('observatory'))}}>Pesquisa</a>
        <a href={routeFor('cockpit')} onClick={event=>{event.preventDefault();go(routeFor('cockpit'))}}>Cockpit</a>
      </nav>
      <div className="nexo-home-live"><i className={freshness==='LIVE'?'is-live':''}/><span>{freshness}</span></div>
    </header>

    <main>
      <section className="nexo-home-hero">
        <div className="nexo-home-hero-copy">
          <span className="nexo-home-kicker">TOWER_V06 · MODEL CONTEXT PROTOCOL</span>
          <h1>Seu MCP,<br/>visível.</h1>
          <p>Uma interface espacial para navegar a estrutura real do NEXO. Domínios, hipóteses, testes, evidências, runtimes e relações aparecem a partir da projeção atual do TOWER, sem criar uma segunda fonte de verdade.</p>
          <div className="nexo-home-actions">
            <button onClick={()=>go(routeFor('graphs'))}>Explorar em 3D</button>
            <button className="secondary" onClick={()=>go(routeFor('observatory'))}>Abrir pesquisa</button>
          </div>
          <dl className="nexo-home-metrics">
            <div><dt>{nodes.length}</dt><dd>entidades</dd></div>
            <div><dt>{edges.length}</dt><dd>relações</dd></div>
            <div><dt>{domains.length}</dt><dd>hubs visíveis</dd></div>
          </dl>
        </div>

        <div className="nexo-home-hero-graph">
          <SpatialGraph3D
            graph={graph}
            focusId={state.focusId||nodes[0]?.id||'system:NEXO'}
            selectedId={state.selectedId}
            onSelect={actions.select}
            onOpen={openNode}
            reducedMotion={reducedMotion}
            compact={compact}
            hero
          />
          <div className="nexo-home-graph-meta">
            <span>LIVE PROJECTION</span>
            <b>{state.focusId||'system:NEXO'}</b>
          </div>
          {selected&&<aside className="nexo-home-selection">
            <span>{String(selected.type||'ENTITY')}</span>
            <strong>{displayLabel(selected)}</strong>
            <p>{String(selected.summary||selected.status||'Entidade publicada na projeção atual.')}</p>
            <button onClick={()=>openNode(selected)}>Abrir contexto →</button>
          </aside>}
        </div>
      </section>

      <section className="nexo-home-band">
        <p>Arquitetura viva. Navegação espacial. Autoridade canônica preservada.</p>
      </section>

      <section className="nexo-home-section">
        <div className="nexo-home-section-head">
          <span>ESTRUTURA ATUAL</span>
          <h2>O MCP vira uma superfície navegável.</h2>
          <p>O site não mantém um catálogo paralelo. Ele lê a projeção existente e reorganiza a interface a partir dos nós e relações publicados.</p>
        </div>
        <div className="nexo-home-type-grid">
          {types.map(([type,count])=><article key={type}>
            <span>{type.replaceAll('_',' ')}</span>
            <strong>{count}</strong>
            <div className="nexo-home-rule"/>
          </article>)}
        </div>
      </section>

      <section className="nexo-home-section nexo-home-domains">
        <div className="nexo-home-section-head compact">
          <span>HUBS</span>
          <h2>Entre pelo domínio. Siga as relações.</h2>
        </div>
        <div className="nexo-home-domain-grid">
          {domains.map((node,index)=><button key={node.id} onClick={()=>openNode(node)}>
            <span>{String(index+1).padStart(2,'0')}</span>
            <strong>{displayLabel(node)}</strong>
            <p>{String(node.summary||node.domain||node.status||'Estrutura publicada pelo MCP.')}</p>
            <i>↗</i>
          </button>)}
          {!domains.length&&!state.loading&&<div className="nexo-home-empty">Nenhum hub publicado neste recorte.</div>}
        </div>
      </section>

      <section className="nexo-home-statement">
        <span>NEXO ATLAS</span>
        <h2>Da estrutura operacional<br/>para um mapa de conhecimento.</h2>
        <button onClick={()=>go(routeFor('graphs'))}>Abrir o universo 3D</button>
      </section>
    </main>

    <footer className="nexo-home-footer">
      <div><b>NEXO</b><span>Atlas</span></div>
      <p>TOWER_V06 permanece a autoridade. Atlas é projeção e superfície de interação.</p>
      <span>{freshness}</span>
    </footer>
  </div>;
}
