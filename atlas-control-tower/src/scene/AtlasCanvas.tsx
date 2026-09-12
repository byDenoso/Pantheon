import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import { Color, Scene, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAtlasRenderer } from './createRenderer';
import { selectSemanticLOD } from './semantic-lod';
import { buildOrbitalNodes, type AtlasGraph, type AtlasNode, type PositionedNode } from './types';
import { InstancedNodes } from './InstancedNodes';
import { InstancedFilaments } from './InstancedFilaments';
import { GpuPicking } from './GpuPicking';
import { LabelOverlay, labelText, type ProjectedLabel } from './LabelOverlay';
import { isNavigableNode, pointerParallaxTarget } from './interaction.mjs';

const STRUCTURAL=new Set(['ROOT','SYSTEM','DOMAIN','SUBGRAPH','CAMPAIGN']);

type Props={graph:AtlasGraph|null;focusId:string;selectedId?:string|null;onSelect:(node:AtlasNode)=>void;onOpen:(node:AtlasNode)=>void;reducedMotion:boolean;autoOrbit:boolean;compact?:boolean};

function CameraRig({reducedMotion,autoOrbit}:{reducedMotion:boolean;autoOrbit:boolean}){
  const {camera,gl,size}=useThree();const controls=useRef<OrbitControls|null>(null);const parallax=useRef({yaw:0,pitch:0});
  useEffect(()=>{
    camera.position.set(.35,.18,17.5);camera.lookAt(0,0,0);
    const next=new OrbitControls(camera,gl.domElement);next.enableDamping=true;next.dampingFactor=.075;next.enablePan=true;next.minDistance=4.8;next.maxDistance=36;next.rotateSpeed=.55;next.zoomSpeed=.72;controls.current=next;
    const move=(event:PointerEvent)=>{
      if(reducedMotion||event.buttons!==0)return;
      const rect=gl.domElement.getBoundingClientRect();
      parallax.current=pointerParallaxTarget(event.clientX-rect.left,event.clientY-rect.top,rect.width||size.width,rect.height||size.height);
    };
    const leave=()=>{parallax.current={yaw:0,pitch:0}};
    gl.domElement.addEventListener('pointermove',move,{passive:true});gl.domElement.addEventListener('pointerleave',leave,{passive:true});
    return()=>{gl.domElement.removeEventListener('pointermove',move);gl.domElement.removeEventListener('pointerleave',leave);next.dispose();controls.current=null};
  },[camera,gl,reducedMotion,size.height,size.width]);
  useEffect(()=>{if(!controls.current)return;controls.current.autoRotate=autoOrbit&&!reducedMotion;controls.current.autoRotateSpeed=.32},[autoOrbit,reducedMotion]);
  useFrame(()=>{
    const next=controls.current;if(!next)return;
    const px=reducedMotion?0:parallax.current.yaw*1.35,py=reducedMotion?0:-parallax.current.pitch*1.1;
    next.target.x+=(px-next.target.x)*.075;next.target.y+=(py-next.target.y)*.075;next.update();
  });return null;
}

function StarField(){
  const positions=useMemo(()=>{const values=new Float32Array(180*3);for(let i=0;i<180;i++){values[i*3]=((i*73)%179)/179*30-15;values[i*3+1]=((i*109)%181)/181*20-10;values[i*3+2]=-4-((i*47)%149)/149*22}return values},[]);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions,3]}/></bufferGeometry><pointsMaterial size={.035} color="#8bdcff" transparent opacity={.52} sizeAttenuation depthWrite={false}/></points>;
}

function OrbitalGuides(){return <group>
  <mesh rotation={[1.22,.16,.22]}><torusGeometry args={[2.05,.006,4,96]}/><meshBasicMaterial color="#4fb8ff" transparent opacity={.16} depthWrite={false}/></mesh>
  <mesh rotation={[1.48,.58,-.35]}><torusGeometry args={[2.45,.006,4,96]}/><meshBasicMaterial color="#4fb8ff" transparent opacity={.11} depthWrite={false}/></mesh>
  <mesh rotation={[.92,-.38,.68]}><torusGeometry args={[2.82,.005,4,96]}/><meshBasicMaterial color="#70cfff" transparent opacity={.08} depthWrite={false}/></mesh>
</group>}

