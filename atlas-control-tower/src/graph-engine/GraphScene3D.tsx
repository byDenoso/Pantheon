import {useEffect,useMemo,useState} from 'react';
import '../styles/react-atlas.css';
import '../design/graph-3d.css';
import {AtlasCanvas} from '../scene/AtlasCanvas';
import type {AtlasGraph,AtlasNode} from '../scene/types';
import type {GraphEdge,GraphProjection} from './types';

export type GraphSurfaceProps={projection:GraphProjection;learningEdges?:GraphEdge[];learning:boolean;selectedId?:string|null;selectedEdgeId?:string|null;onSelect:(id:string|null)=>void;onSelectEdge?:(id:string|null)=>void;onToggleLearning?:(value:boolean)=>void};
type Props=GraphSurfaceProps&{onRollback?:()=>void};
const displayValue=(v:unknown)=>v===null||v===undefined||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v);

export function GraphScene3D({projection,learningEdges=[],learning,selectedId=null,selectedEdgeId=null,onSelect,onSelectEdge,onToggleLearning,onRollback}:Props){
  const [autoOrbit,setAutoOrbit]=useState(false);const [reducedMotion,setReducedMotion]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener?.('change',sync);return()=>media.removeEventListener?.('change',sync)},[]);
  const graph=useMemo<AtlasGraph>(()=>({
    nodes:projection.nodes.map(node=>({...node,priority:node.id===projection.focusId?99:node.type==='DOMAIN'?85:node.type==='SUBGRAPH'?72:undefined})),
    edges:[...projection.edges,...(learning?learningEdges.map(edge=>({...edge,type:`LEARNING_${edge.type}`})):[])]
  }),[learning,learningEdges,projection]);
  const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
  const selectedEdge=useMemo(()=>[...projection.edges,...learningEdges].find(edge=>edge.id===selectedEdgeId)||null,[learningEdges,projection.edges,selectedEdgeId]);
  const handleNode=(node:AtlasNode)=>onSelect(String(node.id));
  return <section className="graph-3d-shell">
    <div className="graph-3d-toolbar">
      <div className="graph-3d-status"><i/><strong>{projection.nodes.length} nós</strong><span>{projection.edges.length} relações · 3D orbital</span></div>
      <div className="graph-3d-controls">
        <button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button>
        <button className={learning?'active':''} onClick={()=>onToggleLearning?.(!learning)}>Learning</button>
        <button className={autoOrbit?'active':''} disabled={reducedMotion} onClick={()=>setAutoOrbit(value=>!value)}>Órbita</button>
        {onRollback?<button onClick={onRollback}>2D</button>:null}
      </div>
    </div>
    <div className="graph-3d-canvas-frame"><AtlasCanvas graph={graph} focusId={projection.focusId||projection.nodes[0]?.id||''} selectedId={selectedId} onSelect={handleNode} onOpen={handleNode} reducedMotion={reducedMotion} autoOrbit={autoOrbit}/></div>
    <aside className={`graph-3d-inspector ${selected||selectedEdge?'is-open':''}`}>
      {selected?<><span className="panel-kicker">{selected.type}</span><h3>{selected.label}</h3><p>{selected.summary||'Sem descrição publicada.'}</p><dl><div><dt>Status</dt><dd>{displayValue(selected.status)}</dd></div>{Object.entries(selected.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></>:selectedEdge?<><span className="panel-kicker">RELAÇÃO</span><h3>{selectedEdge.type}</h3><p>{selectedEdge.source} → {selectedEdge.target}</p><button onClick={()=>onSelectEdge?.(null)}>Limpar seleção</button></>:<><span className="panel-kicker">NAVEGAÇÃO</span><h3>Mapa orbital</h3><p>Arraste para orbitar, use a roda para aproximar e clique nos nós para inspecionar.</p></>}
    </aside>
    <div className="graph-3d-a11y">{projection.nodes.slice(0,180).map(node=><button key={node.id} onClick={()=>onSelect(node.id)}>{node.label}</button>)}</div>
  </section>;
}
