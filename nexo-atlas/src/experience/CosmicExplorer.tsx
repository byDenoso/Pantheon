import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {useLocale} from '../atlas/ui/LocaleProvider.tsx';
const Orbit=lazy(()=>import('./RiveOrbit.tsx'));
const galaxies=Array.from({length:25},(_,i)=>({x:100+(i%5)*75,y:70+Math.floor(i/5)*55}));
function Illustration({expansion}:{expansion:number}){
  const scale=1+expansion*.006,x=(v:number)=>250+(v-250)*scale,y=(v:number)=>180+(v-180)*scale;
  return <svg className="nx-cosmic-fallback" viewBox="0 0 500 360" aria-hidden="true">
    <g stroke="var(--line)" strokeWidth="1" opacity=".5">{[100,175,250,325,400].map(v=><line key={v} x1={x(v)} x2={x(v)} y1="0" y2="360"/>)}{[70,125,180,235,290].map(v=><line key={v} x1="0" x2="500" y1={y(v)} y2={y(v)}/>)}</g>
    {galaxies.map((g,i)=><g key={i} transform={`translate(${x(g.x)} ${y(g.y)}) rotate(${i*37%120-60})`}><ellipse rx="6" ry="2.8" fill="var(--cyan)"/><ellipse rx="2.5" ry="1.2" fill="var(--fg)"/></g>)}
  </svg>;
}
export default function CosmicExplorer(){
  const en=useLocale()==='en',root=useRef<HTMLElement>(null);
  const [paused,setPaused]=useState(false),[systemPaused,setSystemPaused]=useState(true),[expansion,setExpansion]=useState(0);
  useEffect(()=>{
    const node=root.current;if(!node)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)'),shell=node.closest<HTMLElement>('.atlas-app');
    let visible=!('IntersectionObserver' in window);
    const update=()=>setSystemPaused(document.hidden||!visible||media.matches||shell?.dataset.cinemaPaused==='true');
    const preference=()=>{if(media.matches)setExpansion(100);update();};
    const observer=new MutationObserver(update);if(shell)observer.observe(shell,{attributes:true,attributeFilter:['data-cinema-paused']});
    const intersection='IntersectionObserver' in window?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();}):null;
    intersection?.observe(node);media.addEventListener('change',preference);document.addEventListener('visibilitychange',update);preference();
    return()=>{observer.disconnect();intersection?.disconnect();media.removeEventListener('change',preference);document.removeEventListener('visibilitychange',update);};
  },[]);
  const running=!paused&&!systemPaused;
  useEffect(()=>{
    if(!running)return;let frame=0,last=0;
    const tick=(now:number)=>{const dt=last?Math.min(now-last,64):0;last=now;setExpansion(value=>Math.min(100,value+dt/200));frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[running]);
  useEffect(()=>{if(expansion>=100)setPaused(true);},[expansion]);
  const reset=()=>{setExpansion(0);setPaused(true);};
  const play=()=>{if(expansion>=100)setExpansion(0);setPaused(value=>!value);};
  const factor=(1+expansion*.006).toFixed(2).replace('.',en?'.':',');
  return <figure ref={root} className="atlas-hero-art nx-explorer" data-running={running} data-webgl="false">
    <div className="nx-scene-top"><span className="nx-scene-label"><Suspense fallback={<i/>}><Orbit active={running}/></Suspense>{en?'Explore the Universe':'Explore o Universo'}</span><span className="nx-scene-index">a = {factor}×</span></div>
    <div className="nx-scene-stage" role="img" aria-label={en?'Galaxies keep their size while the distances between them grow':'As galáxias mantêm seu tamanho enquanto as distâncias entre elas crescem'}>
      <Illustration expansion={expansion}/>
      <span className="nx-scene-coordinate" aria-hidden="true">NEXO / OBSERVATÓRIO</span>
    </div>
    <div className="nx-scene-controls"><span>{en?'Expansion of space':'Expansão do espaço'}</span><button className="nx-scene-pause" type="button" onClick={play} aria-pressed={paused} disabled={systemPaused}>{running?'Ⅱ':'▶'} {running?(en?'Pause':'Pausar'):(en?'Play':'Animar')}</button><button type="button" className="nx-scene-reset" onClick={reset} aria-label={en?'Reset illustration':'Restaurar ilustração'}>↺</button></div>
    <label className="nx-expansion-range">{en?'Expand the illustration':'Expanda a ilustração'}<input type="range" min="0" max="100" step="1" value={expansion} aria-valuetext={`${factor}×`} onChange={event=>{setExpansion(Number(event.target.value));setPaused(true);}}/></label>
    <figcaption><strong>{en?'Distances grow with expansion.':'As distâncias crescem com a expansão.'}</strong><span>{en?'Galaxies keep their size. Conceptual illustration, without observed data.':'As galáxias mantêm seu tamanho. Ilustração conceitual, sem dados observacionais.'}</span></figcaption>
  </figure>;
}
