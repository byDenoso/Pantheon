import {useEffect,useMemo,useRef} from 'react';
import type {AtlasEdge,PositionedNode} from './types';
import {edgeVisualRole} from './neural-visuals.mjs';
import {buildCanvas25DLayout,DOMAIN_PREFIX,PRESENTATION_ROOT,radiusForImportance,stateRole,zoomCameraAt,type Canvas25DPoint} from './canvas25d.mjs';

type Props={
  nodes:PositionedNode[];
  edges:AtlasEdge[];
  labelIds:Set<string>;
  focusId:string;
  selectedId?:string|null;
  onNodeClick:(node:PositionedNode)=>void;
  onNodeDoubleClick?:(node:PositionedNode)=>void;
  reducedMotion:boolean;
  compact:boolean;
  theme?:'dark'|'light';
};
type Point={x:number;y:number};
type Camera={scale:number;panX:number;panY:number};
type Pinch={distance:number;scale:number;center:Point;panX:number;panY:number};
type Tap={time:number;point:Point;nodeId:string|null};
type Runtime={camera:Camera;target:Camera;drag:Point|null;last:Point|null;moved:boolean;pointers:Map<number,Point>;pinch:Pinch|null;history:Camera[];hoverId:string|null;lastTap:Tap|null;appliedFocus:string|null;view:'overview'|'domain'|'node'};
type Projected={x:number;y:number;radius:number;depthScale:number;layout:Canvas25DPoint};
const MIN_SCALE=.28;

