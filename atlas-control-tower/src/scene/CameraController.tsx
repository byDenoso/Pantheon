import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pointerParallaxTarget} from './interaction.mjs';

type CameraCommand='reset'|'zoom-in'|'zoom-out'|'focus';
type Props={reducedMotion:boolean;autoOrbit:boolean};

const HOME=new Vector3(.35,.18,17.5);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function CameraController({reducedMotion,autoOrbit}:Props){
  const {camera,gl,size}=useThree();
  const controls=useRef<OrbitControls|null>(null);
  const parallax=useRef({yaw:0,pitch:0});

  useEffect(()=>{
    camera.position.copy(HOME);camera.lookAt(0,0,0);
    const next=new OrbitControls(camera,gl.domElement);
    next.enableDamping=true;
    next.dampingFactor=.085;
    next.enablePan=true;
    next.minDistance=4.8;
    next.maxDistance=36;
    next.rotateSpeed=.62;
    next.zoomSpeed=.8;
    next.autoRotate=autoOrbit&&!reducedMotion;
    next.autoRotateSpeed=.52;
    controls.current=next;

    const move=(event:PointerEvent)=>{
      if(reducedMotion||event.buttons!==0)return;
      const rect=gl.domElement.getBoundingClientRect();
      parallax.current=pointerParallaxTarget(event.clientX-rect.left,event.clientY-rect.top,rect.width||size.width,rect.height||size.height);
    };
    const leave=()=>{parallax.current={yaw:0,pitch:0}};
    const command=(event:Event)=>{
      const type=(event as CustomEvent<{type?:CameraCommand}>).detail?.type;
      if(!type||!controls.current)return;
      const orbit=controls.current;
      if(type==='reset'||type==='focus'){
        orbit.target.set(0,0,0);
        camera.position.copy(HOME);
        if(type==='focus')camera.position.setLength(13.8);
        camera.lookAt(orbit.target);
        orbit.update();
        return;
      }
      const offset=camera.position.clone().sub(orbit.target);
      const distance=clamp(offset.length()*(type==='zoom-in'?.82:1.22),orbit.minDistance,orbit.maxDistance);
      offset.setLength(distance);
      camera.position.copy(orbit.target.clone().add(offset));
      orbit.update();
    };

    gl.domElement.addEventListener('pointermove',move,{passive:true});
    gl.domElement.addEventListener('pointerleave',leave,{passive:true});
    window.addEventListener('atlas:camera-command',command as EventListener);
    return()=>{
      gl.domElement.removeEventListener('pointermove',move);
      gl.domElement.removeEventListener('pointerleave',leave);
      window.removeEventListener('atlas:camera-command',command as EventListener);
      next.dispose();controls.current=null;
    };
  },[camera,gl,reducedMotion,size.height,size.width]);

  useEffect(()=>{
    if(!controls.current)return;
    controls.current.autoRotate=autoOrbit&&!reducedMotion;
    controls.current.autoRotateSpeed=.52;
  },[autoOrbit,reducedMotion]);

  useFrame(()=>{
    const next=controls.current;if(!next)return;
    const px=reducedMotion?0:parallax.current.yaw*1.55;
    const py=reducedMotion?0:-parallax.current.pitch*1.22;
    next.target.x+=(px-next.target.x)*.065;
    next.target.y+=(py-next.target.y)*.065;
    next.update();
  });
  return null;
}
