import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { gsap } from 'gsap';
import type { AtlasGraph, AtlasNode, AtlasEdge } from './types';
import { selectSemanticLOD } from './semantic-lod';
import { AtlasAtmosphere } from './AtlasAtmosphere';
import {
  buildBreakthroughLayout,
  nodeVisualRadius,
  relationOpacity,
  type BreakthroughPoint
} from './breakthrough-layout';

type Lens='structure'|'learning'|'evidence'|'time';
type Band='overview'|'domain'|'program'|'audit';

type Props={
  graph:AtlasGraph|null;
  focusId:string;
  selectedId?:string|null;
  onSelect:(node:AtlasNode)=>void;
  onOpen:(node:AtlasNode)=>void;
  reducedMotion:boolean;
  autoOrbit:boolean;
  compact?:boolean;
  lens?:Lens;
};

const STRUCTURAL=new Set(['SYSTEM','DOMAIN','CAMPAIGN']);
const VIEW_W=1200;
const VIEW_H=800;

const statusTone=(node:AtlasNode)=>{
  const status=String(node.status||'').toUpperCase();
  if(/BLOCKED|FAIL|REJECT/.test(status))return 'danger';
  if(/SUPPORTED|APPROVED|PASS|SUCCESS|VALIDATED/.test(status))return 'supported';
  if(/ACTIVE|OPEN|PROGRESS|TESTING/.test(status))return 'active';
  if(/PARTIAL|PROVISIONAL|CANDIDATE|INCONCLUSIVE/.test(status))return 'candidate';
  return 'neutral';
};

const bandFor=(scale:number):Band=>scale<1.12?'overview':scale<1.72?'domain':scale<2.65?'program':'audit';

function edgePath(edge:AtlasEdge,byId:Map<string,BreakthroughPoint>){
  const a=byId.get(edge.source),b=byId.get(edge.target);
  if(!a||!b)return '';
  const dx=b.x-a.x,dy=b.y-a.y;
  const len=Math.max(1,Math.hypot(dx,dy));
  const bend=Math.min(58,len*.16);
  const mx=(a.x+b.x)/2-(dy/len)*bend;
  const my=(a.y+b.y)/2+(dx/len)*bend;
  const builder=d3.line<[number,number]>().curve(d3.curveBasis);
  return builder([[a.x,a.y],[mx,my],[b.x,b.y]])||'';
}

function makeDomainFields(points:BreakthroughPoint[]){
  const grouped=d3.group(points.filter(p=>p.domainKey!=='NEXO'),p=>p.domainKey);
  const curve=d3.line<[number,number]>().curve(d3.curveBasisClosed);
  return [...grouped].map(([key,items])=>{
    const corners=items.flatMap(p=>{
      const pad=26+nodeVisualRadius(p)*1.8;
      return [[p.x-pad,p.y-pad],[p.x+pad,p.y-pad],[p.x+pad,p.y+pad],[p.x-pad,p.y+pad]] as [number,number][];
    });
    const hull=d3.polygonHull(corners);
    return hull?{key,path:curve(hull)||'',count:items.length}:null;
  }).filter((field):field is {key:string;path:string;count:number}=>Boolean(field));
}

function lensClass(lens:Lens,node:BreakthroughPoint){
  const type=String(node.type||'').toUpperCase();
  const id=node.id.toUpperCase();
  if(lens==='learning')return /LEARNING|MEMORY|FILAMENT|LESSON|PATTERN/.test(`${type} ${id}`)?'lens-hit':'lens-dim';
  if(lens==='evidence')return /CLAIM|TEST|RESULT|EVIDENCE/.test(`${type} ${id}`)?'lens-hit':'lens-dim';
  if(lens==='time')return /RUN|EVENT|RESULT|TEST/.test(`${type} ${id}`)?'lens-hit':'lens-dim';
  return /SYSTEM|DOMAIN|CAMPAIGN|PROGRAM/.test(type)?'lens-hit':'';
}

