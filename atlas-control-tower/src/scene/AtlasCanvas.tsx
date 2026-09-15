import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { createAtlasRenderer } from './createRenderer';
import { selectSemanticLOD } from './semantic-lod';
import { applyCameraKey, cameraDistanceForPresentation, clampSpherical, MAX_DISTANCE, sphericalToCartesian, type CameraSpherical } from './camera-controls';
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
  reducedMotion:boolean;
  compact?:boolean;
  loading?:boolean;
  theme?:'dark'|'light';
  presentationMode?:'spatial'|'canvas';
};
type MotionState={current:Map<string,Vector3>;target:Map<string,Vector3>};

class CanvasErrorBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:'r3f-3d',phase:'error',message:error instanceof Error?error.message:'renderer-failed'}}));
  }
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

function canUseThreeRenderer(){
  if(typeof document==='undefined')return true;
  const probe=document.createElement('canvas');
  const supported=Boolean(probe.getContext('webgl2')||probe.getContext('webgl'));
  probe.width=1;probe.height=1;
  return supported;
}

async function detectThreeRenderer(){
  if(canUseThreeRenderer())return true;
  const gpu=(typeof navigator!=='undefined'&&'gpu' in navigator)?(navigator as Navigator & {gpu?:{requestAdapter?:()=>Promise<unknown>}}).gpu:undefined;
  if(!gpu?.requestAdapter)return false;
  try{return Boolean(await gpu.requestAdapter());}catch{return false;}
}

