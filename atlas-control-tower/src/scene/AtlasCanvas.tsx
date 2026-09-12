import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, Scene, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAtlasRenderer } from './createRenderer';
import { selectSemanticLOD } from './semantic-lod';
import { buildOrbitalNodes, type AtlasGraph, type AtlasNode, type PositionedNode } from './types';
import { InstancedNodes } from './InstancedNodes';
import { InstancedFilaments } from './InstancedFilaments';
import { GpuPicking } from './GpuPicking';
import { LabelOverlay, labelStatus, labelText, labelType, type ProjectedLabel } from './LabelOverlay';

const STRUCTURAL=new Set(['SYSTEM','DOMAIN','CAMPAIGN']);

type Props={
  graph:AtlasGraph|null;
  focusId:string;
  selectedId?:string|null;
  onSelect:(node:AtlasNode)=>void;
  onOpen:(node:AtlasNode)=>void;
  reducedMotion:boolean;
  autoOrbit:boolean;
  compact?:boolean;
};

function CameraRig({reducedMotion,autoOrbit,compact}:{reducedMotion:boolean;autoOrbit:boolean;compact:boolean}){
  const {camera,gl,size}=useThree();
  const controls=useRef<OrbitControls|null>(null);
  useEffect(()=>{
    const aspect=size.width/Math.max(1,size.height);
    const distance=aspect<0.72 ? 21 : compact ? 18 : 16;
    camera.position.set(0,0,distance);
    camera.lookAt(0,0,0);
    const next=new OrbitControls(camera,gl.domElement);
    next.enableDamping=true;
    next.dampingFactor=0.075;
    next.enablePan=true;
    next.minDistance=5;
    next.maxDistance=34;
    controls.current=next;
    return()=>{next.dispose();controls.current=null};
  },[camera,compact,gl,size.height,size.width]);
  useEffect(()=>{
    if(!controls.current)return;
    controls.current.autoRotate=autoOrbit&&!reducedMotion;
    controls.current.autoRotateSpeed=0.42;
  },[autoOrbit,reducedMotion]);
  useFrame(()=>controls.current?.update());
  return null;
}

const STARFIELD_POSITIONS=Array.from({length:180},(_,index)=>{
  const a=index*2.399963229728653;
  const radius=17+(index%11)*1.8;
  return [Math.cos(a)*radius,(Math.sin(a*1.37)*0.68)*radius,Math.sin(a)*radius*0.72];
}).flat();

function StarField(){
  const geometry=useMemo(()=>{
    const value=new BufferGeometry();
    value.setAttribute('position',new Float32BufferAttribute(STARFIELD_POSITIONS,3));
    return value;
  },[]);
  return <points geometry={geometry} frustumCulled={false} renderOrder={-1}>
    <pointsMaterial color={0x70cfff} size={0.045} transparent opacity={0.58} depthWrite={false} sizeAttenuation/>
  </points>;
}

function OrbitalGuides({nodes,focusId}:{nodes:PositionedNode[];focusId:string}){
  const ringMaterials=useMemo(()=>[0.12,0.19,0.27].map(opacity=>{
    const material=new MeshBasicNodeMaterial({color:0x42bff4,transparent:true,opacity,depthWrite:false});
    material.depthTest=true;
    return material;
  }),[]);
  const clusterMaterial=useMemo(()=>{
    const material=new MeshBasicNodeMaterial({color:0x2d8fc7,transparent:true,opacity:0.14,depthWrite:false});
    material.depthTest=true;
    return material;
  },[]);
  const clusterNodes=useMemo(()=>nodes.filter(node=>node.id!==focusId&&['SYSTEM','DOMAIN','CAMPAIGN'].includes(String(node.type||'').toUpperCase())).slice(0,12),[focusId,nodes]);
  return <group aria-hidden="true"><StarField/>
    <group scale={[1,0.66,1]} rotation={[0.06,-0.08,0.04]}>
      {[4.2,5.2,6.15].map((radius,index)=><mesh key={radius} rotation={[0,index*0.12,index*0.16]}>
        <torusGeometry args={[radius,0.012 + index*0.004,8,144]}/>
        <primitive object={ringMaterials[index]} attach="material" dispose={null}/>
      </mesh>)}
    </group>
    {clusterNodes.map(node=><mesh key={`cluster-orbit:${node.id}`} position={node.position} scale={[1,0.72,1]} rotation={[0.08,0.02,0]}>
      <torusGeometry args={[0.54,0.008,6,48]}/>
      <primitive object={clusterMaterial} attach="material" dispose={null}/>
    </mesh>)}
  </group>;
}

