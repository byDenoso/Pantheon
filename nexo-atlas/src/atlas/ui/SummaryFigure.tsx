import ArrowIcon from './ArrowIcon.tsx';
import {useState,useMemo,useRef,useEffect,type CSSProperties,type ReactNode} from 'react';
import type {PublicPlot} from '../publicVisuals.ts';
import type {Locale} from '../api.ts';
import {pick} from '../publicItems.ts';
import {presentLabel} from '../presentNumbers.ts';

// A configuration label joins several facts with "·". Each fragment gets its own span so a
// narrow screen can give every fact a line; the text content and its order never change.
function LabelParts({text}:{text:string}){const parts=text.split(' · ');return <>{parts.map((part,index)=><span key={index}>{index>0&&<span className="nexo-label-sep"> · </span>}<span className="nexo-label-part">{part}</span></span>)}</>;}
/** Categorical summaries: no reconstructed curves, moving estimates or invented uncertainty. */
const axisText=(axis:PublicPlot['x'],locale:Locale)=>`${pick(axis.label,locale)}${axis.unit?` (${axis.unit})`:''}`;
export default function SummaryFigure({plot,title,locale,children,comparison=false,selectedKey,onInspect,technicalRequest=0}:{plot:PublicPlot;title:string;locale:Locale;children:ReactNode;comparison?:boolean;selectedKey?:string|null;onInspect?:(key:string,origin:HTMLElement)=>void;technicalRequest?:number}){
 const en=locale==='en', [selected,setSelected]=useState(0),[technicalMounted,setTechnicalMounted]=useState(false);
 const technical=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{if(technicalRequest>0){setTechnicalMounted(true);if(technical.current)technical.current.open=true;}},[technicalRequest]);
 const rows=plot.series.flatMap(s=>s.points.map((p,index)=>({key:`${s.id}:${index}`,label:s.label,...p})));
 const activeIndex=selectedKey?Math.max(0,rows.findIndex(row=>row.key===selectedKey)):selected;
 const active=rows[activeIndex]??rows[0];
 const xAxis=axisText(plot.x,locale),yAxis=axisText(plot.y,locale);
 const formats=useMemo(()=>({normal:new Intl.NumberFormat(locale,{maximumSignificantDigits:21}),scientific:new Intl.NumberFormat(locale,{maximumSignificantDigits:21,notation:'scientific'})}),[locale]);
 const format=(n:number)=>(n!==0&&Math.abs(n)<.0001?formats.scientific:formats.normal).format(n);
 const percentage=plot.y.unit==='%'&&rows.every(p=>p.y>=0&&p.y<=100&&p.low===undefined);
 const min=Math.min(0,...rows.map(p=>p.low??p.y)),max=percentage?100:Math.max(0,...rows.map(p=>p.high??p.y));
 const span=max-min||1, position=(v:number)=>(v-min)/span*100;
 const interval=active.low!==undefined&&active.high!==undefined;
 const single=rows.length===1,scalar=single;
 return <div className="nexo-summary-figure" role="group" aria-label={title}>
   {comparison&&rows.length>1?<div className="nexo-comparison-heading"><strong>{yAxis}</strong><span>{en?"Published values by configuration":"Valores publicados por configuração"}</span></div>:<div className="nexo-stat-stage" key={active.key}>
     <span className="nexo-stat-label">{yAxis}</span>
     <div className="nexo-stat-number"><strong>{format(active.y)}</strong>{plot.y.unit&&<span>{plot.y.unit}</span>}</div>
     <dl className="nexo-point-values nexo-summary-point-values"><div><dt>{xAxis}</dt><dd>{format(active.x)}</dd></div></dl>
     <p className="nexo-stat-context"><span>{en?'Series (legend): ':'S\u00e9rie (legenda): '}</span>{presentLabel(pick(active.label,locale),locale)}</p>
     {interval&&<p className="nexo-stat-interval">{en?'Published interval':'Intervalo publicado'}{plot.y.unit?` (${plot.y.unit})`:''}: <strong>{format(active.low!)} {'\u2013'} {format(active.high!)}</strong></p>}
   {scalar&&onInspect&&<button type="button" className="nexo-summary-inspect" onClick={event=>onInspect(active.key,event.currentTarget)}>{en?'Measurement details':'Detalhes da medida'} <ArrowIcon/></button>}
   </div>}
   {rows.length>1&&!comparison&&<div className="nexo-data-table nexo-summary-data-table"><div className="nexo-table-scroll"><table>
     <caption>{title}</caption>
     <thead><tr><th scope="col">{en?'Series (legend)':'Série (legenda)'}</th><th scope="col">{xAxis}</th><th scope="col">{yAxis}</th><th scope="col">{en?'Published lower bound':'Limite inferior publicado'}{plot.y.unit?` (${plot.y.unit})`:''}</th><th scope="col">{en?'Published upper bound':'Limite superior publicado'}{plot.y.unit?` (${plot.y.unit})`:''}</th>{onInspect&&<th scope="col">{en?'Inspect':'Inspecionar'}</th>}</tr></thead>
     <tbody>{rows.map(p=><tr key={p.key} data-selected={selectedKey===p.key}><th scope="row">{presentLabel(pick(p.label,locale),locale)}</th><td>{format(p.x)}</td><td>{format(p.y)}{plot.y.unit?` ${plot.y.unit}`:''}</td><td>{p.low===undefined?'—':format(p.low)}</td><td>{p.high===undefined?'—':format(p.high)}</td>{onInspect&&<td><button type="button" className="nexo-summary-inspect nexo-table-inspect" aria-pressed={selectedKey===p.key} aria-label={`${en?'Inspect':'Inspecionar'} ${presentLabel(pick(p.label,locale),locale)}, ${xAxis} ${format(p.x)}`} onClick={event=>onInspect(p.key,event.currentTarget)}>{en?'Details':'Detalhes'} <ArrowIcon/></button></td>}</tr>)}</tbody>
   </table></div></div>}
   {rows.length>1&&comparison&&<div className="nexo-comparison-bars">
     {rows.map((p,i)=>{const hasInterval=p.low!==undefined&&p.high!==undefined;
       const style={'--bar-start':`${position(Math.min(0,p.y))}%`,'--bar-size':`${Math.abs(p.y)/span*100}%`,'--point-x':`${position(p.y)}%`,'--interval-start':`${position(p.low??p.y)}%`,'--interval-size':`${((p.high??p.y)-(p.low??p.y))/span*100}%`,'--zero-x':`${position(0)}%`,'--bar-delay':`${i*90}ms`} as CSSProperties;
       const track=<span className="nexo-bar-track" aria-hidden="true"><span className="nexo-bar-zero"/>{hasInterval?<><span className="nexo-bar-interval"/><span className="nexo-bar-point"/></>:<span className="nexo-bar-fill"/>}</span>;
       // A single measurement retains its detail action without a redundant selection row.
       if(single)return <div key={i} className="nexo-single-bar" style={style}>{track}{onInspect&&<button type="button" className="nexo-summary-inspect" onClick={event=>onInspect(p.key,event.currentTarget)}>{en?'Measurement details':'Detalhes da medida'} <ArrowIcon/></button>}</div>;
       return <button type="button" key={i} className="nexo-bar-row" aria-pressed={selectedKey===undefined?selected===i:selectedKey===p.key} onClick={event=>{setSelected(i);onInspect?.(p.key,event.currentTarget);}} onFocus={()=>{if(!selectedKey)setSelected(i);}} style={style}>
       <span className="nexo-bar-heading"><span><LabelParts text={presentLabel(pick(p.label,locale),locale)}/></span><strong>{format(p.y)}{plot.y.unit==='%'?'%':''}</strong></span>
       {track}
       {hasInterval&&<span className="nexo-bar-bounds">{format(p.low!)} {'\u2013'} {format(p.high!)}{plot.y.unit?` (${plot.y.unit})`:''}</span>}
     </button>;})}
     <div className="nexo-bar-scale" aria-hidden="true"><span>{format(min)}{percentage?'%':''}</span><span>{format(max)}{percentage?'%':''}</span></div>
     {rows.length>1&&<small>{en?'Select a measurement to inspect it.':'Toque em uma medida para destacá-la.'}</small>}
   </div>}
   <details ref={technical} className="nexo-technical-plot" onToggle={event=>{if(event.currentTarget.open)setTechnicalMounted(true);}}><summary>{en?'Explore axes, values and downloads':'Explorar eixos, valores e downloads'}</summary>{technicalMounted&&children}</details>
 </div>;
}
