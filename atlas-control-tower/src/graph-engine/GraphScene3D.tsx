import {useEffect,useMemo,useState} from 'react';
import '../styles/react-atlas.css';
import '../design/graph-3d.css';
import '../design/graph-25d-v2.css';
import {AtlasCanvas} from '../scene/AtlasCanvas';
import {GraphMinimap} from '../components/GraphMinimap';
import type {AtlasGraph} from '../scene/types';
import type {GraphSurfaceProps} from './types';

type Props=GraphSurfaceProps&{onRollback?:()=>void};
const asText=(value:unknown,fallback='SNAPSHOT')=>String(value||fallback).replace(/_/g,' ');

/**
 * Dormant 3D compatibility scene. The production graph gateway now uses the
 * Canvas 2.5D renderer exclusively; this module remains isolated so older scene
 * primitives/tests can be removed in a later dependency cleanup without coupling
 * the active renderer back to WebGL.
 */
export function GraphScene3D({projection,learningEdges=[],learning,selectedId=null,onSelect,onOpenNode,onRollback}:Props){
  const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync)},[]);
  const graph=useMemo<AtlasGraph>(()=>({
    nodes:projection.nodes.map(node=>({...node,domain:node.domain??undefined,parentId:node.parentId??undefined,summary:node.summary??undefined,status:node.status??undefined,priority:node.id===projection.focusId?99:String(node.type||'').toUpperCase()==='SYSTEM'?92:node.type==='DOMAIN'?86:node.type==='SUBGRAPH'?76:undefined})),
    edges:[...projection.edges,...(learning?learningEdges.map(edge=>({...edge,type:`LEARNING_${edge.type}`})):[])]
  }),[learning,learningEdges,projection]);
  const focus=useMemo(()=>projection.nodes.find(node=>node.id===projection.focusId)||projection.nodes[0]||null,[projection.focusId,projection.nodes]);
  const sourceHint=asText((projection as unknown as Record<string,unknown>).freshness||(projection as unknown as Record<string,unknown>).sourceState||projection.level,'snapshot');
  const handleNode=(node:{id:string})=>onSelect(String(node.id));
  const handleOpenNode=(node:{id:string})=>{const id=String(node.id);if(onOpenNode)onOpenNode(id);else onSelect(id)};
  return <section className={`graph-3d-shell ${learning?'is-learning':''}`} data-graph-mode={learning?'learning-overlay':'structure'} data-motion={reducedMotion?'reduced':'manual'}>
    <div className="graph-3d-ambient-grid" aria-hidden="true"/>
    <div className="graph-3d-toolbar graph-3d-hud">
      <div className="graph-3d-status graph-3d-focus-card"><i/><span className="graph-3d-eyebrow">Foco atual</span><strong>{focus?.label||'Atlas'}</strong><span>{projection.nodes.length} nós · {projection.edges.length+(learning?learningEdges.length:0)} relações · {sourceHint}</span></div>
    </div>
    <div className="graph-3d-canvas-frame"><AtlasCanvas graph={graph} focusId={projection.focusId||projection.nodes[0]?.id||''} selectedId={selectedId} onSelect={handleNode} onOpen={handleOpenNode} reducedMotion={reducedMotion}/></div>
    <div className="graph-3d-nav-hint">arraste para orbitar · scroll aproxima · setas orbitam · +/- aproxima · clique entra no subgrafo</div>
    <GraphMinimap nodes={projection.nodes} focusId={projection.focusId} selectedId={selectedId} onSelect={id=>onSelect(id)}/>
    {onRollback&&<button className="graph-renderer-switch" onClick={onRollback}>2D</button>}
  </section>;
}
