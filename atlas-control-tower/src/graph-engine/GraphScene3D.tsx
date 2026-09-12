import {useEffect,useMemo,useState} from 'react';
import '../styles/react-atlas.css';
import '../design/graph-3d.css';
import '../design/graph-25d-v2.css';
import {AtlasCanvas} from '../scene/AtlasCanvas';
import {GraphControlDock} from '../components/GraphControlDock';
import {GraphInspector} from '../components/GraphInspector';
import {GraphMinimap} from '../components/GraphMinimap';
import type {AtlasGraph,AtlasNode} from '../scene/types';
import type {GraphEdge,GraphProjection} from './types';

export type GraphSurfaceProps={projection:GraphProjection;learningEdges?:GraphEdge[];learning:boolean;selectedId?:string|null;selectedEdgeId?:string|null;onSelect:(id:string|null)=>void;onOpenNode?:(id:string)=>void;onSelectEdge?:(id:string|null)=>void;onToggleLearning?:(value:boolean)=>void};
type Props=GraphSurfaceProps&{onRollback?:()=>void};
const asText=(value:unknown,fallback='SNAPSHOT')=>String(value||fallback).replace(/_/g,' ');

export function GraphScene3D({projection,learningEdges=[],learning,selectedId=null,selectedEdgeId=null,onSelect,onOpenNode,onSelectEdge,onToggleLearning,onRollback}:Props){
  const [autoOrbit,setAutoOrbit]=useState(true);const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync)},[]);
  const graph=useMemo<AtlasGraph>(()=>({
    nodes:projection.nodes.map(node=>({...node,priority:node.id===projection.focusId?99:String(node.type||'').toUpperCase()==='SYSTEM'?92:node.type==='DOMAIN'?86:node.type==='SUBGRAPH'?76:undefined})),
    edges:[...projection.edges,...(learning?learningEdges.map(edge=>({...edge,type:`LEARNING_${edge.type}`})):[])]
  }),[learning,learningEdges,projection]);
  const focus=useMemo(()=>projection.nodes.find(node=>node.id===projection.focusId)||projection.nodes[0]||null,[projection.focusId,projection.nodes]);
  const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
  const selectedEdge=useMemo(()=>[...projection.edges,...learningEdges].find(edge=>edge.id===selectedEdgeId)||null,[learningEdges,projection.edges,selectedEdgeId]);
  const inspectorOpen=Boolean(selected||selectedEdge?true:false);
  const sourceHint=asText((projection as unknown as Record<string,unknown>).freshness||(projection as unknown as Record<string,unknown>).sourceState||projection.level,'snapshot');
  const selectedNavigable=Boolean(selected&&selected.id!==projection.focusId&&(graph.edges.some(edge=>edge.source===selected.id||edge.target===selected.id)||['ROOT','SYSTEM','DOMAIN','SUBGRAPH','CAMPAIGN'].includes(String(selected.type||'').toUpperCase())));
  const handleNode=(node:AtlasNode)=>onSelect(String(node.id));
  const handleOpenNode=(node:AtlasNode)=>{const id=String(node.id);if(onOpenNode)onOpenNode(id);else onSelect(id)};
  const clearInspector=()=>{if(selectedEdge)onSelectEdge?.(null);if(selected)onSelect(null)};
  const openSelected=()=>{if(selected)handleOpenNode(selected as AtlasNode)};
  return <section className={`graph-3d-shell ${learning?'is-learning':''}`} data-graph-mode={learning?'learning-overlay':'structure'} data-motion={reducedMotion?'reduced':'auto-orbit'}>
    <div className="graph-3d-ambient-grid" aria-hidden="true"/>
    <div className="graph-3d-toolbar graph-3d-hud">
      <div className="graph-3d-status graph-3d-focus-card"><i/><span className="graph-3d-eyebrow">Foco atual</span><strong>{focus?.label||'Atlas'}</strong><span>{projection.nodes.length} nós · {projection.edges.length+(learning?learningEdges.length:0)} relações · {sourceHint}</span></div>
      <div className="graph-3d-controls" aria-label="Camadas do grafo">
        <button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button>
        <button className={learning?'active':''} onClick={()=>onToggleLearning?.(true)}>Learning</button>
        <button className="graph-motion-a11y" aria-pressed={autoOrbit} disabled={reducedMotion} onClick={()=>setAutoOrbit(value=>!value)}>{autoOrbit?'Pausar movimento':'Mover grafo'}</button>
      </div>
    </div>
    <div className="graph-3d-stage-caption"><strong>Canvas 2,5D</strong><span>Movimentação 3D</span></div>
    <div className="graph-3d-canvas-frame"><AtlasCanvas graph={graph} focusId={projection.focusId||projection.nodes[0]?.id||''} selectedId={selectedId} onSelect={handleNode} onOpen={handleOpenNode} reducedMotion={reducedMotion} autoOrbit={autoOrbit}/></div>
    <div className="graph-3d-nav-hint">mova o mouse para parallax · arraste para orbitar · scroll aproxima · clique entra no subgrafo</div>
    <GraphControlDock autoOrbit={autoOrbit} reducedMotion={reducedMotion} learning={learning} onToggleOrbit={setAutoOrbit} onToggleLearning={value=>onToggleLearning?.(value)} onRollback={onRollback}/>
    <GraphMinimap nodes={projection.nodes} focusId={projection.focusId} selectedId={selectedId} onSelect={id=>onSelect(id)}/>
    {inspectorOpen?<GraphInspector node={selected} edge={selectedEdge} navigable={selectedNavigable} onClose={clearInspector} onOpenSubgraph={openSelected}/>:null}
    <div className="graph-3d-a11y">{projection.nodes.slice(0,180).map(node=><button key={node.id} onClick={()=>onSelect(node.id)}>{node.label}</button>)}</div>
  </section>;
}
