import { useMemo } from 'react';
import { createAtlasRenderer } from './createRenderer';
import { selectSemanticLOD } from './semantic-lod';
import { shouldOpenNode } from './picking';
import { buildOrbitalNodes, type AtlasGraph, type AtlasNode, type PositionedNode } from './types';
import { CanvasGraphFallback } from './CanvasGraphFallback';
import { graphRenderBudget } from './neural-visuals.mjs';
import { labelText, labelType } from './LabelOverlay';

type Props={
  graph:AtlasGraph|null;
  focusId:string;
  selectedId?:string|null;
  onSelect:(node:AtlasNode)=>void;
  onOpen:(node:AtlasNode)=>void;
  reducedMotion:boolean;
  compact?:boolean;
  loading?:boolean;
  theme?:'dark'|'light';
  presentationMode?:'spatial'|'canvas';
};

const visuallyHidden={position:'absolute',width:'1px',height:'1px',padding:0,margin:'-1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0} as const;

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,compact=false,loading=false,theme='dark'}:Props){
  const renderer=useMemo(()=>createAtlasRenderer(),[]);
  const sourceNodes=graph?.nodes||[];
  const renderBudget=useMemo(()=>graphRenderBudget({width:compact?420:1440,compact}),[compact]);
  const lod=useMemo(()=>selectSemanticLOD({
    nodes:sourceNodes,
    selectedId,focusId,
    visibleBudget:renderBudget.visibleBudget,
    labelBudget:renderBudget.labelBudget
  }),[focusId,renderBudget,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[],'canvas'),[focusId,graph?.edges,visible]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const visibleIds=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({
    ...(graph||{nodes:[],edges:[]}),nodes,
    edges:(graph?.edges||[]).filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target))
  }),[graph,nodes,visibleIds]);

  const handlePick=(picked:PositionedNode)=>{
    const node=nodeById.get(picked.id);if(!node)return;
    if(shouldOpenNode(node,focusId,sceneGraph.edges))onOpen(node);
    else onSelect(node);
  };

  if(!graph)return <div className="atlas-canvas-loading">Lendo recorte orbital…</div>;

  renderer.setMode?.('canvas');
  return <div className="atlas-r3f-stage atlas-canvas-2d-primary" data-render-active="true" data-renderer="canvas-2d">
    <ul className="atlas-visible-summary" aria-label="Entidades visíveis no Atlas" style={visuallyHidden}>{sceneGraph.nodes.slice(0,64).map(node=><li key={node.id}>{labelText(node as PositionedNode)} · {labelType(node as PositionedNode)}{node.id===focusId?' · foco':''}{node.id===selectedId?' · selecionado':''}</li>)}</ul>
    <CanvasGraphFallback nodes={nodes} edges={sceneGraph.edges} labelIds={lod.labelIds} focusId={focusId} selectedId={selectedId} onNodeClick={handlePick} reducedMotion={reducedMotion} compact={compact} theme={theme}/>
    {loading&&<div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}
  </div>;
}
