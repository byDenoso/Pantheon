import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls } from '@react-three/drei';
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
  reducedMotion:boolean;
  compact?:boolean;
  loading?:boolean;
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

// Uses @react-three/drei's OrbitControls (a mature, well-tested wrapper around
// three.js's own OrbitControls) instead of a hand-rolled camera rig. The previous
// hand-rolled version instantiated a raw three/addons OrbitControls correctly, but
// then a useFrame lerped the camera's position toward a fixed target vector on
// *every* frame unconditionally -- overwriting whatever position the user's drag
// had just set, every ~16ms. That is the actual, confirmed (via a live drag test
// producing zero camera movement) root cause of "orbit doesn't respond": the rig
// was fighting the user's own input, not a broken drag handler. The fix here is
// structural, not cosmetic: position is only ever driven programmatically during a
// focus/orientation change (`recenter`), and user drag is left alone the rest of
// the time -- exactly what the "genuinely draggable" requirement calls for.
function CameraRig({compact,focusId,focusType}:{compact:boolean;focusId:string;focusType:string|undefined}){
  const {camera,gl,size}=useThree();
  const controlsRef=useRef<OrbitControlsImpl|null>(null);

  const recenter=(distance:number)=>{
    const controls=controlsRef.current;
    // Preserve whatever orbit angle the user last dragged to; only the distance
    // (how far the camera pulls back for this level) changes across focus/aspect
    // changes -- never snap the user's chosen viewing angle back to a default.
    const spherical:CameraSpherical=controls
      ? clampSpherical({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance})
      : {azimuth:0,polar:Math.PI/2,distance};
    camera.position.set(...sphericalToCartesian(spherical));
    camera.lookAt(0,0,0);
    controls?.target.set(0,0,0);
    controls?.update();
  };

  useEffect(()=>{
    const aspect=size.width/Math.max(1,size.height);
    const distance=aspect<0.72 ? cameraDistanceForLevel(focusType,true) : cameraDistanceForLevel(focusType,compact);
    recenter(distance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[compact,focusType,size.height,size.width]);

  useEffect(()=>{
    recenter(cameraDistanceForLevel(focusType,compact));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusId]);

  useEffect(()=>{
    // Manual keyboard orbit/zoom, scoped to the canvas element (not window) so it
    // never competes with the shell's own Alt+Arrow back/forward shortcuts. No
    // auto-rotation is ever applied here or above -- orbit is always user-driven.
    gl.domElement.tabIndex=0;
    const onKeyDown=(event:KeyboardEvent)=>{
      const controls=controlsRef.current;if(!controls)return;
      const current:CameraSpherical={azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance:controls.getDistance()};
      const next=applyCameraKey(current,event.key);
      if(!next)return;
      event.preventDefault();
      camera.position.set(...sphericalToCartesian(next));
      controls.update();
    };
    gl.domElement.addEventListener('keydown',onKeyDown);
    return()=>gl.domElement.removeEventListener('keydown',onKeyDown);
  },[camera,gl]);

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
    // autoRotate=false unconditionally -- no automatic orbit ever, orbit is always user-driven.
    autoRotate={false}
    minDistance={5}
    maxDistance={34}
    target={[0,0,0]}
  />;
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
  const ringMaterials=useMemo(()=>[0.12,0.19,0.27].map(opacity=>
    new MeshBasicMaterial({color:0x42bff4,transparent:true,opacity,depthWrite:false,depthTest:true})
  ),[]);
  const clusterMaterial=useMemo(()=>
    new MeshBasicMaterial({color:0x2d8fc7,transparent:true,opacity:0.14,depthWrite:false,depthTest:true})
  ,[]);
  const clusterNodes=useMemo(()=>nodes.filter(node=>node.id!==focusId&&['SYSTEM','DOMAIN','CAMPAIGN'].includes(String(node.type||'').toUpperCase())).slice(0,12),[focusId,nodes]);
  return <group aria-hidden="true">
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

function SceneContent({nodes,graph,labelIds,onLabels,onPick,reducedMotion,selectedId,focusId,focusType,compact,motion}:{
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
}){
  useFrame((_,delta)=>{
    const ids=new Set(nodes.map(node=>node.id));
    nodes.forEach(node=>{
      const goal=new Vector3(...node.position);
      motion.target.set(node.id,goal);
      if(!motion.current.has(node.id)) motion.current.set(node.id,motion.current.size?new Vector3(0,0,0):goal.clone());
      // Reduced motion: snap straight to the goal position instead of tweening --
      // no eased drift between subgraphs when the user has asked for less motion.
      if(reducedMotion) motion.current.get(node.id)!.copy(goal);
      else motion.current.get(node.id)!.lerp(goal,1-Math.pow(0.001,Math.min(delta,0.05)));
    });
    for(const id of motion.current.keys()) if(!ids.has(id)){motion.current.delete(id);motion.target.delete(id)}
  });
  return <>
    <CameraRig compact={compact} focusId={focusId} focusType={focusType}/>
    <OrbitalGuides nodes={nodes} focusId={focusId}/>
    {!reducedMotion&&<StarField/>}
    <InstancedNodes nodes={nodes} positions={motion.current} focusId={focusId} aura/>
    <InstancedFilaments edges={graph.edges} nodes={nodes} positions={motion.current} focusId={focusId} selectedId={selectedId}/>
    <InstancedNodes nodes={nodes} positions={motion.current} selectedId={selectedId} focusId={focusId} onNodeClick={onPick}/>
    <LabelProjector nodes={nodes} labelIds={labelIds} onLabels={onLabels} motion={motion} focusId={focusId} selectedId={selectedId}/>
  </>;
}

export function AtlasCanvas({graph,focusId,selectedId,onSelect,onOpen,reducedMotion,compact=false,loading=false}:Props){
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
  const nodes=useMemo(()=>buildOrbitalNodes(visible,focusId,graph?.edges||[]),[focusId,graph?.edges,visible]);
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

  const fallback=<div className="atlas-graph-renderer-fallback"><CanvasGraphFallback nodes={nodes} edges={sceneGraph.edges} labelIds={lod.labelIds} focusId={focusId} selectedId={selectedId} onNodeClick={handlePick} reducedMotion={reducedMotion} compact={compact}/><span className="atlas-graph-fallback-note">Renderer 3D indisponível · exploração preservada em Canvas</span></div>;
  if(!threeEnabled)return <div className="atlas-r3f-stage" ref={stageRef} data-render-active="true">{fallback}{loading&&<div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}</div>;
  return <div className="atlas-r3f-stage" ref={stageRef} data-render-active={renderActive ? 'true' : 'false'}>
    <CanvasErrorBoundary key={`${focusId}:${nodes.length}`} fallback={fallback}>
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
          labelIds={lod.labelIds}
          onLabels={setLabels}
          onPick={handlePick}
          reducedMotion={reducedMotion}
          selectedId={selectedId}
          focusId={focusId}
          focusType={focusType}
          compact={compact}
          motion={motion.current}
        />
      </Canvas>
      <LabelOverlay labels={labels} labelIds={lod.labelIds} selectedId={selectedId}/>
    </CanvasErrorBoundary>
    {loading && <div className="atlas-graph-transition" role="status">Carregando subgrafo…</div>}
  </div>;
}
