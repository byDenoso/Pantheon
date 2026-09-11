import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { filamentPath, layoutLearningMesh } from '../data/learning-layout';

type Props={model:any;selectedId?:string|null;onSelect?:(id:string)=>void;reducedMotion?:boolean};
const stageClass=(stage?:string)=>String(stage||'unknown').toLowerCase();
const filamentClass=(type?:string)=>String(type||'association').toLowerCase();
const contextRoute=(id?:string|null)=>({science:'/universes/science',engineering:'/universes/engineering',olympus:'/universes/olympus',ai:'/universes/ai',operation:'/operations'}[String(id||'').toLowerCase()]||'');

export function LearningMesh({model,selectedId,onSelect,reducedMotion=false}:Props){
 const navigate=useNavigate();
 const layout=useMemo(()=>layoutLearningMesh(model),[model]);
 return <div className="learning-mesh-wrap">
  <svg className="learning-mesh" viewBox="0 0 1000 620" role="img" aria-label="Mapa neural dos aprendizados entre contextos">
   <defs>
    <filter id="learning-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="learning-node" cx="35%" cy="30%"><stop offset="0" stopColor="#d9f3ff"/><stop offset="1" stopColor="#6d7df0"/></radialGradient>
    <linearGradient id="learning-depth-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#4fd6f0" stopOpacity=".2"/><stop offset=".5" stopColor="#6e63ed" stopOpacity=".08"/><stop offset="1" stopColor="#d5a761" stopOpacity=".14"/></linearGradient>
   </defs>
   <g className="learning-depth-planes" aria-hidden="true">
    <ellipse className="learning-depth-plane p1" cx="500" cy="335" rx="410" ry="220"/><ellipse className="learning-depth-plane p2" cx="500" cy="335" rx="315" ry="165"/><ellipse className="learning-depth-plane p3" cx="500" cy="335" rx="215" ry="110"/>
    <text className="learning-depth-label" x="500" y="310" textAnchor="middle">LEARNING RELATIONS</text>
   </g>
   <g className="learning-filaments" aria-hidden="true">
    {layout.filaments.map((filament:any)=>{const d=filamentPath(filament,layout.byId);const kind=filamentClass(filament.type);return <g key={String(filament.id)} className={`learning-filament ${kind}`}><path className="learning-filament-glow" d={d} vectorEffect="non-scaling-stroke"/><path className="learning-filament-line" d={d} vectorEffect="non-scaling-stroke"/>{!reducedMotion&&kind==='transfer'&&<circle className="learning-pulse" r="3.5"><animateMotion dur="4.8s" repeatCount="indefinite" path={d}/></circle>}</g>})}
   </g>
   <g className="learning-items">
    {layout.points.filter((point:any)=>point.kind==='item').map((point:any)=>{const [x,y]=point.position;const selected=selectedId===point.id;return <g key={point.id} className={`learning-item ${stageClass(point.stage)}${selected?' selected':''}`} transform={`translate(${x} ${y})`} onClick={()=>onSelect?.(point.id)} role="button" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')onSelect?.(point.id)}}><circle className="learning-item-halo" r={selected?11:7}/><circle className="learning-item-core" r={selected?5.5:3.6}/><title>{point.label}</title></g>})}
   </g>
   <g className="learning-contexts">
    {layout.points.filter((point:any)=>point.kind==='context').map((point:any)=>{const [x,y]=point.position;const route=contextRoute(point.contextId);return <g key={point.id} className={`learning-context ${route?'navigable':''}`} transform={`translate(${x} ${y})`} role={route?'button':undefined} tabIndex={route?0:undefined} onClick={()=>route&&navigate(route)} onKeyDown={event=>{if(route&&(event.key==='Enter'||event.key===' ')){event.preventDefault();navigate(route)}}}><circle className="learning-context-orbit" r="39"/><circle className="learning-context-halo" r="31"/><circle className="learning-context-core" r="18"/><text className="learning-context-label" y="48" textAnchor="middle">{point.label}</text>{route&&<text className="learning-context-hint" y="62" textAnchor="middle">abrir contexto ↗</text>}</g>})}
   </g>
   {selectedId&&layout.byId.has(selectedId)&&(()=>{const point=layout.byId.get(selectedId)!;if(point.kind!=='item')return null;return <text className="learning-selected-label" x={point.position[0]} y={point.position[1]-16} textAnchor="middle">{point.label}</text>})()}
  </svg>
 </div>;
}
