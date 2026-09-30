import {useMemo} from 'react';
import {Canvas} from '@react-three/fiber';
import {Html,Stars} from '@react-three/drei';
import type {AtlasGraph,AtlasNode,PositionedNode} from './types';
import {buildOrbitalNodes,hierarchyRingRadius} from './types';
import {selectSemanticLOD} from './semantic-lod';
import {graphRenderBudget} from './neural-visuals.mjs';
import {InstancedNodes} from './InstancedNodes';
import {InstancedFilaments} from './InstancedFilaments';
import {CameraController} from './CameraController';
import {shouldOpenNode} from './picking';
import {supportsWebGL2} from '../graph-engine/webgl-support';
import '../design/spatial-3d.css';

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
  if(node.id===focusId)return .9;
  if(node.id===selectedId)return .44;
  const type=String(node.type||'').toUpperCase();
  if(type==='SYSTEM'||type==='ROOT')return .4;
  if(type==='DOMAIN'||type==='PROGRAM')return .34;
  if(type==='SUBGRAPH'||type==='FOLDER')return .19;
  if(type==='CAMPAIGN')return .17;
  return .12;
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

function semanticType(node:PositionedNode,focusId:string){
  if(node.id===focusId)return'RAIZ';
  const type=String(node.type||'').toUpperCase();
  if(type==='DOMAIN'||type==='PROGRAM')return'DOMÍNIO';
  if(type==='SUBGRAPH'||type==='FOLDER')return'PASTA';
  return type.replaceAll('_',' ');
}

function GraphLabels({nodes,focusId,selectedId,compact}:{nodes:PositionedNode[];focusId:string;selectedId?:string|null;compact:boolean}){
  const childCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const node of nodes){
      const parent=typeof node.parentId==='string'?node.parentId:'';
      if(parent)counts.set(parent,(counts.get(parent)||0)+1);
    }
    return counts;
  },[nodes]);

  const labels=useMemo(()=>{
    const ordered=[...nodes].sort((a,b)=>labelPriority(b,focusId,selectedId)-labelPriority(a,focusId,selectedId));
    const budget=compact?6:16;
    return ordered.filter(node=>{
      if(node.id===focusId||node.id===selectedId)return true;
      const type=String(node.type||'').toUpperCase();
      return compact?type==='SYSTEM'||type==='ROOT'||type==='DOMAIN':true;
    }).slice(0,budget);
  },[compact,focusId,nodes,selectedId]);

  return <>{labels.map(node=>{
    const [x,y,z]=node.position;
    const radius=nodeRadius(node,selectedId,focusId);
    const type=String(node.type||'').toUpperCase();
    const role=node.id===focusId?'root':type==='DOMAIN'||type==='PROGRAM'?'domain':type==='SUBGRAPH'||type==='FOLDER'?'folder':'entity';
    const metrics=node.metrics as Record<string,unknown>|undefined;
    const declared=typeof metrics?.subgraphs==='number'?metrics.subgraphs:0;
    const children=Math.max(childCounts.get(node.id)||0,declared);
    const kind=semanticType(node,focusId);
    const meta=kind==='DOMÍNIO'&&children>0?`${kind} · ${children} ${children===1?'PASTA':'PASTAS'}`:kind;
    return <Html key={node.id} position={[x,y+radius*1.72,z]} center distanceFactor={compact?18:15} zIndexRange={[20,0]} style={{pointerEvents:'none'}}>
      <div className={`atlas3d-label is-${role} ${node.id===focusId?'is-focus':''} ${node.id===selectedId?'is-selected':''}`}>
        <strong>{String(node.label||node.id)}</strong>
        {!compact&&<span>{meta}</span>}
      </div>
    </Html>;
  })}</>;
}

function HierarchyGuide({nodes,focusId}:{nodes:PositionedNode[];focusId:string}){
  const directChildren=nodes.filter(node=>typeof node.parentId==='string'&&node.parentId===focusId).length;
  if(directChildren<2)return null;
  const radius=hierarchyRingRadius(directChildren,'spatial');
  return <mesh position={[0,0,-.04]} renderOrder={-2}>
    <torusGeometry args={[radius,.008,6,160]}/>
    <meshBasicMaterial color="#68cfff" transparent opacity={.11} depthWrite={false}/>
  </mesh>;
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
      <Stars radius={38} depth={26} count={compact?220:420} factor={1.1} saturation={0} fade speed={reducedMotion?0:.16}/>
      <HierarchyGuide nodes={nodes} focusId={focusId}/>
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
