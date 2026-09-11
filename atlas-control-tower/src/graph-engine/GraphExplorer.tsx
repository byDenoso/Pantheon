import {useEffect,useMemo,useRef,useState} from 'react';
import '../design/graph-v2.css';
import {loadGraphRuntime} from './runtime';
import {clampGraphZoom,graphDpr,graphLabelBudget,graphNodeBudget,selectVisibleGraphNodes} from './viewport.mjs';
import type {GraphEdge,GraphNode,GraphProjection} from './types';

type Props={
 projection:GraphProjection;
 learningEdges?:GraphEdge[];
 learning:boolean;
 selectedId?:string|null;
 selectedEdgeId?:string|null;
 onSelect:(id:string|null)=>void;
 onSelectEdge?:(id:string|null)=>void;
 onOpen?:(node:GraphNode)=>void;
 onToggleLearning?:(value:boolean)=>void;
};
type Viewport={scale:number;x:number;y:number};
type PointerPoint={x:number;y:number};

const colorFor=(type:string)=>{const t=type.toUpperCase();if(t==='ROOT')return 0xb9fbff;if(t==='DOMAIN')return 0x5cc8ff;if(t==='SUBGRAPH')return 0x7b72ff;if(t==='TEST')return 0xffcc78;if(t==='CLAIM')return 0xd98cff;if(t==='RESULT'||t==='EVIDENCE')return 0x69e7be;return 0x8ca8ff};
const px=(value:number|undefined,size:number)=>((value??50)/100)*size;
const distance=(a:PointerPoint,b:PointerPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const midpoint=(a:PointerPoint,b:PointerPoint)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const displayValue=(value:unknown)=>value===null||value===undefined||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);

