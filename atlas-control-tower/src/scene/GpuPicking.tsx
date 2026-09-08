import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Scene } from 'three';
import { GpuPickingBuffer, type PickRenderer } from './gpu-picking';

type Props={
  pickScene: Scene;
  idToNode: Map<number,string>;
  onPick:(id:string|null)=>void;
  onHover?:(id:string|null)=>void;
  enabled?:boolean;
};

export function GpuPicking({pickScene,idToNode,onPick,onHover,enabled=true}:Props){
  const {gl,camera,size}=useThree();
  const buffer=useRef<GpuPickingBuffer|null>(null);
  const busy=useRef(false);
  const hoverTimer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    const target=new GpuPickingBuffer(1,1);
    buffer.current=target;
    return()=>{target.dispose();buffer.current=null};
  },[]);

  useEffect(()=>{
    if(!enabled)return;
    const canvas=gl.domElement;
    const renderer=gl as unknown as PickRenderer & {
      getPixelRatio?:()=>number;
      getRenderTarget?:()=>unknown;
      renderAsync?:(scene:Scene,camera:unknown)=>Promise<void>;
    };

    const perform=async(event:PointerEvent,commit:boolean)=>{
      if(busy.current||!buffer.current)return;
      busy.current=true;
      try{
        const rect=canvas.getBoundingClientRect();
        const dpr=renderer.getPixelRatio?.()||globalThis.devicePixelRatio||1;
        const width=Math.max(1,Math.round(size.width*dpr));
        const height=Math.max(1,Math.round(size.height*dpr));
        buffer.current.resize(width,height);
        const previous=renderer.getRenderTarget?.()||null;
        renderer.setRenderTarget(buffer.current.target);
        if(renderer.renderAsync)await renderer.renderAsync(pickScene,camera);
        else renderer.render(pickScene,camera);
        const x=Math.max(0,Math.min(width-1,Math.floor((event.clientX-rect.left)*dpr)));
        const y=Math.max(0,Math.min(height-1,Math.floor((rect.bottom-event.clientY)*dpr)));
        const pickId=await buffer.current.read(renderer,x,y);
        renderer.setRenderTarget(previous as never);
        const nodeId=idToNode.get(pickId)||null;
        if(commit)onPick(nodeId);else onHover?.(nodeId);
      }finally{busy.current=false}
    };

    const move=(event:PointerEvent)=>{
      if(hoverTimer.current)globalThis.clearTimeout(hoverTimer.current);
      hoverTimer.current=globalThis.setTimeout(()=>perform(event,false),42) as unknown as number;
    };
    const click=(event:PointerEvent)=>{void perform(event,true)};
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',click);
    return()=>{
      canvas.removeEventListener('pointermove',move);
      canvas.removeEventListener('pointerup',click);
      if(hoverTimer.current)globalThis.clearTimeout(hoverTimer.current);
    };
  },[camera,enabled,gl,idToNode,onHover,onPick,pickScene,size.height,size.width]);

  return null;
}
