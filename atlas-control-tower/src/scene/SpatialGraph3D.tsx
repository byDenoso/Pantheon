import {useMemo} from 'react';
import {Canvas} from '@react-three/fiber';
import {Html,Stars} from '@react-three/drei';
import type {AtlasGraph,AtlasNode,PositionedNode} from './types';
import {buildOrbitalNodes} from './types';
import {selectSemanticLOD} from './semantic-lod';
import {graphRenderBudget} from './neural-visuals.mjs';
import {InstancedNodes} from './InstancedNodes';
import {InstancedFilaments} from './InstancedFilaments';
import {CameraController} from './CameraController';
import {shouldOpenNode} from './picking';
import {supportsWebGL2} from '../graph-engine/webgl-support';

type Props={
  graph:AtlasGraph|null;
  focusId:string;
  selectedId?:string|null;
  onSelect:(node:AtlasNode)=>void;
  onOpen:(node:AtlasNode)=>void;
  reducedMotion:boolean;
  compact?:boolean;
  hero?:boolean;
  className?:string;
};

function nodeRadius(node:PositionedNode,selectedId?:string|null,focusId?:string|null){
  if(node.id===focusId)return .7;
  if(node.id===selectedId)return .38;
  const type=String(node.type||'').toUpperCase();
  if(type==='SYSTEM')return .31;
  if(type==='DOMAIN')return .24;
  if(type==='CAMPAIGN')return .19;
  return .13;
}

function labelPriority(node:PositionedNode,focusId:string,selectedId?:string|null){
  if(node.id===focusId)return 10000;
  if(node.id===selectedId)return 9000;
  const type=String(node.type||'').toUpperCase();
  if(type==='SYSTEM')return 7000;
  if(type==='DOMAIN')return 6500;
  if(type==='CAMPAIGN')return 4000;
  return Number(node.priority||0);
}

function GraphLabels({nodes,focusId,selectedId,compact}:{nodes:PositionedNode[];focusId:string;selectedId?:string|null;compact:boolean}){
  const labels=useMemo(()=>{
    const ordered=[...nodes].sort((a,b)=>labelPriority(b,focusId,selectedId)-labelPriority(a,focusId,selectedId));
    const budget=compact?5:14;
    return ordered.filter(node=>{
      if(node.id===focusId||node.id===selectedId)return true;
      const type=String(node.type||'').toUpperCase();
      return compact?type==='SYSTEM'||type==='DOMAIN':true;
    }).slice(0,budget);
  },[compact,focusId,nodes,selectedId]);

  return <>{labels.map(node=>{
    const [x,y,z]=node.position;
    const radius=nodeRadius(node,selectedId,focusId);
    return <Html key={node.id} position={[x,y+radius*1.7,z]} center distanceFactor={compact?18:15} zIndexRange={[20,0]} style={{pointerEvents:'none'}}>
      <div className={`atlas3d-label ${node.id===focusId?'is-focus':''} ${node.id===selectedId?'is-selected':''}`}>
        <strong>{String(node.label||node.id)}</strong>
        {!compact&&<span>{String(node.type||'ENTITY').replaceAll('_',' ')}</span>}
      </div>
    </Html>;
  })}</>;
}

export function SpatialGraph3D({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,compact=false,hero=false,className=''}:Props){
  const webgl=useMemo(()=>typeof document==='undefined'?true:supportsWebGL2(),[]);
  const sourceNodes=graph?.nodes||[];
  const renderBudget=useMemo(()=>graphRenderBudget({width:compact?420:1440,compact}),[compact]);
  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{
    selectedId,focusId,
    visibleBudget:compact?Math.min(renderBudget.visibleBudget,72):Math.min(renderBudget.visibleBudget,180),
    labelBudget:compact?6:Math.min(renderBudget.labelBudget,18)
  }),[focusId,renderBudget,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[],'spatial'),[focusId,graph?.edges,visible]);
  const ids=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const edges=useMemo(()=>(graph?.edges||[]).filter(edge=>ids.has(edge.source)&&ids.has(edge.target)),[graph?.edges,ids]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({...graph||{nodes:[],edges:[]},nodes,edges}),[edges,graph,nodes]);

  const pick=(node:PositionedNode)=>{
    if(shouldOpenNode(node,focusId,sceneGraph.edges))onOpen(node);
    else onSelect(node);
  };

  if(!graph)return <div className={`atlas3d-state ${className}`}>Lendo estrutura do MCP…</div>;
  if(!webgl)return <div className={`atlas3d-state ${className}`}><strong>WebGL2 indisponível</strong><span>A estrutura continua acessível pela visualização 2D.</span></div>;

  return <div className={`atlas3d-stage ${hero?'atlas3d-stage--hero':''} ${className}`} data-renderer="r3f-webgl-3d">
    <Canvas
      dpr={[1,Math.min(globalThis.devicePixelRatio||1,2)]}
      camera={{position:[.35,.18,17.5],fov:compact?52:46,near:.1,far:100}}
      gl={{antialias:true,alpha:true,powerPreference:'high-performance'}}
      onCreated={({gl})=>{gl.setClearColor(0x000000,0)}}
    >
      <Stars radius={38} depth={26} count={compact?260:520} factor={1.25} saturation={0} fade speed={reducedMotion?0:.2}/>
      <InstancedFilaments edges={edges} nodes={nodes} focusId={focusId} selectedId={selectedId} theme="dark"/>
      <InstancedNodes nodes={nodes} focusId={focusId} selectedId={selectedId} aura theme="dark" shape="sphere"/>
      <InstancedNodes
        nodes={nodes}
        focusId={focusId}
        selectedId={selectedId}
        theme="dark"
        shape="sphere"
        onNodeClick={node=>onSelect(node)}
        onNodeDoubleClick={node=>pick(node)}
      />
      <GraphLabels nodes={nodes} focusId={focusId} selectedId={selectedId} compact={compact}/>
      <CameraController reducedMotion={reducedMotion} autoOrbit={hero&&!reducedMotion}/>
    </Canvas>
    <div className="atlas3d-vignette" aria-hidden="true"/>
    <div className="atlas3d-hint">{compact?'arraste · pinça · toque':'arraste para orbitar · scroll para zoom · duplo clique abre contexto'}</div>
  </div>;
}
