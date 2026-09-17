import {useMemo} from 'react';
import {selectSemanticLOD} from './semantic-lod';
import {shouldOpenNode} from './picking';
import {buildOrbitalNodes,type AtlasGraph,type AtlasNode,type PositionedNode} from './types';
import {CanvasGraph25D} from './CanvasGraph25D';
import {graphRenderBudget} from './neural-visuals.mjs';
import {labelText,labelType} from './LabelOverlay';
import './canvas25d.css';

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
  const sourceNodes=graph?.nodes||[];
  const renderBudget=useMemo(()=>graphRenderBudget({width:compact?420:1440,compact}),[compact]);
  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{selectedId,focusId,visibleBudget:renderBudget.visibleBudget,labelBudget:renderBudget.labelBudget}),[focusId,renderBudget,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[],'canvas'),[focusId,graph?.edges,visible]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const visibleIds=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({...(graph||{nodes:[],edges:[]}),nodes,edges:(graph?.edges||[]).filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target))}),[graph,nodes,visibleIds]);

  const resolveNode=(picked:PositionedNode)=>nodeById.get(picked.id);
  const handleSelect=(picked:PositionedNode)=>{const node=resolveNode(picked);if(node)onSelect(node)};
  const handleFocus=(picked:PositionedNode)=>{const node=resolveNode(picked);if(!node)return;if(shouldOpenNode(node,focusId,sceneGraph.edges))onOpen(node);else onSelect(node)};

  if(!graph)return <div className="atlas-canvas-loading">Lendo arquitetura…</div>;

  return <div className="atlas-r3f-stage atlas-canvas-2d-primary" data-render-active="true" data-renderer="canvas-2.5d">
    <ul className="atlas-visible-summary" aria-label="Entidades visíveis no Atlas" style={visuallyHidden}>{sceneGraph.nodes.slice(0,64).map(node=><li key={node.id}>{labelText(node as PositionedNode)} · {labelType(node as PositionedNode)}{node.id===focusId?' · foco':''}{node.id===selectedId?' · selecionado':''}</li>)}</ul>
    <CanvasGraph25D nodes={nodes} edges={sceneGraph.edges} labelIds={lod.labelIds} focusId={focusId} selectedId={selectedId} onNodeClick={handleSelect} onNodeDoubleClick={handleFocus} reducedMotion={reducedMotion} compact={compact} theme={theme}/>
    {loading&&<div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}
  </div>;
}
