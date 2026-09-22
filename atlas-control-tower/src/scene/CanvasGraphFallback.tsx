import { useEffect, useRef } from 'react';
import type { AtlasEdge, PositionedNode } from './types';
import { edgeVisualRole, nodeVisualRole } from './neural-visuals.mjs';

type Props={
  nodes:PositionedNode[];
  edges:AtlasEdge[];
  labelIds:Set<string>;
  focusId:string;
  selectedId?:string|null;
  onNodeClick:(node:PositionedNode)=>void;
  reducedMotion:boolean;
  compact:boolean;
  theme?:'dark'|'light';
};
type Point={x:number;y:number};
type WorldPoint={x:number;y:number;z:number};
type Camera={scale:number;panX:number;panY:number};
type Runtime={camera:Camera;drag:Point|null;last:Point|null;moved:boolean;pointers:Map<number,Point>;pinch:{distance:number;scale:number}|null;history:Camera[];hoverId:string|null};

const ROOT='__PRESENTATION_NEXO__';
const DOMAIN_PREFIX='__PRESENTATION_CLUSTER__:';
const ROOT_SCALE=0.68;
const MIN_SCALE=0.34;
const MAX_SCALE=2.5;
const DOMAIN_POSITIONS:Record<string,WorldPoint>={
  SCIENCE:{x:-6,y:1.2,z:0},
  ENGINEERING:{x:-3.2,y:-2.6,z:0},
  INTERDOMAIN:{x:0,y:-4,z:0},
  OLYMPUS:{x:3.2,y:-2.6,z:0},
  OPERATIONS:{x:6,y:1.2,z:0},
  REFERENCES:{x:3.4,y:4.2,z:0},
  OTHER:{x:-3.4,y:4.2,z:0}
};

function nodeWorld(node:PositionedNode,focusId:string):WorldPoint{
  const id=String(node.id);
  if(focusId===ROOT&&id.startsWith(DOMAIN_PREFIX)){
    const key=id.slice(DOMAIN_PREFIX.length);
    return DOMAIN_POSITIONS[key]||{x:0,y:0,z:0};
  }
  if(focusId===ROOT&&id===ROOT)return{x:0,y:4.2,z:0};
  const p=node.position||[0,0,0];
  return{x:Number(p[0]||0),y:Number(p[1]||0),z:Number(p[2]||0)};
}
function radiusFor(node:PositionedNode,active:boolean,focusId:string){
  const id=String(node.id);const type=String(node.type||'').toUpperCase();
  let base=id.startsWith(DOMAIN_PREFIX)&&focusId===ROOT?38:type==='ROOT'?20:type==='SYSTEM'?25:type==='DOMAIN'?21:type==='CAMPAIGN'?15:11;
  if(id===ROOT&&focusId===ROOT)base=11;
  return base+(active?3:0);
}
function colorFor(node:PositionedNode,theme:'dark'|'light'){
  const id=String(node.id);
  if(id.endsWith(':SCIENCE'))return theme==='light'?'#2679b8':'#56bfff';
  if(id.endsWith(':ENGINEERING'))return theme==='light'?'#258b73':'#63dbbd';
  if(id.endsWith(':INTERDOMAIN'))return theme==='light'?'#7352b8':'#a98cff';
  if(id.endsWith(':OLYMPUS'))return theme==='light'?'#8059bd':'#b891ff';
  if(id.endsWith(':OPERATIONS'))return theme==='light'?'#9b5b22':'#ffc06c';
  if(id.endsWith(':REFERENCES'))return theme==='light'?'#087f68':'#69deb0';
  if(id.endsWith(':OTHER'))return theme==='light'?'#627083':'#91a8bc';
  const role=nodeVisualRole(node);
  if(role==='attention')return theme==='light'?'#a23b55':'#ff7188';
  if(role==='automation')return theme==='light'?'#a26700':'#ffc86d';
  if(role==='evidence')return theme==='light'?'#087f68':'#69deb0';
  if(role==='hub')return theme==='light'?'#1f6fae':'#74b9ff';
  return theme==='light'?'#176fae':'#48bfff';
}
function distance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y)}
function copyCamera(camera:Camera):Camera{return{scale:camera.scale,panX:camera.panX,panY:camera.panY}}
function truncateLabel(value:string,max:number){return value.length>max?`${value.slice(0,Math.max(1,max-1))}…`:value}

