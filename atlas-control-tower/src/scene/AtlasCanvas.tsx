import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls, PerformanceMonitor } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { createAtlasRenderer } from './createRenderer';
import { selectSemanticLOD } from './semantic-lod';
import { applyCameraKey, cameraDistanceForLevel, clampSpherical, sphericalToCartesian, type CameraSpherical } from './camera-controls';
import { shouldOpenNode } from './picking';
import { buildOrbitalNodes, type AtlasGraph, type AtlasNode, type PositionedNode } from './types';
import { InstancedNodes } from './InstancedNodes';
import { InstancedFilaments } from './InstancedFilaments';
import { LabelOverlay, labelStatus, labelText, labelType, placeProjectedLabels, type ProjectedLabel } from './LabelOverlay';
import { CanvasGraphFallback } from './CanvasGraphFallback';

type Props={
  graph:AtlasGraph|null;
  focusId:string;
  selectedId?:string|null;
  onSelect:(node:AtlasNode)=>void;
  onOpen:(node:AtlasNode)=>void;
  reducedMotion?:boolean;
  compact?:boolean;
  loading?:boolean;
  mode?:'3d'|'canvas';
};

type ErrorBoundaryProps={children:ReactNode;fallback:ReactNode};
type ErrorBoundaryState={failed:boolean};

class CanvasErrorBoundary extends Component<ErrorBoundaryProps,ErrorBoundaryState>{
  state:ErrorBoundaryState={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error:unknown){console.error('ATLAS_R3F_RENDER_FAILED',error)}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}

function canUseWebGL2(){
  try{
    const canvas=document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2',{failIfMajorPerformanceCaveat:true}));
  }catch{return false}
}

function focusLevel(graph:AtlasGraph,focusId:string){
  const focus=graph.nodes.find(node=>node.id===focusId);
  return focus?.type||'DOMAIN';
}

function CameraRig({graph,focusId,reducedMotion}:{graph:AtlasGraph;focusId:string;reducedMotion:boolean}){
  const {camera}=useThree();
  const controls=useRef<OrbitControlsImpl|null>(null);
  const [dragging,setDragging]=useState(false);
  const spherical=useRef<CameraSpherical>({azimuth:0.82,polar:1.06,distance:cameraDistanceForLevel(focusLevel(graph,focusId),graph.nodes.length)});
  const targetDistance=cameraDistanceForLevel(focusLevel(graph,focusId),graph.nodes.length);
  const target=useMemo(()=>new Vector3(0,0,0),[]);

  useEffect(()=>{
    spherical.current=clampSpherical({...spherical.current,distance:targetDistance});
    const next=sphericalToCartesian(spherical.current);
    if(reducedMotion){
      camera.position.set(next.x,next.y,next.z);
      camera.lookAt(target);
      controls.current?.target.copy(target);
      controls.current?.update();
      return;
    }
    let frame=0;
    const start=camera.position.clone();
    const tick=()=>{
      frame+=1;
      const t=Math.min(1,frame/24);
      const ease=1-Math.pow(1-t,3);
      camera.position.lerpVectors(start,new Vector3(next.x,next.y,next.z),ease);
      camera.lookAt(target);
      controls.current?.target.copy(target);
      controls.current?.update();
      if(t<1)requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },[camera,focusId,reducedMotion,target,targetDistance]);

  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      const current=controls.current;
      if(!current)return;
      const offset=camera.position.clone().sub(current.target);
      const radius=Math.max(0.001,offset.length());
      const polar=Math.acos(Math.max(-1,Math.min(1,offset.y/radius)));
      const azimuth=Math.atan2(offset.x,offset.z);
      const next=applyCameraKey({azimuth,polar,distance:radius},event.key);
      if(!next)return;
      event.preventDefault();
      spherical.current=next;
      const position=sphericalToCartesian(next);
      camera.position.set(position.x,position.y,position.z);
      camera.lookAt(current.target);
      current.update();
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[camera]);

  useFrame(()=>{
    if(dragging)return;
    const current=controls.current;
    if(!current)return;
    const offset=camera.position.clone().sub(current.target);
    const radius=Math.max(0.001,offset.length());
    spherical.current=clampSpherical({azimuth:Math.atan2(offset.x,offset.z),polar:Math.acos(Math.max(-1,Math.min(1,offset.y/radius))),distance:radius});
  });

  return <DreiOrbitControls
    ref={controls}
    makeDefault
    target={[0,0,0]}
    enableDamping
    dampingFactor={reducedMotion?0.16:0.075}
    enablePan
    enableRotate
    enableZoom
    screenSpacePanning
    rotateSpeed={0.62}
    zoomSpeed={0.78}
    panSpeed={0.58}
    minDistance={3.6}
    maxDistance={34}
    minPolarAngle={0.18}
    maxPolarAngle={Math.PI-0.18}
    onStart={()=>setDragging(true)}
    onEnd={()=>setDragging(false)}
  />;
}