function LabelProjector({nodes,labelIds,onLabels}:{nodes:PositionedNode[];labelIds:Set<string>;onLabels:(labels:ProjectedLabel[])=>void}){
  const {camera,size}=useThree();
  const lastAt=useRef(0);
  const lastSignature=useRef('');
  const tmp=useMemo(()=>new Vector3(),[]);
  useFrame(({clock})=>{
    if(clock.elapsedTime-lastAt.current<0.06)return;
    lastAt.current=clock.elapsedTime;
    const labels=nodes.filter(node=>labelIds.has(node.id)).map(node=>{
      tmp.set(...node.position).project(camera);
      return {
        id:node.id,
        label:labelText(node),
        type:labelType(node),
        status:labelStatus(node),
        x:(tmp.x*0.5+0.5)*size.width + 10,
        y:(-tmp.y*0.5+0.5)*size.height - 13,
        visible:tmp.z>-1&&tmp.z<1&&Math.abs(tmp.x)<1.08&&Math.abs(tmp.y)<1.08,
        side:(tmp.x > 0.08 ? 'left' : 'right') as 'left'|'right'
      };
    });
    const signature=labels.map(item=>`${item.id}:${Math.round(item.x)}:${Math.round(item.y)}:${item.visible?1:0}`).join('|');
    if(signature!==lastSignature.current){lastSignature.current=signature;onLabels(labels)}
  });
  return null;
}

function SceneContent({nodes,graph,pickScene,idToNode,labelIds,onLabels,onPick,reducedMotion,autoOrbit,selectedId,focusId,compact}:{
  nodes:PositionedNode[];
  graph:AtlasGraph;
  pickScene:Scene;
  idToNode:Map<number,string>;
  labelIds:Set<string>;
  onLabels:(labels:ProjectedLabel[])=>void;
  onPick:(id:string|null)=>void;
  reducedMotion:boolean;
  autoOrbit:boolean;
  selectedId?:string|null;
  focusId:string;
  compact:boolean;
}){
  return <>
    <CameraRig reducedMotion={reducedMotion} autoOrbit={autoOrbit} compact={compact}/>
    <OrbitalGuides nodes={nodes} focusId={focusId}/>
    <InstancedNodes nodes={nodes} focusId={focusId} aura/>
    <InstancedFilaments edges={graph.edges} nodes={nodes} focusId={focusId} selectedId={selectedId}/>
    <InstancedNodes nodes={nodes} selectedId={selectedId} focusId={focusId}/>
    {createPortal(<InstancedNodes nodes={nodes} focusId={focusId} pickMode/>,pickScene)}
    <GpuPicking pickScene={pickScene} idToNode={idToNode} onPick={onPick}/>
    <LabelProjector nodes={nodes} labelIds={labelIds} onLabels={onLabels}/>
  </>;
}

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,autoOrbit,compact=false}:Props){
  const [labels,setLabels]=useState<ProjectedLabel[]>([]);
  const [renderActive,setRenderActive]=useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const stageRef=useRef<HTMLDivElement>(null);
  const pickScene=useMemo(()=>{const scene=new Scene();scene.background=new Color(0x000000);return scene},[]);
  const sourceNodes=graph?.nodes||[];
  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{
    selectedId,focusId,
    visibleBudget:compact?90:180,
    labelBudget:compact?20:36
  }),[compact,focusId,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[]),[focusId,graph?.edges,visible]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const idToNode=useMemo(()=>new Map(nodes.map(node=>[node.pickId,node.id])),[nodes]);
  const visibleIds=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({
    ...(graph||{nodes:[],edges:[]}),nodes,
    edges:(graph?.edges||[]).filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target))
  }),[graph,nodes,visibleIds]);

  const handlePick=(id:string|null)=>{
    if(!id)return;
    const node=nodeById.get(id);if(!node)return;
    if(STRUCTURAL.has(String(node.type||'').toUpperCase())&&node.id!==focusId)onOpen(node);
    else onSelect(node);
  };

  useEffect(()=>{
    const updateVisibility=()=>setRenderActive(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange',updateVisibility);
    const observer=typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries=>setRenderActive(document.visibilityState !== 'hidden' && Boolean(entries[0]?.isIntersecting)),{threshold:0.01});
    if(observer&&stageRef.current)observer.observe(stageRef.current);
    updateVisibility();
    return()=>{document.removeEventListener('visibilitychange',updateVisibility);observer?.disconnect()};
  },[]);

  if(!graph)return <div className="atlas-canvas-loading">Lendo recorte orbital…</div>;

  return <div className="atlas-r3f-stage" ref={stageRef} data-render-active={renderActive ? 'true' : 'false'}>
    <Canvas
      className="atlas-webgpu-canvas"
      frameloop={renderActive ? 'always' : 'never'}
      dpr={[1,2]}
      camera={{position:[0,0,15.5],fov:48,near:0.05,far:120}}
      gl={async defaults=>(await createAtlasRenderer(defaults.canvas as HTMLCanvasElement)).renderer as never}
    >
      <SceneContent
        nodes={nodes}
        graph={sceneGraph}
        pickScene={pickScene}
        idToNode={idToNode}
        labelIds={lod.labelIds}
        onLabels={setLabels}
        onPick={handlePick}
        reducedMotion={reducedMotion}
        autoOrbit={autoOrbit}
        selectedId={selectedId}
        focusId={focusId}
        compact={compact}
      />
    </Canvas>
    <LabelOverlay labels={labels} labelIds={lod.labelIds} selectedId={selectedId}/>
  </div>;
}
