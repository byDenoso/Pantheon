import {Suspense,useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useLoader,useThree} from '@react-three/fiber';
import {AdditiveBlending,Color,Group,ShaderMaterial} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {cosmicGeometry} from './cosmic-geometry.ts';

export type Geometry=ReturnType<typeof cosmicGeometry>;
const modelUrl=new URL('./assets/orbital-lens.glb',import.meta.url).href;
const vertex=`attribute float size; uniform float expansion; uniform float pixelRatio; varying float depth;
void main(){vec4 p=modelViewMatrix*vec4(position*expansion,1.);depth=clamp((-p.z-3.)/10.,0.,1.);gl_PointSize=clamp(size*pixelRatio*22./-p.z,1.,15.);gl_Position=projectionMatrix*p;}`;
const fragment=`uniform vec3 tint; varying float depth;
void main(){float r=length(gl_PointCoord-.5);float core=exp(-r*r*36.);float halo=exp(-r*r*9.)*.3;float alpha=(core+halo)*(1.-depth*.65);gl_FragColor=vec4(mix(tint,vec3(.9,.98,1.),core*.8),alpha);}`;

function CameraControls({running,resetKey}:{running:boolean;resetKey:number}){
  const {camera,gl,invalidate}=useThree();
  const controls=useRef<OrbitControls|null>(null);
  useEffect(()=>{const c=new OrbitControls(camera,gl.domElement);const changed=()=>invalidate();c.enablePan=false;c.enableZoom=false;c.enableDamping=false;c.autoRotateSpeed=.22;c.addEventListener('change',changed);controls.current=c;return()=>{c.removeEventListener('change',changed);c.dispose();};},[camera,gl,invalidate]);
  useEffect(()=>{controls.current?.reset();invalidate();},[resetKey,invalidate]);
  useFrame((_,delta)=>{if(controls.current){controls.current.autoRotate=running;controls.current.update(Math.min(delta,.05));}});
  return null;
}
function Lens(){
  const model=useLoader(GLTFLoader,modelUrl);
  return <primitive object={model.scene} scale={.62} rotation={[.3,.4,.2]}/>;
}
function Universe({geometry,expansion,dark,running,resetKey}:{geometry:Geometry;expansion:number;dark:boolean;running:boolean;resetKey:number}){
  const material=useRef<ShaderMaterial>(null),group=useRef<Group>(null);
  const uniforms=useMemo(()=>({expansion:{value:expansion},pixelRatio:{value:1},tint:{value:new Color('#59d9fa')}}),[]);
  const {invalidate,viewport}=useThree();
  useEffect(()=>{if(material.current){material.current.uniforms.expansion!.value=expansion;material.current.uniforms.pixelRatio!.value=viewport.dpr;material.current.uniforms.tint!.value.set(dark?'#43cdeb':'#087baf');}invalidate();},[expansion,dark,invalidate,viewport.dpr]);
  useFrame((_,dt)=>{if(running&&group.current)group.current.rotation.z+=Math.min(dt,.05)*.009;});
  return <><CameraControls running={running} resetKey={resetKey}/><group ref={group} rotation={[.15,.2,0]}>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[geometry.positions,3]}/><bufferAttribute attach="attributes-size" args={[geometry.sizes,1]}/></bufferGeometry><shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent depthWrite={false} blending={dark?AdditiveBlending:undefined}/></points>
    <Suspense fallback={null}><Lens/></Suspense>
  </group></>;
}
export default function CosmicScene({geometry,expansion,dark,running,resetKey,onReady}:{geometry:Geometry;expansion:number;dark:boolean;running:boolean;resetKey:number;onReady:()=>void}){
  return <Canvas camera={{position:[0,.3,8.6],fov:46}} dpr={[1,1.5]} gl={{alpha:true,antialias:false,powerPreference:'low-power'}} frameloop={running?'always':'demand'} fallback={null} onCreated={({gl})=>{gl.setClearAlpha(0);onReady();}}><Universe geometry={geometry} expansion={expansion} dark={dark} running={running} resetKey={resetKey}/></Canvas>;
}