export function CanvasGraphFallback({nodes,edges,labelIds,focusId,selectedId,onNodeClick,reducedMotion,compact,theme='dark'}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const nodesRef=useRef(nodes);const edgesRef=useRef(edges);const labelsRef=useRef(labelIds);const focusRef=useRef(focusId);const selectedRef=useRef(selectedId);const callbackRef=useRef(onNodeClick);
  const runtimeRef=useRef<Runtime>({camera:{scale:ROOT_SCALE,panX:0,panY:0},drag:null,last:null,moved:false,pointers:new Map(),pinch:null,history:[],hoverId:null});
  nodesRef.current=nodes;edgesRef.current=edges;labelsRef.current=labelIds;focusRef.current=focusId;selectedRef.current=selectedId;callbackRef.current=onNodeClick;

  useEffect(()=>{
    const canvas=canvasRef.current;const host=hostRef.current;if(!canvas||!host)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const runtime=runtimeRef.current;let width=0;let height=0;let mobile=false;let raf=0;let disposed=false;
    const resize=()=>{const dpr=Math.min(window.devicePixelRatio||1,2);const rect=host.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);mobile=width<=520;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0)};
    const unit=()=>Math.min(width,height)/(compact?17.5:16.5)*runtime.camera.scale;
    const isDomain=(node:PositionedNode)=>String(node.id).startsWith(DOMAIN_PREFIX)&&focusRef.current===ROOT;
    const domainScreenPoint=(node:PositionedNode)=>{
      const domains=nodesRef.current.filter(candidate=>String(candidate.id).startsWith(DOMAIN_PREFIX)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const index=Math.max(0,domains.findIndex(candidate=>candidate.id===node.id));const total=Math.max(1,domains.length);const angle=-Math.PI/2+(index*Math.PI*2)/total;
      const rx=Math.min(width*.32,145);const ry=Math.min(height*.25,130);const zoom=Math.max(.72,runtime.camera.scale/ROOT_SCALE);
      return{x:width/2+runtime.camera.panX+Math.cos(angle)*rx*zoom,y:height*.54+runtime.camera.panY+Math.sin(angle)*ry*zoom,radius:(node.id===selectedRef.current?27:24)*Math.min(1.2,zoom)};
    };
    const project=(node:PositionedNode)=>{if(mobile&&focusRef.current===ROOT&&isDomain(node))return domainScreenPoint(node);if(mobile&&focusRef.current===ROOT&&node.id===ROOT)return{x:width/2+runtime.camera.panX,y:height*.54+runtime.camera.panY,radius:node.id===selectedRef.current?15:12};const p=nodeWorld(node,focusRef.current);const depth=Math.max(.72,1+p.z*.035);return{x:width/2+runtime.camera.panX+p.x*unit()*depth,y:height/2+runtime.camera.panY+p.y*unit()*.76*depth,radius:radiusFor(node,node.id===selectedRef.current||node.id===focusRef.current,focusRef.current)*Math.max(.8,depth)}};
    const draw=()=>{
      ctx.clearRect(0,0,width,height);
      const visible=nodesRef.current;const ids=new Set(visible.map(n=>n.id));const points=new Map(visible.map(n=>[n.id,project(n)]));const rootMobile=mobile&&focusRef.current===ROOT;
      for(const edge of edgesRef.current){if(!ids.has(edge.source)||!ids.has(edge.target))continue;const a=points.get(edge.source),b=points.get(edge.target);if(!a||!b)continue;const role=edgeVisualRole(edge);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.setLineDash(role==='learning'?[4,6]:role==='evidence'?[2,5]:[]);ctx.strokeStyle=theme==='light'?'rgba(28,72,104,.22)':'rgba(92,174,220,.24)';ctx.lineWidth=role==='hierarchy'?1.4:1;ctx.stroke();ctx.setLineDash([])}
      for(const node of visible){const p=points.get(node.id);if(!p)continue;const active=node.id===selectedRef.current||node.id===focusRef.current;const domain=isDomain(node);const color=colorFor(node,theme);const root=node.id===ROOT&&focusRef.current===ROOT;
        if(!root){ctx.beginPath();ctx.arc(p.x,p.y,p.radius+(domain?(rootMobile?7:13):5),0,Math.PI*2);ctx.strokeStyle=domain?(theme==='light'?'rgba(30,73,105,.20)':'rgba(151,220,255,.20)'):(theme==='light'?'rgba(30,73,105,.12)':'rgba(151,220,255,.10)');ctx.lineWidth=domain?1.5:1;ctx.stroke()}
        ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.fillStyle=root?(theme==='light'?'rgba(45,81,108,.36)':'rgba(135,193,219,.34)'):color;ctx.globalAlpha=root?.55:(active?1:.9);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle=active?(theme==='light'?'#123e63':'#effcff'):(theme==='light'?'rgba(38,82,114,.65)':'rgba(216,247,255,.72)');ctx.lineWidth=active?2.4:1.25;ctx.stroke();
        const showLabel=rootMobile?(domain||active):(domain||labelsRef.current.has(node.id)||active);if(!showLabel)continue;
        if(rootMobile){const rawLabel=String(node.label||node.id);const label=truncateLabel(rawLabel,domain?18:14);const x=p.x;const y=p.y+p.radius+13;ctx.textBaseline='top';ctx.textAlign='center';ctx.font=`${domain?700:650} ${domain?11:9}px system-ui,sans-serif`;ctx.fillStyle=theme==='light'?'#102d45':'#edfaff';ctx.fillText(label,x,y,Math.min(width*.28,108));ctx.textAlign='start';continue}
        const label=String(node.label||node.id);const x=p.x+p.radius+12;const y=p.y-(domain?12:4);ctx.textBaseline='middle';ctx.font=`${domain?700:active?650:500} ${domain?17:active?14:11}px system-ui,sans-serif`;ctx.fillStyle=theme==='light'?'#102d45':'#edfaff';ctx.fillText(label,x,y);
        if(domain){const summary=String(node.summary||'');if(summary){ctx.font='500 11px system-ui,sans-serif';ctx.fillStyle=theme==='light'?'rgba(45,75,98,.82)':'rgba(184,218,233,.80)';const max=compact?190:270;const words=summary.split(/\s+/);let line='';let yy=y+21;for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>max&&line){ctx.fillText(line,x,yy);line=word;yy+=15}else line=test}if(line)ctx.fillText(line,x,yy)}}
        else{ctx.font='700 8px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle=theme==='light'?'rgba(67,104,133,.88)':'rgba(151,208,232,.72)';ctx.fillText(`${String(node.type||'ENTITY')} · ${String(node.status||'UNKNOWN')}`,x,y+14)}
      }
      if(!disposed)raf=requestAnimationFrame(draw);
    };
    const point=(event:PointerEvent):Point=>{const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top}};
    const hit=(x:number,y:number)=>{let best:PositionedNode|undefined;let bestD=Infinity;for(const node of nodesRef.current){const p=project(node);const d=Math.hypot(x-p.x,y-p.y);if(d<=p.radius+16&&d<bestD){best=node;bestD=d}}return best};
    const pushHistory=()=>{runtime.history.push(copyCamera(runtime.camera));if(runtime.history.length>20)runtime.history.shift()};
    const down=(e:PointerEvent)=>{const p=point(e);runtime.pointers.set(e.pointerId,p);runtime.moved=false;canvas.setPointerCapture?.(e.pointerId);if(runtime.pointers.size===2){const [a,b]=[...runtime.pointers.values()];runtime.pinch={distance:Math.max(1,distance(a,b)),scale:runtime.camera.scale};runtime.drag=null;pushHistory()}else{runtime.drag=p;runtime.last=p;pushHistory()}};
    const move=(e:PointerEvent)=>{const p=point(e);runtime.pointers.set(e.pointerId,p);if(runtime.pointers.size===2&&runtime.pinch){const [a,b]=[...runtime.pointers.values()];runtime.camera.scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,runtime.pinch.scale*(distance(a,b)/runtime.pinch.distance)));runtime.moved=true;return}if(runtime.drag&&runtime.last){const dx=p.x-runtime.last.x,dy=p.y-runtime.last.y;if(Math.abs(dx)+Math.abs(dy)>2)runtime.moved=true;runtime.camera.panX+=dx;runtime.camera.panY+=dy;runtime.last=p}const candidate=hit(p.x,p.y);runtime.hoverId=candidate?.id||null;canvas.style.cursor=runtime.drag?'grabbing':candidate?'pointer':'grab'};
    const up=(e:PointerEvent)=>{const p=point(e);const wasMoved=runtime.moved;runtime.pointers.delete(e.pointerId);if(runtime.pointers.size<2)runtime.pinch=null;if(!runtime.pointers.size){runtime.drag=null;runtime.last=null}if(!wasMoved){const node=hit(p.x,p.y);if(node)callbackRef.current(node)}};
    const wheel=(e:WheelEvent)=>{e.preventDefault();pushHistory();const before=point(e as unknown as PointerEvent);const old=runtime.camera.scale;const next=Math.max(MIN_SCALE,Math.min(MAX_SCALE,old*Math.exp(-e.deltaY*.0011)));const factor=next/old;runtime.camera.panX=before.x-width/2-(before.x-width/2-runtime.camera.panX)*factor;runtime.camera.panY=before.y-height/2-(before.y-height/2-runtime.camera.panY)*factor;runtime.camera.scale=next};
    const reset=()=>{pushHistory();runtime.camera={scale:focusRef.current===ROOT?ROOT_SCALE:.82,panX:0,panY:0}};
    const fit=()=>{pushHistory();runtime.camera={scale:focusRef.current===ROOT?ROOT_SCALE:.94,panX:0,panY:0}};
    const back=()=>{const previous=runtime.history.pop();if(previous)runtime.camera=previous};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});window.addEventListener('atlas:reset-view',reset);window.addEventListener('atlas:fit-selection',fit);window.addEventListener('atlas:camera-back',back);
    raf=requestAnimationFrame(draw);
    return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);window.removeEventListener('atlas:reset-view',reset);window.removeEventListener('atlas:fit-selection',fit);window.removeEventListener('atlas:camera-back',back)};
  },[compact,reducedMotion,theme]);

  useEffect(()=>{if(focusId===ROOT)runtimeRef.current.camera={scale:ROOT_SCALE,panX:0,panY:0};else runtimeRef.current.camera={scale:.82,panX:0,panY:0}},[focusId]);

  return <div ref={hostRef} className="canvas-graph-fallback" data-testid="atlas-canvas-2d" style={{position:'absolute',inset:0,minHeight:compact?420:620,touchAction:'none',overflow:'hidden'}}><canvas ref={canvasRef} aria-label="Grafo interativo 2D" style={{display:'block',width:'100%',height:'100%',touchAction:'none'}}/></div>;
}
