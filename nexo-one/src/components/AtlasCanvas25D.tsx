import type {Ref} from 'react';
import type {GraphEdge} from '../contracts/system.ts';
import type {PlacedNode3D} from '../viewmodels/graph3d.ts';
import {
  PRIMARY_GALAXY_DOMAINS,
  galaxyArmPath,
} from '../viewmodels/graph3d.ts';
import {
  CanvasGraph25D,
  type CanvasArm25D,
  type CanvasEdge25D,
  type CanvasGraph25DHandle,
  type CanvasNode25D,
} from './CanvasGraph25D.tsx';
import {domainHex} from '../viewmodels/domainPalette.ts';
import '../styles/atlas3d.css';

const GALAXY_COLOR='#79e7ff';
const GALAXY_DIM='#8fbad0';

const isCluster=(node:PlacedNode3D)=>node.id.startsWith('atlas.cluster.');
const structural=(edge:GraphEdge)=>edge.id.startsWith('atlas.root.edge.')||edge.id.startsWith('atlas.cluster.edge.');

function radiusFor(node:PlacedNode3D){
  if(node.type==='DOMAIN')return node.domain==='NEXO'?3.1:2.15;
  if(isCluster(node))return 1.72;
  if(node.type==='PROVIDER')return 1.2;
  if(node.type==='CAPABILITY')return 1.1;
  return .88;
}

function minZoomFor(node:PlacedNode3D){
  if(node.type==='DOMAIN')return 0;
  if(isCluster(node))return .58;
  if(node.type==='PROVIDER'||node.type==='CAPABILITY')return .76;
  if(node.type==='ACTION'||node.type==='EFFECT'||node.type==='PROJECTION'||node.type==='CLAIM')return .92;
  if(node.type==='TEST'||node.type==='FILAMENT')return 1.06;
  return 1.18;
}

function importanceFor(node:PlacedNode3D){
  if(node.type==='DOMAIN')return node.domain==='NEXO'?1.5:1.25;
  if(isCluster(node))return 1;
  if(node.type==='CAPABILITY')return .82;
  if(node.type==='PROVIDER')return .76;
  if(node.type==='TEST')return .66;
  if(node.type==='FILAMENT')return .62;
  return .48;
}

function visualState(node:PlacedNode3D){
  const state=String(node.state??'').toUpperCase();
  return {
    pulse:/RUNNING|EXECUTING|IN_PROGRESS|ACTIVE/.test(state),
    broken:/BLOCKED|FAILED|CONFLICT|ERROR/.test(state),
    halo:/NEEDS[_ -]?YOU|AWAITING[_ -]?HUMAN|MANUAL[_ -]?REVIEW/.test(state)?1.1:0,
    opacity:/ARCHIVED|REJECTED|STALE/.test(state)?.54:/BLOCKED|FAILED|CONFLICT|ERROR/.test(state)?.78:1,
  };
}

function edgeImportance(edge:GraphEdge){
  if(structural(edge))return 1;
  if(edge.is_learning)return .82;
  if(edge.kind==='BLOCKS'||edge.kind==='CONTRADICTS')return .78;
  if(edge.kind==='SUPPORTS')return .66;
  return .42;
}

const GALAXY_ARMS:CanvasArm25D[]=PRIMARY_GALAXY_DOMAINS.map(domain=>({
  id:`arm:${domain.toLowerCase()}`,
  points:galaxyArmPath(domain,64),
  opacity:.7,
  width:domain==='SCIENCE'?1.05:1,
}));

export function AtlasCanvas25D({
  nodes,
  edges,
  selectedId,
  onSelect,
  controllerRef,
}:{
  nodes:PlacedNode3D[];
  edges:GraphEdge[];
  selectedId:string|null;
  onSelect:(id:string|null)=>void;
  controllerRef?:Ref<CanvasGraph25DHandle>;
}){
  const theme=typeof document!=='undefined'&&document.documentElement.dataset.theme==='light'?'light':'dark';
  const canvasNodes:CanvasNode25D[]=nodes.map(node=>{
    const state=visualState(node);
    return{
      id:node.id,
      label:node.label,
      x:node.x,
      y:node.y,
      z:node.z,
      radius:radiusFor(node),
      color:domainHex(node.domain,theme),
      opacity:state.opacity,
      major:node.type==='DOMAIN'||isCluster(node)||node.id===selectedId,
      importance:importanceFor(node),
      minZoom:minZoomFor(node),
      pulse:state.pulse,
      halo:state.halo,
      broken:state.broken,
    };
  });

  const canvasEdges:CanvasEdge25D[]=edges.map(edge=>({
    id:edge.id,
    from:edge.from,
    to:edge.to,
    color:structural(edge)?GALAXY_COLOR:GALAXY_DIM,
    opacity:structural(edge)?.42:edge.is_learning?.4:.24,
    width:structural(edge)?1.3:edge.kind==='CONTRADICTS'||edge.kind==='BLOCKS'?1.25:1,
    dashed:Boolean(edge.is_learning||edge.kind==='CONTRADICTS'||edge.kind==='BLOCKS'),
    importance:edgeImportance(edge),
    minZoom:structural(edge)?0:edge.is_learning?.88:1.02,
  }));

  return <div
    className="atlas3d-shell atlas-canvas25d-shell"
    data-testid="atlas-3d-shell"
    data-renderer="canvas-2.5d"
  >
    <div className="atlas3d-haze" aria-hidden="true"/>
    <CanvasGraph25D
      ref={controllerRef}
      nodes={canvasNodes}
      edges={canvasEdges}
      arms={GALAXY_ARMS}
      selectedId={selectedId}
      onSelect={onSelect}
      ariaLabel="Galáxia 2.5D do NEXO ONE"
    />
    <div className="atlas3d-a11y-list" aria-label="Entidades da galáxia 2.5D">
      {nodes.map(node=><button key={node.id} type="button" onClick={()=>onSelect(node.id)}>{node.label}</button>)}
    </div>
  </div>;
}
