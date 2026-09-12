import {useEffect,useMemo,useState} from 'react';
import '../styles/react-atlas.css';
import '../design/graph-3d.css';
import {AtlasCanvas} from '../scene/AtlasCanvas';
import type {AtlasGraph,AtlasNode} from '../scene/types';
import type {GraphEdge,GraphProjection} from './types';

export type GraphSurfaceProps={projection:GraphProjection;learningEdges?:GraphEdge[];learning:boolean;selectedId?:string|null;selectedEdgeId?:string|null;onSelect:(id:string|null)=>void;onSelectEdge?:(id:string|null)=>void;onToggleLearning?:(value:boolean)=>void};
type Props=GraphSurfaceProps&{onRollback?:()=>void};
const displayValue=(v:unknown)=>v===null||v===undefined||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);
const asText=(value:unknown,fallback='SNAPSHOT')=>String(value||fallback).replace(/_/g,' ');
const edgeMeta=(edge:GraphEdge|null)=>edge as (GraphEdge&Record<string,unknown>)|null;

export function GraphScene3D({projection,learningEdges=[],learning,selectedId=null,selectedEdgeId=null,onSelect,onSelectEdge,onToggleLearning,onRollback}:Props){
  const [autoOrbit,setAutoOrbit]=useState(false);const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync)},[]);
  const graph=useMemo<AtlasGraph>(()=>({
    nodes:projection.nodes.map(node=>({...node,priority:node.id===projection.focusId?99:String(node.type||'').toUpperCase()==='SYSTEM'?92:node.type==='DOMAIN'?86:node.type==='SUBGRAPH'?76:undefined})),
    edges:[...projection.edges,...(learning?learningEdges.map(edge=>({...edge,type:`LEARNING_${edge.type}`})):[])]
  }),[learning,learningEdges,projection]);
  const focus=useMemo(()=>projection.nodes.find(node=>node.id===projection.focusId)||projection.nodes[0]||null,[projection.focusId,projection.nodes]);
  const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
  const selectedEdge=useMemo(()=>[...projection.edges,...learningEdges].find(edge=>edge.id===selectedEdgeId)||null,[learningEdges,projection.edges,selectedEdgeId]);
  const selectedEdgeMeta=edgeMeta(selectedEdge);
  const sourceHint=asText((projection as Record<string,unknown>).freshness||(projection as Record<string,unknown>).sourceState||(projection as Record<string,unknown>).level,'snapshot');
  const handleNode=(node:AtlasNode)=>onSelect(String(node.id));
  const clearInspector=()=>{if(selectedEdge)onSelectEdge?.(null);if(selected)onSelect(null)};
  return <section className={`graph-3d-shell ${learning?'is-learning':''}`} data-graph-mode={learning?'learning-overlay':'structure'}>
    <div className="graph-3d-ambient-grid" aria-hidden="true"/>
    <div className="graph-3d-toolbar graph-3d-hud">
      <div className="graph-3d-status graph-3d-focus-card"><i/><span className="graph-3d-eyebrow">Foco orbital</span><strong>{focus?.label||'Atlas'}</strong><span>{projection.nodes.length} nós · {projection.edges.length+(learning?learningEdges.length:0)} relações · {sourceHint}</span></div>
      <div className="graph-3d-controls" aria-label="Controles do grafo">
        <button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button>
        <button className={learning?'active':''} onClick={()=>onToggleLearning?.(!learning)}>Learning</button>
        <button className={autoOrbit?'active':''} disabled={reducedMotion} onClick={()=>setAutoOrbit(value=>!value)}>Órbita</button>
        {onRollback?<button onClick={onRollback}>2D</button>:null}
      </div>
    </div>
    <div className="graph-3d-canvas-frame"><AtlasCanvas graph={graph} focusId={projection.focusId||projection.nodes[0]?.id||''} selectedId={selectedId} onSelect={handleNode} onOpen={handleNode} reducedMotion={reducedMotion} autoOrbit={autoOrbit}/></div>
    <div className="graph-3d-nav-hint">mova o mouse para parallax · scroll aproxima · clique abre subgrafo</div>
    <aside className={`graph-3d-inspector ${(selected||selectedEdge)?'is-open':''}`} aria-hidden={!(selected||selectedEdge)}>
      {selected||selectedEdge?<button className="graph-3d-inspector-close" onClick={clearInspector} aria-label="Fechar detalhes">×</button>:null}
      {selected?<><span className="panel-kicker">{selected.type}</span><h3>{selected.label}</h3><p>{selected.summary||'Sem descrição publicada.'}</p><dl><div><dt>Status</dt><dd>{displayValue(selected.status)}</dd></div>{Object.entries(selected.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></>:selectedEdge?<><span className="panel-kicker">RELAÇÃO</span><h3>{selectedEdge.type}</h3><p>{selectedEdge.source} → {selectedEdge.target}</p><dl><div><dt>força</dt><dd>{displayValue(selectedEdgeMeta?.strength)}</dd></div><div><dt>status</dt><dd>{displayValue(selectedEdgeMeta?.status)}</dd></div></dl></>:null}
    </aside>
    <div className="graph-3d-a11y">{projection.nodes.slice(0,180).map(node=><button key={node.id} onClick={()=>onSelect(node.id)}>{node.label}</button>)}</div>
  </section>;
}