export function BreakthroughAtlas({
  graph,focusId,selectedId,onSelect,onOpen,reducedMotion,autoOrbit,compact=false,lens='structure'
}:Props){
  const stageRef=useRef<HTMLDivElement>(null);
  const svgRef=useRef<SVGSVGElement>(null);
  const worldRef=useRef<SVGGElement>(null);
  const [band,setBand]=useState<Band>('overview');
  const sourceNodes=graph?.nodes||[];

  const budgets=compact
    ? {overview:[34,9],domain:[52,12],program:[70,15],audit:[86,18]}
    : {overview:[54,15],domain:[88,22],program:[126,30],audit:[170,38]};
  const [visibleBudget,labelBudget]=budgets[band];

  const lod=useMemo(()=>selectSemanticLOD(sourceNodes,{
    selectedId,focusId,visibleBudget,labelBudget
  }),[focusId,labelBudget,selectedId,sourceNodes,visibleBudget]);

  const visible=useMemo(()=>sourceNodes.filter(n=>lod.visibleIds.has(n.id)),[lod.visibleIds,sourceNodes]);
  const points=useMemo(()=>buildBreakthroughLayout(visible,focusId,VIEW_W,VIEW_H),[focusId,visible]);
  const byId=useMemo(()=>new Map(points.map(p=>[p.id,p])),[points]);
  const ids=useMemo(()=>new Set(points.map(p=>p.id)),[points]);
  const edges=useMemo(()=>(graph?.edges||[]).filter(e=>ids.has(e.source)&&ids.has(e.target)),[graph,ids]);
  const fields=useMemo(()=>makeDomainFields(points),[points]);

  const tunnel=useMemo(()=>{
    if(!selectedId)return null;
    const set=new Set([selectedId]);
    for(const e of edges){
      if(e.source===selectedId)set.add(e.target);
      if(e.target===selectedId)set.add(e.source);
    }
    return set;
  },[edges,selectedId]);

  useEffect(()=>{
    const svg=svgRef.current,world=worldRef.current;
    if(!svg||!world)return;
    const behavior=d3.zoom<SVGSVGElement,unknown>()
      .scaleExtent([.72,4.4])
      .on('zoom',event=>{
        world.setAttribute('transform',event.transform.toString());
        const next=bandFor(event.transform.k);
        setBand(current=>current===next?current:next);
      });
    const selection=d3.select(svg);
    selection.call(behavior).on('dblclick.zoom',null);
    return()=>{selection.on('.zoom',null)};
  },[]);

  useEffect(()=>{
    document.documentElement.dataset.btSemanticBand=band;
  },[band]);

  useEffect(()=>{
    const stage=stageRef.current;
    if(!stage||reducedMotion)return;
    const enter=gsap.fromTo(stage.querySelectorAll('.bt-node'),{opacity:0},{opacity:1,duration:.65,stagger:.012,ease:'power2.out'});
    return()=>{enter.kill();};
  },[focusId,reducedMotion,visible.length]);

  useEffect(()=>{
    const stage=stageRef.current;
    if(!stage||!autoOrbit||reducedMotion)return;
    const tween=gsap.to(stage,{'--bt-ry':'4.5deg',duration:5.8,yoyo:true,repeat:-1,ease:'sine.inOut'} as any);
    return()=>{tween.kill();};
  },[autoOrbit,reducedMotion]);

  const tilt=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(reducedMotion||!stageRef.current)return;
    const rect=stageRef.current.getBoundingClientRect();
    const nx=(event.clientX-rect.left)/Math.max(1,rect.width)-.5;
    const ny=(event.clientY-rect.top)/Math.max(1,rect.height)-.5;
    gsap.to(stageRef.current,{
      '--bt-rx':`${(-ny*5.2).toFixed(2)}deg`,
      '--bt-ry':`${(nx*7.2).toFixed(2)}deg`,
      '--bt-px':`${(nx*8).toFixed(1)}px`,
      '--bt-py':`${(ny*5).toFixed(1)}px`,
      duration:.55,ease:'power3.out',overwrite:'auto'
    } as any);
  };
  const resetTilt=()=>{
    if(reducedMotion||!stageRef.current)return;
    gsap.to(stageRef.current,{'--bt-rx':'0deg','--bt-ry':'0deg','--bt-px':'0px','--bt-py':'0px',duration:.85,ease:'power3.out'} as any);
  };

  if(!graph)return <div className="bt-hybrid-stage bt-loading" data-bt-graph="loading"><AtlasAtmosphere reducedMotion={reducedMotion}/><span>LENDO O CAMPO NEXO…</span></div>;

  return <div
    ref={stageRef}
    className="bt-hybrid-stage"
    data-bt-graph="hybrid-svg"
    data-bt-band={band}
    data-bt-lens={lens}
    onPointerMove={tilt}
    onPointerLeave={resetTilt}
  >
    <AtlasAtmosphere reducedMotion={reducedMotion}/>
    <div className="bt-spatial-plane">
      <svg
        ref={svgRef}
        className="bt-graph-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="application"
        aria-label="NEXO Atlas Breakthrough, grafo navegável"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs><filter id="bt-soft"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
        <g ref={worldRef} className="bt-world">
          <g className="bt-domain-fields" aria-hidden="true">
            {fields.map(field=><path key={field.key} className={`bt-domain-field domain-${field.key.toLowerCase()}`} data-domain={field.key} d={field.path}/>) }
          </g>

          <g className="bt-links" aria-hidden="true">
            {edges.map((edge,index)=>{
              const a=byId.get(edge.source),b=byId.get(edge.target);
              if(!a||!b)return null;
              const related=!tunnel||tunnel.has(edge.source)&&tunnel.has(edge.target);
              return <path
                key={edge.id||`${edge.source}:${edge.target}:${index}`}
                className={`bt-link ${related?'':'tunnel-dim'}`}
                data-edge-type={String(edge.type||'relation').toLowerCase()}
                d={edgePath(edge,byId)}
                style={{opacity:related?relationOpacity(a,b):.055}}
              />;
            })}
          </g>

          <g className="bt-nodes">
            {points.map(point=>{
              const selected=point.id===selectedId;
              const related=!tunnel||tunnel.has(point.id);
              const labelled=lod.labelIds.has(point.id);
              const type=String(point.type||'ENTITY').toLowerCase();
              const tone=statusTone(point);
              const radius=nodeVisualRadius(point,selectedId);
              return <g
                key={point.id}
                className={`bt-node type-${type} tone-${tone} ${selected?'selected':''} ${related?'':'tunnel-dim'} ${lensClass(lens,point)}`}
                data-node-id={point.id}
                data-depth={point.depth.toFixed(3)}
                transform={`translate(${point.x} ${point.y})`}
                role="button"
                tabIndex={0}
                aria-label={String(point.label||point.id)}
                onClick={event=>{event.stopPropagation();onSelect(point)}}
                onDoubleClick={event=>{event.stopPropagation();if(STRUCTURAL.has(String(point.type||'').toUpperCase())&&point.id!==focusId)onOpen(point)}}
                onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(point)}}}
                style={{opacity:related?(.62+point.depth*.38):.08}}
              >
                {selected&&<circle className="bt-selection-ring" r={radius+9}/>} 
                <circle className="bt-node-core" r={radius}/>
                <circle className="bt-node-dot" r={Math.max(2.2,radius*.2)}/>
                {labelled&&<text className="bt-node-label" x={radius+8} y={4}>{String(point.label||point.id).slice(0,34)}</text>}
              </g>;
            })}
          </g>
        </g>
      </svg>
    </div>
    <div className="bt-depth-key" aria-hidden="true"><i/><span>CAMPO {band.toUpperCase()}</span></div>
  </div>;
}
