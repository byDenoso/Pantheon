import { useMemo } from 'react';
import { filamentPath, layoutLearningMesh } from '../data/learning-layout';

type Props={
 model:any;
 selectedId?:string|null;
 onSelect?:(id:string)=>void;
 reducedMotion?:boolean;
};

const stageClass=(stage?:string)=>String(stage||'unknown').toLowerCase();
const filamentClass=(type?:string)=>String(type||'association').toLowerCase();

export function LearningMesh({model,selectedId,onSelect,reducedMotion=false}:Props){
 const layout=useMemo(()=>layoutLearningMesh(model),[model]);
 return <div className="learning-mesh-wrap">
  <svg className="learning-mesh" viewBox="0 0 1000 620" role="img" aria-label="Mapa neural dos aprendizados entre contextos">
   <defs>
    <filter id="learning-glow" x="-40%" y="-40%" width="180%" height="180%">
     <feGaussianBlur stdDeviation="4" result="blur"/>
     <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="learning-node" cx="35%" cy="30%"><stop offset="0" stopColor="#d9f3ff"/><stop offset="1" stopColor="#6d7df0"/></radialGradient>
   </defs>
   <g className="learning-filaments" aria-hidden="true">
    {layout.filaments.map((filament:any)=>{
     const d=filamentPath(filament,layout.byId);
     const kind=filamentClass(filament.type);
     return <g key={String(filament.id)} className={`learning-filament ${kind}`}>
      <path className="learning-filament-glow" d={d} vectorEffect="non-scaling-stroke"/>
      <path className="learning-filament-line" d={d} vectorEffect="non-scaling-stroke"/>
      {!reducedMotion&&kind==='transfer'&&<circle className="learning-pulse" r="3.5">
       <animateMotion dur="4.8s" repeatCount="indefinite" path={d}/>
      </circle>}
     </g>;
    })}
   </g>
   <g className="learning-items">
    {layout.points.filter((point:any)=>point.kind==='item').map((point:any)=>{
     const [x,y]=point.position;
     const selected=selectedId===point.id;
     return <g key={point.id} className={`learning-item ${stageClass(point.stage)}${selected?' selected':''}`}
       transform={`translate(${x} ${y})`} onClick={()=>onSelect?.(point.id)} role="button" tabIndex={0}
       onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')onSelect?.(point.id)}}>
      <circle className="learning-item-halo" r={selected?11:7}/>
      <circle className="learning-item-core" r={selected?5.5:3.6}/>
      <title>{point.label}</title>
     </g>;
    })}
   </g>
   <g className="learning-contexts">
    {layout.points.filter((point:any)=>point.kind==='context').map((point:any)=>{
     const [x,y]=point.position;
     return <g key={point.id} className="learning-context" transform={`translate(${x} ${y})`}>
      <circle className="learning-context-halo" r="31"/>
      <circle className="learning-context-core" r="18"/>
      <text className="learning-context-label" y="45" textAnchor="middle">{point.label}</text>
     </g>;
    })}
   </g>
   {selectedId&&layout.byId.has(selectedId)&&(()=>{
    const point=layout.byId.get(selectedId)!;
    if(point.kind!=='item')return null;
    return <text className="learning-selected-label" x={point.position[0]} y={point.position[1]-16} textAnchor="middle">{point.label}</text>;
   })()}
  </svg>
 </div>;
}
