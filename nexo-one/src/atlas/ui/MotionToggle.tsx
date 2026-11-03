import {useEffect,useState} from 'react';
export default function MotionToggle({en=false}:{en?:boolean}){
  const [paused,setPaused]=useState(()=>{try{return localStorage.getItem('nexo.motion.paused')==='true';}catch{return false;}});
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{document.documentElement.dataset.motion=paused||reduced?'paused':'auto';try{localStorage.setItem('nexo.motion.paused',String(paused));}catch{}},[paused,reduced]);
  return <button type="button" className="ck-btn quiet atlas-btn nx-motion-toggle" aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(value=>!value)}>{reduced?(en?'Reduced motion':'Movimento reduzido'):paused?(en?'Play animations':'Animar'):(en?'Pause animations':'Pausar animações')}</button>;
}