function OrbitalGuides({nodes}:{nodes:PositionedNode[]}){
  const radii=useMemo(()=>{
    const values=nodes.map(node=>Math.hypot(node.position[0],node.position[2])).filter(value=>value>1.4).sort((a,b)=>a-b);
    const unique:number[]=[];
    for(const value of values)if(!unique.some(existing=>Math.abs(existing-value)<1.15))unique.push(value);
    return unique.slice(0,4);
  },[nodes]);
  return <>{radii.map((radius,index)=><mesh key={`${radius}-${index}`} rotation={[Math.PI/2.48,0,0]} position={[0,-0.12-index*0.06,0]}>
    <ringGeometry args={[Math.max(.2,radius-.014),radius+.014,128]}/>
    <meshBasicMaterial color="#5aa7d8" transparent opacity={0.08+index*.012} depthWrite={false}/>
  </mesh>)}</>;
}

function StarField({reducedMotion,count=180}:{reducedMotion:boolean;count?:number}){
  const geometry=useMemo(()=>{
    const values:number[]=[];
    for(let i=0;i<count;i++){
      const angle=(i*2.399963229728653)%(Math.PI*2);
      const radius=8+(i%19)*.74;
      const y=((i*17)%29-14)*.72;
      values.push(Math.cos(angle)*radius,y,Math.sin(angle)*radius);
    }
    const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(values,3));return geo;
  },[count]);
  const material=useMemo(()=>new MeshBasicMaterial({color:'#8ccff3',transparent:true,opacity:0.28,depthWrite:false}),[]);
  const points=useRef<import('three').Points>(null);
  useFrame((_,delta)=>{if(!reducedMotion&&points.current)points.current.rotation.y+=delta*.004});
  return <points ref={points} geometry={geometry} material={material}/>;
}

