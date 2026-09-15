import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { cameraDistanceForPresentation, MAX_DISTANCE, MIN_DISTANCE } from './camera-controls';
import { freeOrbitPose, pointerOrbitDelta, type FreeOrbitPose, type Vec3 } from './free-orbit.mjs';

type Props={
  compact:boolean;
  focusId:string;
  focusType:string|undefined;
  presentationMode:'spatial'|'canvas';
  reducedMotion:boolean;
};
type PointerSample={x:number;y:number;button:number;pointerType:string};
type Velocity={yaw:number;pitch:number};

const ORIGIN=new Vector3(0,0,0);
const HISTORY_LIMIT=48;
const EPS=1e-5;

function tuple(value:Vector3):Vec3{return [value.x,value.y,value.z]}
function distanceToTarget(position:Vector3,target:Vector3){return Math.max(EPS,position.distanceTo(target))}
function clampDistance(value:number){return Math.min(MAX_DISTANCE,Math.max(MIN_DISTANCE,value))}

export function SpatialCameraRig({compact,focusId,focusType,presentationMode,reducedMotion}:Props){
  const {camera,gl,size}=useThree();
  const targetRef=useRef(new Vector3(0,0,0));
  const historyRef=useRef<FreeOrbitPose[]>([]);
  const restoringRef=useRef(false);
  const pointersRef=useRef(new Map<number,PointerSample>());
  const gestureStartRef=useRef<FreeOrbitPose|null>(null);
  const gestureRecordedRef=useRef(false);
  const velocityRef=useRef<Velocity>({yaw:0,pitch:0});
  const lastWheelHistoryAtRef=useRef(0);

  const snapshot=():FreeOrbitPose=>({position:tuple(camera.position),up:tuple(camera.up),target:tuple(targetRef.current)});
  const pushHistory=(pose=snapshot())=>{
    historyRef.current.push(pose);
    if(historyRef.current.length>HISTORY_LIMIT)historyRef.current.splice(0,historyRef.current.length-HISTORY_LIMIT);
  };
  const applyPose=(pose:FreeOrbitPose)=>{
    camera.position.set(...pose.position);
    camera.up.set(...pose.up).normalize();
    targetRef.current.set(...pose.target);
    camera.lookAt(targetRef.current);
    camera.updateMatrixWorld();
  };
  const orbit=(yaw:number,pitch:number)=>{
    if(Math.abs(yaw)<EPS&&Math.abs(pitch)<EPS)return;
    applyPose(freeOrbitPose({...snapshot(),deltaYaw:yaw,deltaPitch:pitch}));
  };
  const zoom=(factor:number)=>{
    if(!Number.isFinite(factor)||factor<=0)return;
    const target=targetRef.current;
    const offset=camera.position.clone().sub(target);
    const current=Math.max(EPS,offset.length());
    const next=clampDistance(current*factor);
    camera.position.copy(target).add(offset.multiplyScalar(next/current));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const pan=(dx:number,dy:number)=>{
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||(Math.abs(dx)<EPS&&Math.abs(dy)<EPS))return;
    const target=targetRef.current;
    const forward=new Vector3();camera.getWorldDirection(forward).normalize();
    const right=forward.clone().cross(camera.up).normalize();
    const up=camera.up.clone().normalize();
    const perspective=camera as PerspectiveCamera;
    const fov=Number.isFinite(perspective.fov)?perspective.fov:48;
    const worldHeight=2*distanceToTarget(camera.position,target)*Math.tan((fov*Math.PI/180)/2);
    const worldPerPixel=worldHeight/Math.max(1,size.height);
    const delta=right.multiplyScalar(-dx*worldPerPixel).add(up.multiplyScalar(dy*worldPerPixel));
    camera.position.add(delta);target.add(delta);
    camera.lookAt(target);camera.updateMatrixWorld();
  };
  const recenter=(distance:number,resetTarget=false)=>{
    const target=resetTarget?ORIGIN.clone():targetRef.current.clone();
    const offset=camera.position.clone().sub(targetRef.current);
    const direction=offset.lengthSq()>EPS?offset.normalize():new Vector3(0,0,1);
    targetRef.current.copy(target);
    camera.position.copy(target).add(direction.multiplyScalar(clampDistance(distance)));
    camera.lookAt(target);camera.updateMatrixWorld();
  };
  const recordGestureHistory=()=>{
    if(gestureRecordedRef.current)return;
    pushHistory(gestureStartRef.current||snapshot());
    gestureRecordedRef.current=true;
  };

  useFrame((_,delta)=>{
    if(reducedMotion||pointersRef.current.size>0)return;
    const velocity=velocityRef.current;
    if(Math.abs(velocity.yaw)<EPS&&Math.abs(velocity.pitch)<EPS)return;
    orbit(velocity.yaw,velocity.pitch);
    const decay=Math.pow(0.025,Math.min(0.05,Math.max(0,delta)));
    velocity.yaw*=decay;velocity.pitch*=decay;
    if(Math.abs(velocity.yaw)<EPS)velocity.yaw=0;
    if(Math.abs(velocity.pitch)<EPS)velocity.pitch=0;
  });

  useEffect(()=>{
    const aspect=size.width/Math.max(1,size.height);
    recenter(cameraDistanceForPresentation(focusType,compact,aspect,presentationMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[compact,focusType,presentationMode,size.height,size.width]);

  useEffect(()=>{
    if(restoringRef.current){restoringRef.current=false;return;}
    recenter(cameraDistanceForPresentation(focusType,compact,size.width/Math.max(1,size.height),presentationMode),true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[focusId,presentationMode]);

  useEffect(()=>{
    const element=gl.domElement;
    element.tabIndex=0;
    element.style.touchAction='none';

    const onPointerDown=(event:PointerEvent)=>{
      if(event.pointerType==='mouse'&&event.button>2)return;
      try{element.setPointerCapture(event.pointerId)}catch{}
      pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY,button:event.button,pointerType:event.pointerType});
      if(pointersRef.current.size===1){
        gestureStartRef.current=snapshot();gestureRecordedRef.current=false;velocityRef.current={yaw:0,pitch:0};
      }
    };
    const onPointerMove=(event:PointerEvent)=>{
      const previous=pointersRef.current.get(event.pointerId);if(!previous)return;
      const before=[...pointersRef.current.entries()].map(([id,p])=>[id,{...p}] as const);
      pointersRef.current.set(event.pointerId,{...previous,x:event.clientX,y:event.clientY});
      const after=[...pointersRef.current.entries()];

      if(after.length===1){
        const sample=after[0][1];const dx=sample.x-previous.x;const dy=sample.y-previous.y;
        if(Math.abs(dx)+Math.abs(dy)<0.25)return;
        recordGestureHistory();
        if(sample.pointerType==='mouse'&&(sample.button===1||sample.button===2||event.shiftKey)){
          pan(dx,dy);velocityRef.current={yaw:0,pitch:0};
        }else{
          const delta=pointerOrbitDelta({dx,dy,width:size.width,height:size.height,sensitivity:presentationMode==='canvas'?0.45:0.92});
          orbit(delta.deltaYaw,delta.deltaPitch);
          velocityRef.current=reducedMotion?{yaw:0,pitch:0}:{yaw:delta.deltaYaw*0.68,pitch:delta.deltaPitch*0.68};
        }
        event.preventDefault();return;
      }

      if(after.length>=2){
        const old=before.slice(0,2).map(([,p])=>p);const next=after.slice(0,2).map(([,p])=>p);
        if(old.length<2||next.length<2)return;
        recordGestureHistory();velocityRef.current={yaw:0,pitch:0};
        const oldCx=(old[0].x+old[1].x)/2,oldCy=(old[0].y+old[1].y)/2;
        const newCx=(next[0].x+next[1].x)/2,newCy=(next[0].y+next[1].y)/2;
        pan(newCx-oldCx,newCy-oldCy);
        const oldSpan=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y);
        const newSpan=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y);
        if(oldSpan>2&&newSpan>2)zoom(oldSpan/newSpan);
        event.preventDefault();
      }
    };
    const release=(event:PointerEvent)=>{
      pointersRef.current.delete(event.pointerId);
      try{element.releasePointerCapture(event.pointerId)}catch{}
      if(pointersRef.current.size===0){gestureStartRef.current=null;gestureRecordedRef.current=false;}
      else{
        const next=[...pointersRef.current.values()][0];gestureStartRef.current=snapshot();gestureRecordedRef.current=false;
        pointersRef.current.set(event.pointerId,{...next});
      }
      if(reducedMotion)velocityRef.current={yaw:0,pitch:0};
    };
    const onWheel=(event:WheelEvent)=>{
      event.preventDefault();
      const now=performance.now();
      if(now-lastWheelHistoryAtRef.current>260){pushHistory();lastWheelHistoryAtRef.current=now;}
      zoom(Math.exp(Math.max(-120,Math.min(120,event.deltaY))*0.0018));
    };
    const onContextMenu=(event:MouseEvent)=>event.preventDefault();
    const onKeyDown=(event:KeyboardEvent)=>{
      const orbitStep=0.12;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_'].includes(event.key))pushHistory();
      switch(event.key){
        case 'ArrowLeft': orbit(-orbitStep,0);break;
        case 'ArrowRight': orbit(orbitStep,0);break;
        case 'ArrowUp': orbit(0,-orbitStep);break;
        case 'ArrowDown': orbit(0,orbitStep);break;
        case '+':case '=': zoom(0.9);break;
        case '-':case '_': zoom(1.1);break;
        default:return;
      }
      event.preventDefault();
    };

    element.addEventListener('pointerdown',onPointerDown);
    element.addEventListener('pointermove',onPointerMove,{passive:false});
    element.addEventListener('pointerup',release);
    element.addEventListener('pointercancel',release);
    element.addEventListener('wheel',onWheel,{passive:false});
    element.addEventListener('contextmenu',onContextMenu);
    element.addEventListener('keydown',onKeyDown);
    return()=>{
      element.removeEventListener('pointerdown',onPointerDown);
      element.removeEventListener('pointermove',onPointerMove);
      element.removeEventListener('pointerup',release);
      element.removeEventListener('pointercancel',release);
      element.removeEventListener('wheel',onWheel);
      element.removeEventListener('contextmenu',onContextMenu);
      element.removeEventListener('keydown',onKeyDown);
    };
  },[camera,gl,presentationMode,reducedMotion,size.height,size.width]);

  useEffect(()=>{
    const reset=()=>{
      historyRef.current=[];velocityRef.current={yaw:0,pitch:0};targetRef.current.set(0,0,0);
      camera.position.set(0,0,cameraDistanceForPresentation(undefined,compact,size.width/Math.max(1,size.height),presentationMode));
      camera.up.set(0,1,0);camera.lookAt(targetRef.current);camera.updateMatrixWorld();
    };
    const back=()=>{
      const previous=historyRef.current.pop();if(!previous)return;
      velocityRef.current={yaw:0,pitch:0};restoringRef.current=true;applyPose(previous);
    };
    const fitSelection=()=>{
      pushHistory();velocityRef.current={yaw:0,pitch:0};
      recenter(cameraDistanceForPresentation(focusType,compact,size.width/Math.max(1,size.height),presentationMode));
    };
    const axis=(event:Event)=>{
      const detail=(event as CustomEvent<{axis?:string}>).detail||{};
      const distance=distanceToTarget(camera.position,targetRef.current);pushHistory();velocityRef.current={yaw:0,pitch:0};
      const target=targetRef.current.clone();
      if(detail.axis==='right'){camera.position.copy(target).add(new Vector3(distance,0,0));camera.up.set(0,1,0);}
      else if(detail.axis==='top'){camera.position.copy(target).add(new Vector3(0,distance,0));camera.up.set(0,0,-1);}
      else {camera.position.copy(target).add(new Vector3(0,0,distance));camera.up.set(0,1,0);}
      camera.lookAt(target);camera.updateMatrixWorld();
    };
    window.addEventListener('atlas:reset-view',reset);
    window.addEventListener('atlas:camera-back',back);
    window.addEventListener('atlas:fit-selection',fitSelection);
    window.addEventListener('atlas:camera-axis',axis);
    return()=>{
      window.removeEventListener('atlas:reset-view',reset);
      window.removeEventListener('atlas:camera-back',back);
      window.removeEventListener('atlas:fit-selection',fitSelection);
      window.removeEventListener('atlas:camera-axis',axis);
    };
  },[camera,compact,focusType,presentationMode,size.height,size.width]);

  return null;
}
