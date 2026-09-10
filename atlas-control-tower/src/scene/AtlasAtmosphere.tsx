import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  PointsMaterial,
  Vector3
} from 'three';
import { createAtlasRenderer, type AtlasRendererBackend } from './createRenderer';

function makeAtmosphere(){
  const group=new Group();
  const count=180;
  const positions=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const t=i*2.399963229728653;
    const r=2.2+((i*37)%97)/97*8.4;
    positions[i*3]=Math.cos(t)*r;
    positions[i*3+1]=Math.sin(t*1.31)*r*.58;
    positions[i*3+2]=-2.5+((i*53)%101)/101*8.6;
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(positions,3));
  const material=new PointsMaterial({
    color:new Color('#b69a73'),
    size:.045,
    sizeAttenuation:true,
    transparent:true,
    opacity:.42,
    depthWrite:false
  });
  group.add(new Points(geometry,material));

  for(const [radius,z,opacity] of [[4.1,-1.4,.18],[6.2,.3,.13],[8.2,1.8,.08]] as const){
    const points=Array.from({length:120},(_,i)=>{
      const a=i/120*Math.PI*2;
      return new Vector3(Math.cos(a)*radius,Math.sin(a)*radius*.43,z);
    });
    const ringGeometry=new BufferGeometry().setFromPoints(points);
    const ringMaterial=new LineBasicMaterial({
      color:new Color('#8f7452'),
      transparent:true,
      opacity,
      depthWrite:false
    });
    group.add(new LineLoop(ringGeometry,ringMaterial));
  }
  return group;
}

function AtmosphereField({reducedMotion}:{reducedMotion:boolean}){
  const root=useRef<Group>(null);
  const object=useMemo(()=>makeAtmosphere(),[]);
  useEffect(()=>()=>{object.traverse(item=>{
    const anyItem=item as any;
    anyItem.geometry?.dispose?.();
    if(Array.isArray(anyItem.material))anyItem.material.forEach((m:any)=>m.dispose?.());
    else anyItem.material?.dispose?.();
  })},[object]);

  useFrame(({clock,pointer})=>{
    if(!root.current)return;
    const t=reducedMotion?0:clock.elapsedTime;
    root.current.rotation.y=(reducedMotion?0:pointer.x*.045)+t*.006;
    root.current.rotation.x=(reducedMotion?0:-pointer.y*.028)-.05;
    root.current.position.x=reducedMotion?0:pointer.x*.16;
    root.current.position.y=reducedMotion?0:pointer.y*.11;
  });

  return <group ref={root}><primitive object={object}/></group>;
}

export function AtlasAtmosphere({reducedMotion=false}:{reducedMotion?:boolean}){
  const [backend,setBackend]=useState<AtlasRendererBackend>('webgl2');
  return <div className="bt-atmosphere" data-bt-atmosphere={backend} aria-hidden="true">
    <Canvas
      className="bt-atmosphere-canvas"
      dpr={[1,1.6]}
      camera={{position:[0,0,15],fov:46,near:.1,far:80}}
      gl={async defaults=>{
        const created=await createAtlasRenderer(defaults.canvas as HTMLCanvasElement);
        setBackend(created.backend);
        return created.renderer as never;
      }}
    >
      <color attach="background" args={['#0b0a08']}/>
      <AtmosphereField reducedMotion={reducedMotion}/>
    </Canvas>
    <span className="bt-backend-chip">{backend==='webgpu'?'WEBGPU':'WEBGL2 FALLBACK'}</span>
  </div>;
}
