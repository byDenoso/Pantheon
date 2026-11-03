import {Component,lazy,Suspense,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocale} from '../atlas/ui/LocaleProvider.tsx';
import {cosmicGeometry} from './cosmic-geometry.ts';
import type {Geometry} from './CosmicScene.tsx';
import {MotionConfig,motion} from 'motion/react';
const Scene=lazy(()=>import('./CosmicScene.tsx'));
const Orbit=lazy(()=>import('./RiveOrbit.tsx'));
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode;onError:()=>void},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(){this.props.onError();}render(){return this.state.failed?this.props.fallback:this.props.children;}}
function Illustration({expansion}:{expansion:number}){return <svg className="nx-cosmic-fallback" viewBox="0 0 500 360" aria-hidden="true"><defs><radialGradient id="nx-glow"><stop stopColor="#55dcfa" stopOpacity=".3"/><stop offset="1" stopColor="#55dcfa" stopOpacity="0"/></radialGradient></defs><circle cx="250" cy="180" r="170" fill="url(#nx-glow)"/><g transform={`translate(250 180) scale(${1+expansion/250}) translate(-250 -180)`}>{[0,45,90,135].map(angle=><ellipse key={angle} cx="250" cy="180" rx="130" ry="46" transform={`rotate(${angle} 250 180)`} fill="none" stroke="#53cfe9" strokeOpacity=".5"/>)}<circle cx="250" cy="180" r="6" fill="#dbfaff"/></g></svg>;}
export default function CosmicExplorer(){
  const en=useLocale()==='en',root=useRef<HTMLElement>(null);
  const [geometry,setGeometry]=useState<Geometry|null>(null),[paused,setPaused]=useState(false),[systemPaused,setSystemPaused]=useState(true),[dark,setDark]=useState(true),[expansion,setExpansion]=useState(0),[mode,setMode]=useState<'web'|'expansion'>('web'),[resetKey,setResetKey]=useState(0);
  const [webglReady,setWebglReady]=useState(false);
  const sceneReady=useCallback(()=>setWebglReady(true),[]),sceneFailed=useCallback(()=>setWebglReady(false),[]);
  useEffect(()=>{
    let disposed=false;let worker:Worker|undefined;
    const count=window.innerWidth<700?3200:8000;
    try{worker=new Worker(new URL('./cosmic.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{if(!disposed)setGeometry(e.data);};worker.onerror=()=>{if(!disposed)setGeometry(cosmicGeometry(count));worker?.terminate();};worker.postMessage({count});}
    catch{setGeometry(cosmicGeometry(count));}
    return()=>{disposed=true;worker?.terminate();};
  },[]);
  useEffect(()=>{
    const node=root.current;if(!node)return;let visible=true;
    const media=matchMedia('(prefers-reduced-motion: reduce)'),shell=node.closest<HTMLElement>('.atlas-app');
    const update=()=>{setDark(document.documentElement.dataset.theme!=='light');setSystemPaused(document.hidden||!visible||media.matches||shell?.dataset.cinemaPaused==='true');};
    const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});if(shell)observer.observe(shell,{attributes:true,attributeFilter:['data-cinema-paused']});
    const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();});intersection.observe(node);
    media.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
    return()=>{observer.disconnect();intersection.disconnect();media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  const running=!paused&&!systemPaused;
  const reset=()=>{setExpansion(0);setResetKey(n=>n+1);};
  return <MotionConfig reducedMotion="user"><figure ref={root} className="atlas-hero-art nx-explorer" data-running={running} data-webgl={webglReady}>
    <div className="nx-scene-top"><span className="nx-scene-label"><Suspense fallback={<i/>}><Orbit active={running}/></Suspense>{en?'Explore the Universe':'Explore o Universo'}</span><span className="nx-scene-index">01—02</span></div>
    <div className="nx-scene-stage" role="img" aria-label={en?'Conceptual, interactive three-dimensional cosmic web':'Teia cósmica tridimensional interativa e conceitual'}>
      <Illustration expansion={mode==='expansion'?expansion:0}/>
      {geometry&&<div className="nx-webgl"><SceneBoundary fallback={null} onError={sceneFailed}><Suspense fallback={null}><Scene geometry={geometry} expansion={mode==='expansion'?1+expansion/140:1} dark={dark} running={running} resetKey={resetKey} onReady={sceneReady}/></Suspense></SceneBoundary></div>}
      <span className="nx-scene-coordinate" aria-hidden="true">NEXO / OBSERVATÓRIO</span>
    </div>
    <div className="nx-scene-controls"><div className="nx-scene-tabs" role="group" aria-label={en?'Illustration':'Ilustração'}>{(['web','expansion'] as const).map(value=><motion.button whileTap={{scale:.96}} key={value} type="button" aria-pressed={mode===value} onClick={()=>{setMode(value);setExpansion(0);}}>{value==='web'?(en?'Cosmic web':'Teia cósmica'):(en?'Expansion':'Expansão')}</motion.button>)}</div>{webglReady&&<button className="nx-scene-pause" type="button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused} disabled={systemPaused}>{paused?'▶':'Ⅱ'} {paused?(en?'Play':'Animar'):(en?'Pause':'Pausar')}</button>}<button type="button" className="nx-scene-reset" onClick={reset} aria-label={en?'Reset illustration':'Restaurar ilustração'}>↺</button></div>
    {mode==='expansion'&&<label className="nx-expansion-range">{en?'Expand the illustration':'Expanda a ilustração'}<input type="range" min="0" max="100" step="1" value={expansion} onChange={event=>setExpansion(Number(event.target.value))}/></label>}
    <figcaption><strong>{mode==='web'?(en?'Matter forms a web.':'A matéria forma uma teia.'):(en?'Distances grow with expansion.':'As distâncias crescem com a expansão.')}</strong><span>{webglReady&&(en?'Drag to rotate · ':'Arraste para girar · ')}{en?'Conceptual illustration, without observed data.':'Ilustração conceitual, sem dados observacionais.'}</span></figcaption>
  </figure></MotionConfig>;
}