function CameraRig({compact,focusId,focusType,presentationMode}:{compact:boolean;focusId:string;focusType:string|undefined;presentationMode:'spatial'|'canvas'}){
  const {camera,gl,size}=useThree();
  const controlsRef=useRef<OrbitControlsImpl|null>(null);

  const recenter=(distance:number)=>{
    const controls=controlsRef.current;
    let spherical:CameraSpherical=controls
      ? clampSpherical({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance})
      : {azimuth:0,polar:Math.PI/2,distance};
    if(presentationMode==='canvas'){
      spherical={...spherical,azimuth:Math.max(-0.48,Math.min(0.48,spherical.azimuth)),polar:Math.max(Math.PI/2-0.24,Math.min(Math.PI/2+0.24,spherical.polar))};
    }
    camera.position.set(...sphericalToCartesian(spherical));
    camera.lookAt(0,0,0);
    controls?.target.set(0,0,0);
    controls?.update();
  };

  useEffect(()=>{
    const aspect=size.width/Math.max(1,size.height);
    recenter(cameraDistanceForPresentation(focusType,compact,aspect,presentationMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[compact,focusType,presentationMode,size.height,size.width]);

  useEffect(()=>{
    recenter(cameraDistanceForPresentation(focusType,compact,size.width/Math.max(1,size.height),presentationMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusId,presentationMode]);

  useEffect(()=>{
    gl.domElement.tabIndex=0;
    const onKeyDown=(event:KeyboardEvent)=>{
      const controls=controlsRef.current;if(!controls)return;
      const current:CameraSpherical={azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance:controls.getDistance()};
      const next=applyCameraKey(current,event.key);
      if(!next)return;
      event.preventDefault();
      const bounded=presentationMode==='canvas'?{...next,azimuth:Math.max(-0.48,Math.min(0.48,next.azimuth)),polar:Math.max(Math.PI/2-0.24,Math.min(Math.PI/2+0.24,next.polar))}:next;
      camera.position.set(...sphericalToCartesian(bounded));
      controls.update();
    };
    gl.domElement.addEventListener('keydown',onKeyDown);
    return()=>gl.domElement.removeEventListener('keydown',onKeyDown);
  },[camera,gl,presentationMode]);

  return <DreiOrbitControls
    ref={controlsRef}
    camera={camera}
    domElement={gl.domElement}
    makeDefault
    enableDamping
    dampingFactor={0.12}
    enablePan
    enableRotate
    enableZoom
    // autoRotate = false: camera motion is always user-driven.
    autoRotate={false}
    minDistance={5}
    maxDistance={MAX_DISTANCE}
    minPolarAngle={presentationMode==='canvas'?Math.PI/2-0.24:0.18}
    maxPolarAngle={presentationMode==='canvas'?Math.PI/2+0.24:Math.PI-0.18}
    minAzimuthAngle={presentationMode==='canvas'?-0.48:-Infinity}
    maxAzimuthAngle={presentationMode==='canvas'?0.48:Infinity}
    target={[0,0,0]}
  />;
}

const STARFIELD_POSITIONS=Array.from({length:180},(_,index)=>{
  const a=index*2.399963229728653;
  const radius=17+(index%11)*1.8;
  return [Math.cos(a)*radius,(Math.sin(a*1.37)*0.68)*radius,Math.sin(a)*radius*0.72];
}).flat();

function StarField({theme}:{theme:'dark'|'light'}){
  const geometry=useMemo(()=>{
    const value=new BufferGeometry();
    value.setAttribute('position',new Float32BufferAttribute(STARFIELD_POSITIONS,3));
    return value;
  },[]);
  const light=theme==='light';
  return <points geometry={geometry} frustumCulled={false} renderOrder={-1}>
    <pointsMaterial color={light?0x3f8fc9:0x70cfff} size={light?0.035:0.045} transparent opacity={light?0.28:0.58} depthWrite={false} sizeAttenuation/>
  </points>;
}

function OrbitalGuides({nodes,focusId,theme,presentationMode}:{nodes:PositionedNode[];focusId:string;theme:'dark'|'light';presentationMode:'spatial'|'canvas'}){
  const light=theme==='light';
  const ringMaterials=useMemo(()=>[0.10,0.16,0.22].map(opacity=>
    new MeshBasicMaterial({color:light?0x4b8fc4:0x42bff4,transparent:true,opacity:light?opacity*0.72:opacity,depthWrite:false,depthTest:true})
  ),[light]);
  const clusterMaterial=useMemo(()=>
    new MeshBasicMaterial({color:light?0x4c83b1:0x2d8fc7,transparent:true,opacity:light?0.09:0.13,depthWrite:false,depthTest:true})
  ,[light]);
  const clusterNodes=useMemo(()=>nodes.filter(node=>node.id!==focusId&&['SYSTEM','DOMAIN','CAMPAIGN'].includes(String(node.type||'').toUpperCase())).slice(0,12),[focusId,nodes]);
  const guideScale=presentationMode==='canvas'?1.3:1;
  const guideRotation=presentationMode==='canvas'?[0.012,-0.018,0.008] as [number,number,number]:[0.06,-0.08,0.04] as [number,number,number];
  return <group aria-hidden="true">
    <group scale={[1,0.66,1]} rotation={guideRotation}>
      {[4.2,5.2,6.15].map((radius,index)=><mesh key={radius} rotation={presentationMode==='canvas'?[0,index*0.025,index*0.03]:[0,index*0.12,index*0.16]}>
        <torusGeometry args={[radius*guideScale,0.010 + index*0.003,8,144]}/>
        <primitive object={ringMaterials[index]} attach="material" dispose={null}/>
      </mesh>)}
    </group>
    {clusterNodes.map(node=><mesh key={`cluster-orbit:${node.id}`} position={node.position} scale={[1,0.72,1]} rotation={presentationMode==='canvas'?[0.01,0.005,0]:[0.08,0.02,0]}>
      <torusGeometry args={[presentationMode==='canvas'?0.68:0.54,0.007,6,48]}/>
      <primitive object={clusterMaterial} attach="material" dispose={null}/>
    </mesh>)}
  </group>;
}

function LabelProjector({nodes,labelIds,onLabels,motion,focusId,selectedId}:{nodes:PositionedNode[];labelIds:Set<string>;onLabels:(labels:ProjectedLabel[])=>void;motion:MotionState;focusId:string;selectedId?:string|null}){
  const {camera,size}=useThree();
  const lastAt=useRef(0);
  const lastSignature=useRef('');
  const tmp=useMemo(()=>new Vector3(),[]);
  useFrame(({clock})=>{
    if(clock.elapsedTime-lastAt.current<0.06)return;
    lastAt.current=clock.elapsedTime;
    const labels=nodes.filter(node=>labelIds.has(node.id)).map(node=>{
      tmp.copy(motion.current.get(node.id)||new Vector3(...node.position)).project(camera);
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
    const placed=placeProjectedLabels(labels,size.width,size.height,focusId,selectedId);
    const signature=placed.map(item=>`${item.id}:${Math.round(item.x)}:${Math.round(item.y)}:${item.visible?1:0}`).join('|');
    if(signature!==lastSignature.current){lastSignature.current=signature;onLabels(placed)}
  });
  return null;
}

function SceneContent({nodes,graph,labelIds,onLabels,onPick,reducedMotion,selectedId,focusId,focusType,compact,motion,theme,presentationMode}:{
  nodes:PositionedNode[];
  graph:AtlasGraph;
  labelIds:Set<string>;
  onLabels:(labels:ProjectedLabel[])=>void;
  onPick:(node:PositionedNode)=>void;
  reducedMotion:boolean;
  selectedId?:string|null;
  focusId:string;
  focusType:string|undefined;
  compact:boolean;
  motion:MotionState;
  theme:'dark'|'light';
  presentationMode:'spatial'|'canvas';
}){
  useFrame((_,delta)=>{
    const ids=new Set(nodes.map(node=>node.id));
    nodes.forEach(node=>{
      const goal=new Vector3(...node.position);
      motion.target.set(node.id,goal);
      if(!motion.current.has(node.id)) motion.current.set(node.id,motion.current.size?new Vector3(0,0,0):goal.clone());
      if(reducedMotion) motion.current.get(node.id)!.copy(goal);
      else motion.current.get(node.id)!.lerp(goal,1-Math.pow(0.001,Math.min(delta,0.05)));
    });
    for(const id of motion.current.keys()) if(!ids.has(id)){motion.current.delete(id);motion.target.delete(id)}
  });
  return <>
    <CameraRig compact={compact} focusId={focusId} focusType={focusType} presentationMode={presentationMode}/>
    <OrbitalGuides nodes={nodes} focusId={focusId} theme={theme} presentationMode={presentationMode}/>
    {!reducedMotion&&<StarField theme={theme}/>}
    <InstancedNodes nodes={nodes} positions={motion.current} focusId={focusId} aura theme={theme}/>
    <InstancedFilaments edges={graph.edges} nodes={nodes} positions={motion.current} focusId={focusId} selectedId={selectedId} theme={theme}/>
    <InstancedNodes nodes={nodes} positions={motion.current} selectedId={selectedId} focusId={focusId} onNodeClick={onPick} theme={theme}/>
    <LabelProjector nodes={nodes} labelIds={labelIds} onLabels={onLabels} motion={motion} focusId={focusId} selectedId={selectedId}/>
  </>;
}

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,compact=false,loading=false,theme='dark',presentationMode='spatial'}:Props){
  const [labels,setLabels]=useState<ProjectedLabel[]>([]);
  const [threeEnabled,setThreeEnabled]=useState(canUseThreeRenderer);
  const [renderActive,setRenderActive]=useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const stageRef=useRef<HTMLDivElement>(null);
  const motion=useRef<MotionState>({current:new Map(),target:new Map()});
  const sourceNodes=graph?.nodes||[];
  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{
    selectedId,focusId,
    visibleBudget:compact?90:180,
    labelBudget:compact?20:36
  }),[compact,focusId,selectedId,sourceNodes]);
  const visible=useMemo(()=>sourceNodes.filter(node=>lod.visibleIds.has(node.id)),[lod.visibleIds,sourceNodes]);
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[],presentationMode),[focusId,graph?.edges,presentationMode,visible]);
  const nodeById=useMemo(()=>new Map(nodes.map(node=>[node.id,node])),[nodes]);
  const visibleIds=useMemo(()=>new Set(nodes.map(node=>node.id)),[nodes]);
  const sceneGraph=useMemo<AtlasGraph>(()=>({
    ...(graph||{nodes:[],edges:[]}),nodes,
    edges:(graph?.edges||[]).filter(edge=>visibleIds.has(edge.source)&&visibleIds.has(edge.target))
  }),[graph,nodes,visibleIds]);
  const focusType=nodeById.get(focusId)?.type as string|undefined;

  const handlePick=(picked:PositionedNode)=>{
    const node=nodeById.get(picked.id);if(!node)return;
    if(shouldOpenNode(node,focusId,sceneGraph.edges))onOpen(node);
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

  useEffect(()=>{
    if(threeEnabled||typeof document==='undefined')return;
    let active=true;
    void detectThreeRenderer().then(supported=>{if(active)setThreeEnabled(supported);});
    return()=>{active=false;};
  },[threeEnabled]);

  if(!graph)return <div className="atlas-canvas-loading">Lendo recorte orbital…</div>;

  const fallback=<div className="atlas-graph-renderer-fallback"><CanvasGraphFallback nodes={nodes} edges={sceneGraph.edges} labelIds={lod.labelIds} focusId={focusId} selectedId={selectedId} onNodeClick={handlePick} reducedMotion={reducedMotion} compact={compact} theme={theme}/><span className="atlas-graph-fallback-note">Renderer 3D indisponível · exploração preservada em Canvas</span></div>;
  if(!threeEnabled)return <div className="atlas-r3f-stage" ref={stageRef} data-render-active="true">{fallback}{loading&&<div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}</div>;
  return <div className="atlas-r3f-stage" ref={stageRef} data-render-active={renderActive ? 'true' : 'false'}>
    <CanvasErrorBoundary key={`${focusId}:${nodes.length}:${theme}:${presentationMode}`} fallback={fallback}>
      <Canvas
        className="atlas-webgpu-canvas"
        frameloop={renderActive ? 'always' : 'never'}
        dpr={[1,2]}
        camera={{position:[0,0,presentationMode==='canvas'?18.2:15.5],fov:presentationMode==='canvas'?42:48,near:0.05,far:120}}
        gl={async defaults=>(await createAtlasRenderer(defaults.canvas as HTMLCanvasElement)).renderer as never}
      >
        <SceneContent
          nodes={nodes}
          graph={sceneGraph}
          labelIds={lod.labelIds}
          onLabels={setLabels}
          onPick={handlePick}
          reducedMotion={reducedMotion}
          selectedId={selectedId}
          focusId={focusId}
          focusType={focusType}
          compact={compact}
          motion={motion.current}
          theme={theme}
          presentationMode={presentationMode}
        />
      </Canvas>
      <LabelOverlay labels={labels} labelIds={lod.labelIds} selectedId={selectedId}/>
    </CanvasErrorBoundary>
    {loading && <div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}
  </div>;
}
