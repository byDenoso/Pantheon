import {useEffect,useState} from 'react';
/** The guarded host sets this before mounting the runtime; storage is never read inside the frame. */
export const motionPaused = () => typeof document!=='undefined' && document.documentElement.dataset.motion==='paused';
export function useGlobalMotionPaused(){
  const [paused,setPaused]=useState(motionPaused);
  useEffect(()=>{const observer=new MutationObserver(()=>setPaused(motionPaused()));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});setPaused(motionPaused());return()=>observer.disconnect();},[]);
  return paused;
}