function SceneContent({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,compact,onLabels}:{graph:AtlasGraph;focusId:string;selectedId?:string|null;onSelect:(node:AtlasNode)=>void;onOpen:(node:AtlasNode)=>void;reducedMotion:boolean;compact:boolean;onLabels:(labels:ProjectedLabel[])=>void}){
  const {camera,size}=useThree();
  const rawNodes=useMemo(()=>buildOrbitalNodes(graph,focusId),[graph,focusId]);
  const lod=useMemo(()=>selectSemanticLOD(rawNodes,{focusId,selectedId,visibleBudget:compact?70:180,labelBudget:compact?14:36}),[compact,focusId,rawNodes,selectedId]);
  const visibleIds=useMemo(()=>new Set(lod.visibleNodes.map(node=>node.id)),[lod.visibleNodes]);
  const edges=useMemo(()=>graph.edges.filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target)),[graph.edges,visibleIds]);
  const [displayPositions,setDisplayPositions]=useState<Map<string,Vector3>>(()=>new Map(lod.visibleNodes.map(node=>[node.id,new Vector3(...node.position)])));
  const targetPositions=useMemo(()=>new Map(lod.visibleNodes.map(node=>[node.id,new Vector3(...node.position)])),[lod.visibleNodes]);
  const displayRef=useRef(displayPositions);displayRef.current=displayPositions;
  const lastLabelKey=useRef('');

  useEffect(()=>{
    setDisplayPositions(current=>{
      const next=new Map(current);
      for(const node of lod.visibleNodes)if(!next.has(node.id))next.set(node.id,new Vector3(...node.position));
      for(const key of [...next.keys()])if(!targetPositions.has(key))next.delete(key);
      return next;
    });
  },[lod.visibleNodes,targetPositions]);

  useFrame(()=>{
    let changed=false;
    const next=new Map(displayRef.current);
    for(const [id,target] of targetPositions){
      const current=next.get(id)||target.clone();
      if(current.distanceToSquared(target)>0.00001){current.lerp(target,reducedMotion?1:0.11);changed=true}
      next.set(id,current);
    }
    if(changed){displayRef.current=next;setDisplayPositions(next)}
    const labelNodes=lod.labelNodes.map(node=>{const position=displayRef.current.get(node.id)||new Vector3(...node.position);return {...node,position:[position.x,position.y,position.z] as [number,number,number]}});
    const placed=placeProjectedLabels(labelNodes,camera,size.width,size.height,{focusId,selectedId,compact});
    const key=placed.map(item=>`${item.id}:${Math.round(item.x)}:${Math.round(item.y)}:${item.anchor}`).join('|');
    if(key!==lastLabelKey.current){lastLabelKey.current=key;onLabels(placed)}
  });

  const clickNode=(node:PositionedNode,event:{nativeEvent:MouseEvent})=>{
    const original=graph.nodes.find(candidate=>candidate.id===node.id);if(!original)return;
    onSelect(original);
    if(event.nativeEvent.detail>=2&&shouldOpenNode(original,graph,focusId))onOpen(original);
  };

  return <>
    <color attach="background" args={['#030711']}/>
    <fog attach="fog" args={['#030711',15,36]}/>
    <ambientLight intensity={0.7}/>
    <pointLight position={[0,5,7]} intensity={10} color="#78c9ff" distance={28}/>
    <StarField reducedMotion={reducedMotion} count={compact?90:180}/>
    <OrbitalGuides nodes={lod.visibleNodes}/>
    <InstancedFilaments edges={edges} nodes={lod.visibleNodes} positions={displayPositions} focusId={focusId} selectedId={selectedId}/>
    <InstancedNodes nodes={lod.visibleNodes} positions={displayPositions} focusId={focusId} selectedId={selectedId} aura/>
    <InstancedNodes nodes={lod.visibleNodes} positions={displayPositions} focusId={focusId} selectedId={selectedId} onNodeClick={clickNode}/>
    <CameraRig graph={graph} focusId={focusId} reducedMotion={reducedMotion}/>
  </>;
}

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion=false,compact=false,loading=false,mode='3d'}:Props){
  const [threeEnabled,setThreeEnabled]=useState(()=>mode==='3d'&&canUseWebGL2());
  const [labels,setLabels]=useState<ProjectedLabel[]>([]);
  const [dpr,setDpr]=useState(compact?1.35:1.75);
  useEffect(()=>setThreeEnabled(mode==='3d'&&canUseWebGL2()),[mode]);
  useEffect(()=>setDpr(compact?1.35:1.75),[compact]);
  useEffect(()=>{if(graph)setLabels([])},[focusId,graph]);

  if(!graph)return <div className="atlas-r3f-stage atlas-canvas-loading" aria-busy="true"><span>Preparando mapa…</span></div>;
  if(!threeEnabled)return <CanvasGraphFallback graph={graph} focusId={focusId} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} reducedMotion={reducedMotion} compact={compact}/>;

  const fallback=<CanvasGraphFallback graph={graph} focusId={focusId} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} reducedMotion={reducedMotion} compact={compact}/>;
  const selected=selectedId?graph.nodes.find(node=>node.id===selectedId):null;

  return <CanvasErrorBoundary fallback={fallback}>
    <div className="atlas-r3f-stage" data-testid="atlas-r3f-stage">
      <Canvas
        camera={{position:[8.4,6.2,10.8],fov:44,near:.1,far:90}}
        dpr={dpr}
        gl={async defaults=>createAtlasRenderer(defaults.canvas as HTMLCanvasElement,{antialias:defaults.antialias,alpha:defaults.alpha,powerPreference:'high-performance',mode:'webgl'})}
        onCreated={({gl})=>{
          const dom=gl.domElement;dom.classList.add('atlas-webgpu-canvas');
          const onLost=(event:Event)=>{event.preventDefault();setThreeEnabled(false)};
          dom.addEventListener('webglcontextlost',onLost,{once:true});
        }}
      >
        <PerformanceMonitor onDecline={()=>setDpr(value=>Math.max(1,value-.25))} onIncline={()=>setDpr(value=>Math.min(compact?1.5:2,value+.15))}/>
        <SceneContent graph={graph} focusId={focusId} selectedId={selectedId} onSelect={onSelect} onOpen={onOpen} reducedMotion={reducedMotion} compact={compact} onLabels={setLabels}/>
      </Canvas>
      <LabelOverlay labels={labels}/>
      {selected&&<div className="atlas-selected-caption" aria-live="polite"><strong>{labelText(selected)}</strong><span>{labelType(selected)} · {labelStatus(selected)}</span></div>}
      {loading&&<div className="atlas-graph-transition"><span>Atualizando cena…</span></div>}
    </div>
  </CanvasErrorBoundary>;
}
