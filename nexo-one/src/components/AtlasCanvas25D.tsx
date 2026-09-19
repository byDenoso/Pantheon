import type {GraphEdge} from '../contracts/system.ts';
import type {PlacedNode3D} from '../viewmodels/graph3d.ts';
import {CanvasGraph25D,type CanvasEdge25D,type CanvasNode25D} from './CanvasGraph25D.tsx';
import '../styles/atlas3d.css';

const DOMAIN_COLOR:Record<string,string>={
  NEXO:'#79f2d0',SCIENCE:'#44a8ff',ENGINEERING:'#71dfa0',OLYMPUS:'#bd8cff',ARTIFACT:'#f2b654',
};
const ALERT_COLOR='#ff6b72';
const isCluster=(node:PlacedNode3D)=>node.id.startsWith('atlas.cluster.');
const structural=(edge:GraphEdge)=>edge.id.startsWith('atlas.root.edge.')||edge.id.startsWith('atlas.cluster.edge.');

function colorFor(node:PlacedNode3D){return DOMAIN_COLOR[node.domain]??'#8fb2d0';}
function edgeColor(edge:GraphEdge){
  if(edge.kind==='CONTRADICTS'||edge.kind==='BLOCKS')return ALERT_COLOR;
  if(edge.is_learning)return edge.learning_scope==='INTER_DOMAIN'?'#f4c468':'#d99a4f';
  if(edge.kind==='SUPPORTS')return '#51d7ef';
  if(structural(edge))return '#90a9bf';
  return '#68829b';
}
function radiusFor(node:PlacedNode3D){
  if(node.type==='DOMAIN')return node.domain==='NEXO'?2.8:2.35;
  if(isCluster(node))return 1.85;
  if(node.type==='PROVIDER')return 1.28;
  if(node.type==='CAPABILITY')return 1.14;
  return .92;
}

export function AtlasCanvas25D({
  nodes,edges,selectedId,onSelect,
}:{
  nodes:PlacedNode3D[];
  edges:GraphEdge[];
  selectedId:string|null;
  onSelect:(id:string|null)=>void;
}){
  const canvasNodes:CanvasNode25D[]=nodes.map(node=>({
    id:node.id,label:node.label,x:node.x,y:node.y,z:node.z,
    radius:radiusFor(node),color:colorFor(node),
    opacity:node.state==='BLOCKED'||node.state==='CONFLICT'?.82:1,
    major:node.type==='DOMAIN'||isCluster(node)||node.id===selectedId,
  }));
  const canvasEdges:CanvasEdge25D[]=edges.map(edge=>({
    id:edge.id,from:edge.from,to:edge.to,color:edgeColor(edge),
    opacity:edge.is_learning?.58:structural(edge)?.52:.34,
    width:edge.kind==='CONTRADICTS'||edge.kind==='BLOCKS'?1.5:edge.is_learning?1.25:1,
    dashed:Boolean(edge.is_learning),
  }));

  return <div className="atlas3d-shell atlas-canvas25d-shell" data-testid="atlas-3d-shell" data-renderer="canvas-2.5d">
    <div className="atlas3d-haze" aria-hidden="true"/>
    <CanvasGraph25D nodes={canvasNodes} edges={canvasEdges} selectedId={selectedId} onSelect={onSelect} ariaLabel="Grafo 2.5D do Atlas"/>
    <div className="atlas3d-a11y-list" aria-label="Nós do grafo 2.5D">
      {nodes.map(node=><button key={node.id} type="button" onClick={()=>onSelect(node.id)}>{node.label}</button>)}
    </div>
  </div>;
}