function LabelProjector({nodes,labelIds,onLabels}:{nodes:PositionedNode[];labelIds:Set<string>;onLabels:(labels:ProjectedLabel[])=>void}){
  const {camera,size}=useThree();const lastAt=useRef(0);const lastSignature=useRef('');const tmp=useMemo(()=>new Vector3(),[]);
  useFrame(({clock})=>{
    if(clock.elapsedTime-lastAt.current<.06)return;lastAt.current=clock.elapsedTime;
    const labels=nodes.filter(node=>labelIds.has(node.id)).map(node=>{tmp.set(...node.position).project(camera);return{id:node.id,label:labelText(node),kind:String(node.type||''),x:(tmp.x*.5+.5)*size.width,y:(-tmp.y*.5+.5)*size.height,visible:tmp.z>-1&&tmp.z<1&&Math.abs(tmp.x)<1.08&&Math.abs(tmp.y)<1.08}});
    const signature=labels.map(item=>`${item.id}:${Math.round(item.x)}:${Math.round(item.y)}:${item.visible?1:0}`).join('|');if(signature!==lastSignature.current){lastSignature.current=signature;onLabels(labels)}
  });return null;
}

function SceneContent({nodes,graph,pickScene,idToNode,labelIds,onLabels,onPick,reducedMotion,autoOrbit,selectedId}:{nodes:PositionedNode[];graph:AtlasGraph;pickScene:Scene;idToNode:Map<number,string>;labelIds:Set<string>;onLabels:(labels:ProjectedLabel[])=>void;onPick:(id:string|null)=>void;reducedMotion:boolean;autoOrbit:boolean;selectedId?:string|null}){
  return <><CameraRig reducedMotion={reducedMotion} autoOrbit={autoOrbit}/><StarField/><OrbitalGuides/><InstancedFilaments edges={graph.edges} nodes={nodes}/><InstancedNodes nodes={nodes} selectedId={selectedId}/>{createPortal(<InstancedNodes nodes={nodes} pickMode/>,pickScene)}<GpuPicking pickScene={pickScene} idToNode={idToNode} onPick={onPick}/><LabelProjector nodes={nodes} labelIds={labelIds} onLabels={onLabels}/></>;
}

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,autoOrbit,compact=false}:Props){
  const [labels,setLabels]=useState<ProjectedLabel[]>([]);const pickScene=useMemo(()=>{const scene=new Scene();scene.background=new Color(0x000000);return scene},[]);const sourceNodes=graph?.nodes||[];
  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{selectedId,focusId,visibleBudget:compact?90:180,labelBudget:compact?20:36}),[compact,focusId,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId),[focusId,visible]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);const idToNode=useMemo(()=>new Map(nodes.map(node=>[node.pickId,node.id])),[nodes]);const visibleIds=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({...(graph||{nodes:[],edges:[]}),nodes,edges:(graph?.edges||[]).filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target))}),[graph,nodes,visibleIds]);
  const handlePick=(id:string|null)=>{if(!id)return;const node=nodeById.get(id);if(!node)return;if(isNavigableNode(node,graph,focusId)||(STRUCTURAL.has(String(node.type||'').toUpperCase())&&node.id!==focusId))onOpen(node);else onSelect(node)};
  if(!graph)return <div className="atlas-canvas-loading">Lendo recorte orbital…</div>;
  return <div className="atlas-r3f-stage"><Canvas className="atlas-webgpu-canvas" dpr={[1,2]} camera={{position:[.35,.18,17.5],fov:48,near:.05,far:120}} gl={async defaults=>(await createAtlasRenderer(defaults.canvas as HTMLCanvasElement)).renderer as never}><color attach="background" args={['#020611']}/><SceneContent nodes={nodes} graph={sceneGraph} pickScene={pickScene} idToNode={idToNode} labelIds={lod.labelIds} onLabels={setLabels} onPick={handlePick} reducedMotion={reducedMotion} autoOrbit={autoOrbit} selectedId={selectedId}/></Canvas><LabelOverlay labels={labels} labelIds={lod.labelIds} selectedId={selectedId} focusId={focusId}/></div>;
}