function distance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y)}
function midpoint(a:Point,b:Point):Point{return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function copyCamera(camera:Camera):Camera{return{scale:camera.scale,panX:camera.panX,panY:camera.panY}}
function cameraDelta(a:Camera,b:Camera){return Math.abs(a.scale-b.scale)+Math.abs(a.panX-b.panX)/100+Math.abs(a.panY-b.panY)/100}
function depthScale(level:number){return Math.max(.72,1-Math.min(7,Math.max(0,level))*.042)}
function typeColor(node:PositionedNode,theme:'dark'|'light'){
  const type=String(node.type||'ENTITY').toUpperCase();
  const dark:Record<string,string>={ROOT:'#7bdcff',SYSTEM:'#69b8ff',DOMAIN:'#69b8ff',PROGRAM:'#a98cff',CAMPAIGN:'#a98cff',PROJECT:'#a98cff',TEST:'#ffc76b',RESULT:'#69deb0',EVIDENCE:'#69deb0',REFERENCE:'#69deb0',AUTOMATION:'#ff9f6b',FILAMENT:'#d892ff',DATASET:'#78c7e8',ARTIFACT:'#8ed7f2',PUBLICATION:'#9ae6c7'};
  const light:Record<string,string>={ROOT:'#1678a9',SYSTEM:'#236fb1',DOMAIN:'#236fb1',PROGRAM:'#7650b4',CAMPAIGN:'#7650b4',PROJECT:'#7650b4',TEST:'#a76500',RESULT:'#087f68',EVIDENCE:'#087f68',REFERENCE:'#087f68',AUTOMATION:'#aa551c',FILAMENT:'#8544a8',DATASET:'#287da0',ARTIFACT:'#287da0',PUBLICATION:'#237b63'};
  return(theme==='light'?light:dark)[type]||(theme==='light'?'#2a709f':'#55bfff');
}
function haloColor(node:PositionedNode,theme:'dark'|'light'){
  const role=stateRole(node.status);
  if(role==='attention')return theme==='light'?'rgba(174,45,73,.58)':'rgba(255,91,125,.70)';
  if(role==='pending')return theme==='light'?'rgba(161,105,0,.48)':'rgba(255,197,85,.58)';
  if(role==='healthy')return theme==='light'?'rgba(14,126,99,.40)':'rgba(94,229,187,.52)';
  return theme==='light'?'rgba(61,91,112,.20)':'rgba(133,190,218,.22)';
}

export function CanvasGraph25D({nodes,edges,labelIds,focusId,selectedId,onNodeClick,onNodeDoubleClick,reducedMotion,compact,theme='dark'}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const hostRef=useRef<HTMLDivElement>(null);
  const redrawRef=useRef<()=>void>(()=>{});
  const layout=useMemo(()=>buildCanvas25DLayout(nodes,edges),[edges,nodes]);
  const nodesRef=useRef(nodes);const edgesRef=useRef(edges);const labelsRef=useRef(labelIds);const focusRef=useRef(focusId);const selectedRef=useRef(selectedId);const callbackRef=useRef(onNodeClick);const doubleCallbackRef=useRef(onNodeDoubleClick);const layoutRef=useRef(layout);
  const runtimeRef=useRef<Runtime>({camera:{scale:.72,panX:0,panY:0},target:{scale:.72,panX:0,panY:0},drag:null,last:null,moved:false,pointers:new Map(),pinch:null,history:[],hoverId:null,lastTap:null,appliedFocus:null,view:'overview'});
  nodesRef.current=nodes;edgesRef.current=edges;labelsRef.current=labelIds;focusRef.current=focusId;selectedRef.current=selectedId;callbackRef.current=onNodeClick;doubleCallbackRef.current=onNodeDoubleClick;layoutRef.current=layout;

  useEffect(()=>{
    const canvas=canvasRef.current;const host=hostRef.current;if(!canvas||!host)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const runtime=runtimeRef.current;let width=0;let height=0;let raf=0;let disposed=false;
    const nodeMap=()=>new Map(nodesRef.current.map(node=>[String(node.id),node]));
    const layoutMap=()=>new Map(layoutRef.current.map(point=>[point.id,point]));
    const baseUnit=()=>Math.min(width,height)/(compact?17.8:16.4);
    const screenWorld=(item:Canvas25DPoint)=>{const zScale=depthScale(item.level);return{x:item.x*zScale,y:item.y*.78*zScale,zScale}};
    const project=(item:Canvas25DPoint,node:PositionedNode):Projected=>{const world=screenWorld(item);const cluster=item.id.startsWith(DOMAIN_PREFIX);const root=item.id===PRESENTATION_ROOT;const active=node.id===selectedRef.current||node.id===focusRef.current;const baseRadius=radiusForImportance(item,{cluster,root})+(active?2.5:0);return{x:width/2+runtime.camera.panX+world.x*baseUnit()*runtime.camera.scale,y:height/2+runtime.camera.panY+world.y*baseUnit()*runtime.camera.scale,radius:baseRadius*world.zScale*Math.max(.78,Math.sqrt(runtime.camera.scale)),depthScale:world.zScale,layout:item}};
    const fitItems=(items:Canvas25DPoint[],padding:number,cap:number):Camera=>{
      if(!items.length)return{scale:.72,panX:0,panY:0};
      const world=items.map(screenWorld);const minX=Math.min(...world.map(p=>p.x)),maxX=Math.max(...world.map(p=>p.x)),minY=Math.min(...world.map(p=>p.y)),maxY=Math.max(...world.map(p=>p.y));const spanX=Math.max(1.8,maxX-minX),spanY=Math.max(1.8,maxY-minY);const unit=baseUnit();const scale=Math.max(MIN_SCALE,Math.min(cap,(width-padding*2)/(spanX*unit),(height-padding*2)/(spanY*unit)));const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;return{scale,panX:-centerX*unit*scale,panY:-centerY*unit*scale};
    };
    const cameraForNode=(item:Canvas25DPoint):Camera=>{const world=screenWorld(item);const scale=compact?1.5:1.72;return{scale,panX:-world.x*baseUnit()*scale,panY:-world.y*baseUnit()*scale+(compact?18:0)}};
    const pushHistory=()=>{runtime.history.push(copyCamera(runtime.target));if(runtime.history.length>16)runtime.history.shift()};
    const schedule=()=>{if(disposed||raf)return;raf=requestAnimationFrame(draw)};
    const setTarget=(camera:Camera,view:Runtime['view'])=>{runtime.target=camera;runtime.view=view;if(reducedMotion)runtime.camera=copyCamera(camera);schedule()};
    const focusDomain=(domain:string,save=true)=>{const items=layoutRef.current.filter(item=>item.domain===domain);if(!items.length)return;if(save)pushHistory();setTarget(fitItems(items,compact?52:90,compact?1.1:1.25),'domain')};
    const focusNodeCamera=(id:string,save=true)=>{const item=layoutMap().get(id);if(!item)return;if(save)pushHistory();setTarget(cameraForNode(item),'node')};
    const reset=(save=true)=>{if(save)pushHistory();setTarget(fitItems(layoutRef.current,compact?42:86,compact ? .76 : .82),'overview')};
    const applySemanticFocus=()=>{const current=focusRef.current;if(runtime.appliedFocus===current)return;runtime.appliedFocus=current;if(current===PRESENTATION_ROOT){reset(false);return}const item=layoutMap().get(current);if(!item){reset(false);return}if(current.startsWith(DOMAIN_PREFIX))focusDomain(item.domain,false);else focusNodeCamera(current,false)};
    const resize=()=>{const dpr=Math.min(window.devicePixelRatio||1,compact?1.75:2);const rect=host.getBoundingClientRect();width=Math.max(280,rect.width);height=Math.max(360,rect.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);runtime.appliedFocus=null;schedule()};
    const drawEdge=(a:Projected,b:Projected,edge:AtlasEdge,index:number)=>{const role=edgeVisualRole(edge);const dx=b.x-a.x,dy=b.y-a.y;const length=Math.hypot(dx,dy)||1;const bend=Math.min(42,length*.12)*(index%2===0?1:-1);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;const cx=mx-dy/length*bend,cy=my+dx/length*bend;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cx,cy,b.x,b.y);ctx.setLineDash(role==='learning'?[4,6]:role==='evidence'?[2,5]:[]);ctx.strokeStyle=theme==='light'?'rgba(34,76,105,.20)':'rgba(100,186,226,.24)';ctx.lineWidth=role==='hierarchy'?1.45:1;ctx.stroke();ctx.setLineDash([])};
    const drawNode=(node:PositionedNode,p:Projected)=>{const active=node.id===selectedRef.current||node.id===focusRef.current;const cluster=p.layout.id.startsWith(DOMAIN_PREFIX);const root=p.layout.id===PRESENTATION_ROOT;const color=typeColor(node,theme);const halo=haloColor(node,theme);ctx.save();ctx.shadowColor=halo;ctx.shadowBlur=(cluster?18:9)+(1-p.depthScale)*30+(active?8:0);ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.fillStyle=color;ctx.globalAlpha=root ? .78 : active ? 1 : .9;ctx.fill();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.strokeStyle=halo;ctx.lineWidth=stateRole(node.status)==='neutral'?1.1:2;ctx.stroke();if(active){ctx.beginPath();ctx.arc(p.x,p.y,p.radius+5,0,Math.PI*2);ctx.strokeStyle=theme==='light'?'rgba(20,48,69,.76)':'rgba(238,252,255,.88)';ctx.lineWidth=1.2;ctx.stroke()}ctx.restore();const showLabel=cluster||labelsRef.current.has(node.id)||active;if(!showLabel)return;const label=String(node.label||node.id);const x=p.x+p.radius+10;const y=p.y-(cluster?8:2);ctx.textBaseline='middle';ctx.font=`${cluster?700:active?650:520} ${cluster?15:active?13:10}px system-ui,sans-serif`;ctx.fillStyle=theme==='light'?'#102d45':'#edfaff';ctx.fillText(label,x,y);ctx.font='700 8px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle=theme==='light'?'rgba(67,104,133,.80)':'rgba(151,208,232,.68)';ctx.fillText(cluster?`DOMÍNIO · Z${p.layout.level}`:`${String(node.type||'ENTITY')} · ${String(node.status||'UNKNOWN')} · Z${p.layout.level}`,x,y+13)};
    const draw=()=>{raf=0;applySemanticFocus();if(!reducedMotion){const ease=.17;runtime.camera.scale+=(runtime.target.scale-runtime.camera.scale)*ease;runtime.camera.panX+=(runtime.target.panX-runtime.camera.panX)*ease;runtime.camera.panY+=(runtime.target.panY-runtime.camera.panY)*ease}else runtime.camera=copyCamera(runtime.target);ctx.clearRect(0,0,width,height);const nodesById=nodeMap();const visibleLayout=layoutRef.current.filter(item=>nodesById.has(item.id));const points=new Map<string,Projected>();for(const item of visibleLayout){const node=nodesById.get(item.id);if(node)points.set(item.id,project(item,node))}edgesRef.current.forEach((edge,index)=>{const a=points.get(String(edge.source)),b=points.get(String(edge.target));if(a&&b)drawEdge(a,b,edge,index)});[...visibleLayout].sort((a,b)=>b.level-a.level||a.id.localeCompare(b.id)).forEach(item=>{const node=nodesById.get(item.id),p=points.get(item.id);if(node&&p)drawNode(node,p)});ctx.font='700 8px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle=theme==='light'?'rgba(47,83,108,.70)':'rgba(125,178,205,.66)';ctx.fillText(runtime.view==='overview'?'VISÃO GERAL':runtime.view==='domain'?'DOMÍNIO':'NÓ',compact?12:18,height-(compact?14:18));if(cameraDelta(runtime.camera,runtime.target)>.003)schedule()};
    const point=(event:PointerEvent|WheelEvent):Point=>{const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top}};
    const hit=(x:number,y:number)=>{const nodesById=nodeMap();let best:PositionedNode|undefined;let bestD=Infinity;for(const item of [...layoutRef.current].sort((a,b)=>a.level-b.level)){const node=nodesById.get(item.id);if(!node)continue;const p=project(item,node);const d=Math.hypot(x-p.x,y-p.y);if(d<=p.radius+14&&d<bestD){best=node;bestD=d}}return best};
    const down=(event:PointerEvent)=>{const p=point(event);runtime.pointers.set(event.pointerId,p);runtime.moved=false;canvas.setPointerCapture?.(event.pointerId);if(runtime.pointers.size===2){const [a,b]=[...runtime.pointers.values()];runtime.pinch={distance:Math.max(1,distance(a,b)),scale:runtime.camera.scale,center:midpoint(a,b),panX:runtime.camera.panX,panY:runtime.camera.panY};runtime.drag=null;pushHistory()}else{runtime.drag=p;runtime.last=p;pushHistory()}canvas.style.cursor='grabbing'};
    const move=(event:PointerEvent)=>{const p=point(event);if(runtime.pointers.has(event.pointerId))runtime.pointers.set(event.pointerId,p);if(runtime.pointers.size===2&&runtime.pinch){const [a,b]=[...runtime.pointers.values()];const center=midpoint(a,b);const nextScale=runtime.pinch.scale*(distance(a,b)/runtime.pinch.distance);const base={scale:runtime.pinch.scale,panX:runtime.pinch.panX,panY:runtime.pinch.panY};const anchored=zoomCameraAt(base,runtime.pinch.center,{width,height},nextScale);runtime.camera={...anchored,panX:anchored.panX+(center.x-runtime.pinch.center.x),panY:anchored.panY+(center.y-runtime.pinch.center.y)};runtime.target=copyCamera(runtime.camera);runtime.moved=true;schedule();return}if(runtime.drag&&runtime.last){const dx=p.x-runtime.last.x,dy=p.y-runtime.last.y;if(Math.abs(dx)+Math.abs(dy)>2)runtime.moved=true;runtime.camera.panX+=dx;runtime.camera.panY+=dy;runtime.target=copyCamera(runtime.camera);runtime.last=p;schedule()}const candidate=hit(p.x,p.y);if(candidate?.id!==runtime.hoverId){runtime.hoverId=candidate?.id||null;schedule()}canvas.style.cursor=runtime.drag?'grabbing':candidate?'pointer':'grab'};
    const finishTap=(p:Point)=>{const node=hit(p.x,p.y);const now=performance.now();const previous=runtime.lastTap;const doubleTap=Boolean(previous&&now-previous.time<320&&distance(previous.point,p)<28&&previous.nodeId===(node?.id||null));if(doubleTap){if(node){doubleCallbackRef.current?.(node);const item=layoutMap().get(node.id);if(item){if(runtime.view==='overview'&&item.domain!=='SYSTEM')focusDomain(item.domain);else focusNodeCamera(node.id)}}else reset();runtime.lastTap=null}else{if(node)callbackRef.current(node);runtime.lastTap={time:now,point:p,nodeId:node?.id||null}}schedule()};
    const up=(event:PointerEvent)=>{const p=point(event);const wasMoved=runtime.moved;runtime.pointers.delete(event.pointerId);if(runtime.pointers.size<2)runtime.pinch=null;if(!runtime.pointers.size){runtime.drag=null;runtime.last=null;canvas.style.cursor=runtime.hoverId?'pointer':'grab'}if(!wasMoved)finishTap(p)};
    const cancel=(event:PointerEvent)=>{runtime.pointers.delete(event.pointerId);runtime.pinch=null;runtime.drag=null;runtime.last=null;runtime.moved=true;canvas.style.cursor='grab'};
    const wheel=(event:WheelEvent)=>{event.preventDefault();pushHistory();const anchor=point(event);const next=zoomCameraAt(runtime.camera,anchor,{width,height},runtime.camera.scale*Math.exp(-event.deltaY*.0011));runtime.camera=next;runtime.target=copyCamera(next);schedule()};
    const fit=()=>{const selected=selectedRef.current;if(selected)focusNodeCamera(selected);else reset()};
    const back=()=>{const previous=runtime.history.pop();if(previous){runtime.target=previous;runtime.view='overview';schedule()}};
    const resetListener=()=>reset();
    const observer=new ResizeObserver(resize);observer.observe(host);resize();canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('wheel',wheel,{passive:false});window.addEventListener('atlas:fit-selection',fit);window.addEventListener('atlas:camera-back',back);window.addEventListener('atlas:reset-view',resetListener);redrawRef.current=()=>{runtime.appliedFocus=null;schedule()};schedule();
    return()=>{disposed=true;redrawRef.current=()=>{};cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('wheel',wheel);window.removeEventListener('atlas:reset-view',resetListener);window.removeEventListener('atlas:fit-selection',fit);window.removeEventListener('atlas:camera-back',back)};
  },[compact,reducedMotion,theme]);

  useEffect(()=>{redrawRef.current()},[edges,focusId,labelIds,layout,nodes,selectedId]);

  return <div ref={hostRef} className="canvas-graph-fallback atlas-canvas-25d" data-testid="atlas-canvas-25d" data-renderer="canvas-2.5d" style={{position:'absolute',inset:0,minHeight:compact?420:620,touchAction:'none'}}><canvas ref={canvasRef} tabIndex={0} aria-label="Atlas Canvas 2,5D. Arraste para mover, use pinça ou roda para zoom, toque para selecionar e toque duplo para focar." style={{display:'block',width:'100%',height:'100%',touchAction:'none'}}/></div>;
}