export function GraphExplorer({projection,learningEdges=[],learning,selectedId=null,selectedEdgeId=null,onSelect,onSelectEdge,onOpen,onToggleLearning}:Props){
 const hostRef=useRef<HTMLDivElement|null>(null);
 const appRef=useRef<any>(null); // persistent Pixi application: one renderer per mounted explorer
 const worldRef=useRef<any>(null);
 const layersRef=useRef<{structural:any;learning:any;nodes:any}|null>(null);
 const redrawRef=useRef<(()=>void)|null>(null);
 const viewportRef=useRef<Viewport>({scale:1,x:0,y:0});
 const callbacksRef=useRef({onSelect,onSelectEdge,onOpen});
 const latestRef=useRef({projection,learningEdges,learning,selectedId,selectedEdgeId});
 const pointersRef=useRef(new Map<number,PointerPoint>());
 const dragRef=useRef<{x:number;y:number;originX:number;originY:number}|null>(null);
 const pinchRef=useRef<{distance:number;scale:number;worldX:number;worldY:number}|null>(null);
 const gestureMovedRef=useRef(false);
 const reducedMotionRef=useRef(false);
 const animatedOnceRef=useRef(false);
 const lastTapRef=useRef(new Map<string,number>());
 const [runtimeError,setRuntimeError]=useState(false);
 const [contextLost,setContextLost]=useState(false);

 callbacksRef.current={onSelect,onSelectEdge,onOpen};
 latestRef.current={projection,learningEdges,learning,selectedId,selectedEdgeId};

 const selected=useMemo(()=>projection.nodes.find(node=>node.id===selectedId)||null,[projection.nodes,selectedId]);
 const selectedEdge=useMemo(()=>learningEdges.find(edge=>edge.id===selectedEdgeId)||projection.edges.find(edge=>edge.id===selectedEdgeId)||null,[learningEdges,projection.edges,selectedEdgeId]);
 const a11yNodes=useMemo(()=>selectVisibleGraphNodes(projection.nodes,{focusId:projection.focusId,selectedId,budget:graphNodeBudget({width:typeof window==='undefined'?1280:window.innerWidth,nodeCount:projection.nodes.length})}) as GraphNode[],[projection,selectedId]);
 const a11yIds=useMemo(()=>new Set(a11yNodes.map(node=>node.id)),[a11yNodes]);
 const a11yEdges=useMemo(()=>learning?learningEdges.filter(edge=>a11yIds.has(edge.source)&&a11yIds.has(edge.target)):[],[learning,learningEdges,a11yIds]);

 useEffect(()=>{
  let disposed=false;
  let cleanup=()=>{};
  const started=performance.now();
  void loadGraphRuntime().then(async({PIXI,gsap})=>{
   const host=hostRef.current;if(disposed||!host)return;
   setRuntimeError(false);
   const initial=latestRef.current;
   const app=new PIXI.Application();
   await app.init({resizeTo:host,backgroundAlpha:0,antialias:true,resolution:graphDpr({devicePixelRatio:window.devicePixelRatio||1,width:host.clientWidth,nodeCount:initial.projection.nodes.length}),autoDensity:true});
   if(disposed){app.destroy(true);return}
   const canvas=app.canvas as HTMLCanvasElement;
   canvas.style.touchAction='none';
   host.replaceChildren(canvas);
   const world=new PIXI.Container();
   const structuralLayer=new PIXI.Container();const learningLayer=new PIXI.Container();const nodeLayer=new PIXI.Container();
   world.addChild(structuralLayer,learningLayer,nodeLayer);app.stage.addChild(world);
   appRef.current=app;worldRef.current=world;layersRef.current={structural:structuralLayer,learning:learningLayer,nodes:nodeLayer};

   const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
   reducedMotionRef.current=motion.matches;
   const onMotion=(event:MediaQueryListEvent)=>{reducedMotionRef.current=event.matches};
   motion.addEventListener?.('change',onMotion);

   const applyViewport=()=>{const target=worldRef.current;if(!target)return;const view=viewportRef.current;target.scale.set(view.scale);target.position.set(view.x,view.y)};
   const emitMetrics=(detail:Record<string,unknown>)=>window.dispatchEvent(new CustomEvent('atlas:graph-metrics',{detail:{engine:'pixi-v2',...detail}}));
   const clearLayer=(layer:any)=>{for(const child of layer.removeChildren())child.destroy?.({children:true})};
   const curve=(graphics:any,x1:number,y1:number,x2:number,y2:number,bend:number)=>graphics.moveTo(x1,y1).bezierCurveTo((x1+x2)/2,y1-bend,(x1+x2)/2,y2+bend,x2,y2);

   const draw=()=>{
    const current=latestRef.current;const layers=layersRef.current;const activeHost=hostRef.current;if(!layers||!activeHost)return;
    clearLayer(layers.structural);clearLayer(layers.learning);clearLayer(layers.nodes);
    const width=Math.max(activeHost.clientWidth,320),height=Math.max(activeHost.clientHeight,420);
    const budget=graphNodeBudget({width,nodeCount:current.projection.nodes.length});
    const visibleNodes=selectVisibleGraphNodes(current.projection.nodes,{focusId:current.projection.focusId,selectedId:current.selectedId,budget}) as GraphNode[];
    const visibleIds=new Set(visibleNodes.map(node=>node.id));
    const byId=new Map(visibleNodes.map(node=>[node.id,node]));
    const labelLimit=graphLabelBudget({width,nodeCount:visibleNodes.length});
    const labelIds=new Set<string>();
    if(current.projection.focusId&&visibleIds.has(current.projection.focusId))labelIds.add(current.projection.focusId);
    if(current.selectedId&&visibleIds.has(current.selectedId))labelIds.add(current.selectedId);
    for(const node of visibleNodes){if(labelIds.size>=labelLimit)break;labelIds.add(node.id)}

    for(const edge of current.projection.edges){
     const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
     const x1=px(a.x,width),y1=px(a.y,height),x2=px(b.x,width),y2=px(b.y,height);
     const dim=Boolean(current.selectedId&&edge.source!==current.selectedId&&edge.target!==current.selectedId);
     const graphics=new PIXI.Graphics();curve(graphics,x1,y1,x2,y2,18).stroke({width:edge.type==='CONTEXT'?1.2:1.8,color:0x426dff,alpha:dim?0.12:0.42});layers.structural.addChild(graphics);
    }

    if(current.learning){
     for(const edge of current.learningEdges){
      const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
      const x1=px(a.x,width),y1=px(a.y,height),x2=px(b.x,width),y2=px(b.y,height);const cross=String(edge.metadata?.scope||'')==='cross-domain';const active=current.selectedEdgeId===edge.id;
      const wrap=new PIXI.Container();
      const visual=new PIXI.Graphics();curve(visual,x1,y1,x2,y2,42).stroke({width:active?4:2.6,color:cross?0x58e7ff:0xb16cff,alpha:current.selectedEdgeId&&!active?0.2:0.82});
      const edgeHit=new PIXI.Graphics();curve(edgeHit,x1,y1,x2,y2,42).stroke({width:18,color:0xffffff,alpha:0.001});edgeHit.eventMode='static';edgeHit.cursor='pointer';
      edgeHit.on('pointertap',(event:any)=>{event.stopPropagation?.();callbacksRef.current.onSelectEdge?.(edge.id)});
      wrap.addChild(visual,edgeHit);layers.learning.addChild(wrap);
     }
    }

    for(const node of visibleNodes){
     const wrap=new PIXI.Container();wrap.x=px(node.x,width);wrap.y=px(node.y,height);wrap.eventMode='static';wrap.cursor='pointer';
     const graphics=new PIXI.Graphics();const radius=node.type==='ROOT'?38:node.type==='DOMAIN'?30:node.type==='SUBGRAPH'?24:16;
     graphics.circle(0,0,radius+10).fill({color:colorFor(node.type),alpha:0.08});
     graphics.circle(0,0,radius).fill({color:colorFor(node.type),alpha:current.selectedId&&current.selectedId!==node.id?0.5:0.96}).stroke({width:current.selectedId===node.id?3:1.2,color:0xd7f7ff,alpha:current.selectedId===node.id?0.98:0.38});wrap.addChild(graphics);
     if(labelIds.has(node.id)){const label=new PIXI.Text({text:node.label,style:{fontFamily:'Recursive,system-ui',fontSize:node.type==='ROOT'?15:12,fill:0xeaf7ff,fontWeight:'600',align:'center'}});label.anchor.set(0.5,0);label.y=radius+12;wrap.addChild(label)}
     wrap.on('pointertap',()=>{if(gestureMovedRef.current){gestureMovedRef.current=false;return}const now=performance.now();const last=lastTapRef.current.get(node.id)||0;if(now-last<360&&callbacksRef.current.onOpen)callbacksRef.current.onOpen(node);else callbacksRef.current.onSelect(node.id);lastTapRef.current.set(node.id,now)});layers.nodes.addChild(wrap);
    }
    applyViewport();
    if(!animatedOnceRef.current){animatedOnceRef.current=true;if(reducedMotionRef.current)world.alpha=1;else{world.alpha=0;gsap.to(world,{alpha:1,duration:0.34,ease:'power2.out'})}}
    emitMetrics({phase:'draw',nodes:current.projection.nodes.length,visibleNodes:visibleNodes.length,edges:current.projection.edges.length,learningEdges:current.learning?current.learningEdges.length:0,dpr:app.renderer.resolution,zoom:viewportRef.current.scale});
   };
   redrawRef.current=draw;

   const zoomAround=(nextScale:number,clientX:number,clientY:number)=>{const rect=canvas.getBoundingClientRect();const view=viewportRef.current;const next=clampGraphZoom(nextScale);const x=clientX-rect.left,y=clientY-rect.top;const worldX=(x-view.x)/view.scale,worldY=(y-view.y)/view.scale;viewportRef.current={scale:next,x:x-worldX*next,y:y-worldY*next};applyViewport()};
   const beginPinch=()=>{const points=[...pointersRef.current.values()];if(points.length<2){pinchRef.current=null;return}const a=points[0],b=points[1],mid=midpoint(a,b),rect=canvas.getBoundingClientRect(),view=viewportRef.current;const x=mid.x-rect.left,y=mid.y-rect.top;pinchRef.current={distance:Math.max(1,distance(a,b)),scale:view.scale,worldX:(x-view.x)/view.scale,worldY:(y-view.y)/view.scale}};
   const onPointerDown=(event:PointerEvent)=>{canvas.setPointerCapture?.(event.pointerId);pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY});gestureMovedRef.current=false;if(pointersRef.current.size===1){const view=viewportRef.current;dragRef.current={x:event.clientX,y:event.clientY,originX:view.x,originY:view.y}}else if(pointersRef.current.size===2)beginPinch()};
   const onPointerMove=(event:PointerEvent)=>{if(!pointersRef.current.has(event.pointerId))return;const previous=pointersRef.current.get(event.pointerId)!;if(Math.hypot(event.clientX-previous.x,event.clientY-previous.y)>2)gestureMovedRef.current=true;pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointersRef.current.size>=2&&pinchRef.current){const points=[...pointersRef.current.values()],a=points[0],b=points[1],mid=midpoint(a,b),rect=canvas.getBoundingClientRect(),pinch=pinchRef.current;const scale=clampGraphZoom(pinch.scale*(distance(a,b)/pinch.distance));const x=mid.x-rect.left,y=mid.y-rect.top;viewportRef.current={scale,x:x-pinch.worldX*scale,y:y-pinch.worldY*scale};applyViewport();return}if(dragRef.current){const drag=dragRef.current;viewportRef.current={...viewportRef.current,x:drag.originX+(event.clientX-drag.x),y:drag.originY+(event.clientY-drag.y)};applyViewport()}};
   const endPointer=(event:PointerEvent)=>{pointersRef.current.delete(event.pointerId);if(pointersRef.current.size<2)pinchRef.current=null;if(pointersRef.current.size===1){const point=[...pointersRef.current.values()][0],view=viewportRef.current;dragRef.current={x:point.x,y:point.y,originX:view.x,originY:view.y}}else dragRef.current=null};
   const onWheel=(event:WheelEvent)=>{event.preventDefault();zoomAround(viewportRef.current.scale*Math.exp(-event.deltaY*0.0012),event.clientX,event.clientY)};
   const onContextLost=(event:Event)=>{event.preventDefault();setContextLost(true);emitMetrics({phase:'webglcontextlost'})};
   const onContextRestored=()=>{setContextLost(false);emitMetrics({phase:'webglcontextrestored'});redrawRef.current?.()};
   canvas.addEventListener('pointerdown',onPointerDown);canvas.addEventListener('pointermove',onPointerMove);canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('wheel',onWheel,{passive:false});canvas.addEventListener('webglcontextlost',onContextLost);canvas.addEventListener('webglcontextrestored',onContextRestored);

   let frames=0,lastFpsSample=performance.now();
   const sampleFps=()=>{frames+=1;const now=performance.now();if(now-lastFpsSample>=1000){emitMetrics({phase:'fps',fps:Math.round(frames*1000/(now-lastFpsSample)),nodes:latestRef.current.projection.nodes.length});frames=0;lastFpsSample=now}};
   app.ticker.add(sampleFps);
   const resize=new ResizeObserver(()=>draw());resize.observe(host);
   draw();emitMetrics({phase:'init',initMs:Math.round((performance.now()-started)*10)/10,dpr:app.renderer.resolution});
   cleanup=()=>{resize.disconnect();app.ticker.remove(sampleFps);motion.removeEventListener?.('change',onMotion);canvas.removeEventListener('pointerdown',onPointerDown);canvas.removeEventListener('pointermove',onPointerMove);canvas.removeEventListener('pointerup',endPointer);canvas.removeEventListener('pointercancel',endPointer);canvas.removeEventListener('wheel',onWheel);canvas.removeEventListener('webglcontextlost',onContextLost);canvas.removeEventListener('webglcontextrestored',onContextRestored);redrawRef.current=null;appRef.current=null;worldRef.current=null;layersRef.current=null;app.destroy(true,{children:true})};
  }).catch(()=>setRuntimeError(true));
  return()=>{disposed=true;cleanup()};
 },[]);

 useEffect(()=>{redrawRef.current?.()},[projection,learningEdges,learning,selectedId,selectedEdgeId]);
 const zoomBy=(delta:number)=>{const host=hostRef.current;if(!host)return;const rect=host.getBoundingClientRect(),view=viewportRef.current,next=clampGraphZoom(view.scale+delta),cx=rect.width/2,cy=rect.height/2,wx=(cx-view.x)/view.scale,wy=(cy-view.y)/view.scale;viewportRef.current={scale:next,x:cx-wx*next,y:cy-wy*next};const world=worldRef.current;if(world){world.scale.set(next);world.position.set(viewportRef.current.x,viewportRef.current.y)}};
 const resetView=()=>{viewportRef.current={scale:1,x:0,y:0};const world=worldRef.current;if(world){world.scale.set(1);world.position.set(0,0)}};
 const edgeLabel=selectedEdge?String(selectedEdge.metadata?.relationType||selectedEdge.type):'';
 const edgeSource=selectedEdge?projection.nodes.find(node=>node.id===selectedEdge.source)?.label||selectedEdge.source:'';
 const edgeTarget=selectedEdge?projection.nodes.find(node=>node.id===selectedEdge.target)?.label||selectedEdge.target:'';

 return <section className="graph-v2-shell">
  <div className="graph-v2-toolbar"><div><strong>{projection.breadcrumbs.map(item=>item.label).join(' / ')||'NEXO'}</strong><span>{projection.nodes.length} nós · {projection.edges.length} relações</span></div><div className="graph-v2-controls"><button className={!learning?'active':''} onClick={()=>onToggleLearning?.(false)}>Estrutura</button><button className={learning?'active':''} onClick={()=>onToggleLearning?.(true)}>Learning</button><button aria-label="Reduzir zoom" onClick={()=>zoomBy(-0.14)}>−</button><button aria-label="Aumentar zoom" onClick={()=>zoomBy(0.14)}>+</button><button aria-label="Centralizar grafo" onClick={resetView}>Centro</button></div></div>
  <div className="graph-v2-main"><div className="graph-v2-canvas-frame"><div className="graph-v2-canvas" ref={hostRef}/>{runtimeError||contextLost?<div className="graph-v2-runtime-state" role="status"><strong>{contextLost?'Contexto gráfico interrompido':'Renderer indisponível'}</strong><span>{contextLost?'Aguardando restauração automática.':'O estado canônico foi preservado.'}</span></div>:null}<div className="graph-v2-a11y" aria-label="Navegação acessível do grafo"><span>Controles acessíveis do grafo</span>{a11yNodes.map(node=><button key={node.id} aria-label={`Selecionar ${node.label}`} onClick={()=>onSelect(node.id)} onDoubleClick={()=>onOpen?.(node)}>{node.label}</button>)}{a11yEdges.map(edge=><button key={edge.id} aria-label={`Selecionar relação ${edge.type}`} onClick={()=>onSelectEdge?.(edge.id)}>{edge.type}: {edge.source} → {edge.target}</button>)}</div></div>
   <aside className="graph-v2-inspector" aria-live="polite">{selectedEdge?<><span className="panel-kicker">RELAÇÃO LEARNING</span><h3>{edgeLabel}</h3><p>{edgeSource} → {edgeTarget}</p><dl><div><dt>Tipo</dt><dd>{selectedEdge.type}</dd></div><div><dt>Força</dt><dd>{selectedEdge.strength??'—'}</dd></div>{Object.entries(selectedEdge.metadata||{}).filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([key,value])=><div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></>:selected?<><span className="panel-kicker">{selected.type}</span><h3>{selected.label}</h3><p>{selected.summary||'Sem descrição publicada.'}</p><dl>{Object.entries(selected.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value??'—'}</dd></div>)}</dl>{onOpen?<button onClick={()=>onOpen(selected)}>Explorar →</button>:null}</>:<><span className="panel-kicker">EXPLORAÇÃO</span><h3>Selecione um nó ou relação</h3><p>Arraste para mover, use roda ou pinça para zoom. Learning adiciona apenas filamentos publicados e inspecionáveis.</p></>}</aside>
  </div>
 </section>;
}
