import {layoutNodes} from '../layout.mjs';
import {filamentControl,filamentStyle} from '../filaments.mjs';
import {placeLabels} from '../labels.mjs';
import {pickNode} from '../picking.mjs';
import {PRESETS,getPalette,colorForNode,levelStyle} from '../palette.mjs';
import './visual-presets.mjs';

const PIXI_URL='https://esm.sh/pixi.js@8.20.1?bundle';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const toNumber=color=>Number.parseInt(String(color||'#ffffff').replace('#',''),16)||0xffffff;
const rgba=value=>{const m=/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?/.exec(String(value||''));if(!m)return{color:toNumber(value),alpha:1};return{color:(Number(m[1])<<16)|(Number(m[2])<<8)|Number(m[3]),alpha:m[4]==null?1:Number(m[4])}};

export class PixiGraphRenderer{
 constructor(container,{onSelect,onOpen,onStats,onHover}={}){
  this.container=container;
  this.callbacks={onSelect,onOpen,onStats,onHover};
  this.options={...PRESETS.ORIGINAL};
  this.palette=getPalette('A');
  this.source={rootId:null,nodes:[],edges:[]};
  this.focusId=null;this.selectedId=null;this.hoverId=null;
  this.positions=new Map();this.targetPositions=new Map();this.points=[];this.labels=[];
  this.camera={zoom:1,panX:0,panY:0};
  this.running=false;this.raf=0;this.destroyed=false;this.lastStatsAt=0;this.frameSamples=[];
  this.canvas=null;this.overlay=document.createElement('canvas');this.overlay.className='graph-overlay atlas-pixi-overlay';this.overlay.tabIndex=0;
  container.replaceChildren(this.overlay);
  this.ctx=this.overlay.getContext('2d');
  this.frame=this.frame.bind(this);
  this.eventController=new AbortController();
  this.installEvents();
  this.ready=this.initPixi();
  if(typeof ResizeObserver==='function'){this.resizeObserver=new ResizeObserver(()=>{this.resize();this.invalidate()});this.resizeObserver.observe(container)}
 }

 async initPixi(){
  const PIXI=await import(PIXI_URL);
  if(this.destroyed)return null;
  let app=new PIXI.Application();
  try{await app.init({backgroundAlpha:0,antialias:true,autoStart:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgpu',powerPreference:'high-performance'})}
  catch(webgpuError){
   try{app.destroy(true)}catch{}
   app=new PIXI.Application();
   await app.init({backgroundAlpha:0,antialias:true,autoStart:false,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2),preference:'webgl',powerPreference:'high-performance'});
   console.info('[Atlas] Pixi WebGPU unavailable; using WebGL.',webgpuError?.message||webgpuError);
  }
  if(this.destroyed){app.destroy(true);return null}
  this.PIXI=PIXI;this.app=app;this.canvas=app.canvas;this.canvas.className='graph-gl atlas-pixi-canvas';
  this.container.insertBefore(this.canvas,this.overlay);
  this.edgeLayer=new PIXI.Graphics();
  this.nodeLayer=new PIXI.Container();
  this.app.stage.addChild(this.edgeLayer,this.nodeLayer);
  this.resize();this.rebuildScene();this.invalidate();
  return app;
 }

 scaleMap(raw){const spacing=Math.max(.55,Number(this.options.layoutSpacing||1));return new Map([...raw].map(([id,p])=>[id,[p[0]*spacing,p[1]*spacing,p[2]*spacing]]))}

 setGraph(source,{focusId=this.focusId,fit=false}={}){
  this.source=source||{rootId:null,nodes:[],edges:[]};
  this.focusId=focusId||this.source.rootId;
  this.targetPositions=this.scaleMap(layoutNodes(this.source.nodes,this.focusId,{baseRadius:250,ringGap:128,depthScale:120}));
  this.positions=new Map([...this.targetPositions].map(([id,p])=>[id,[...p]]));
  if(this.selectedId&&!this.source.nodes.some(node=>node.id===this.selectedId))this.selectedId=null;
  if(fit)this.fit();
  this.ready?.then(()=>{if(!this.destroyed){this.rebuildScene();this.invalidate()}});
  this.emitStats();
 }

 rebuildScene(){
  if(!this.app||!this.PIXI||!this.nodeLayer)return;
  this.nodeLayer.removeChildren().forEach(child=>child.destroy?.({children:true}));
  this.nodeObjects=new Map();
  for(const node of this.source.nodes){
   const g=new this.PIXI.Graphics();g.eventMode='none';
   this.nodeLayer.addChild(g);this.nodeObjects.set(node.id,{node,graphics:g});
  }
  this.drawScene();
 }

 project(position){
  const scale=Math.min(this.width/1000,this.height/700)*this.camera.zoom;
  return{x:this.width/2+position[0]*scale+this.camera.panX,y:this.height/2+position[1]*scale+this.camera.panY,z:position[2],scale};
 }

 drawScene(){
  if(!this.app||!this.edgeLayer||!this.nodeObjects)return;
  const started=performance.now();
  const points=[];
  for(const node of this.source.nodes){
   const pos=this.positions.get(node.id)||[0,0,0],p=this.project(pos),style=levelStyle(node);
   const radius=clamp(style.radius*this.options.nodeRadius*p.scale,4,node.id===this.source.rootId?32:25);
   points.push({...p,node,r:radius});
  }
  this.points=points;
  const byId=new Map(points.map(point=>[point.node.id,point]));
  this.edgeLayer.clear();
  for(const edge of this.source.edges){
   const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
   const style=filamentStyle(edge,this.palette),paint=rgba(style.stroke),cp=filamentControl(a,b,this.options.filamentCurve,edge.source<edge.target?1:-1);
   this.edgeLayer.moveTo(a.x,a.y).quadraticCurveTo(cp.cx,cp.cy,b.x,b.y).stroke({color:paint.color,width:style.width||1,alpha:paint.alpha});
  }
  for(const point of points){
   const object=this.nodeObjects.get(point.node.id);if(!object)continue;
   const g=object.graphics,color=toNumber(colorForNode(point.node,this.palette));g.clear();
   const selected=point.node.id===this.selectedId,hovered=point.node.id===this.hoverId;
   if(selected||hovered)g.circle(point.x,point.y,point.r*2.25).fill({color,alpha:selected?.16:.10});
   g.circle(point.x,point.y,point.r*1.48).fill({color,alpha:.10*this.options.glow});
   g.circle(point.x,point.y,point.r).fill({color,alpha:selected?1:.86});
   g.circle(point.x,point.y,Math.max(1.25,point.r*.22)).fill({color:0xffffff,alpha:.94});
  }
  this.app.render();
  this.drawOverlay();
  const frameMs=performance.now()-started;this.frameSamples.push(frameMs);if(this.frameSamples.length>40)this.frameSamples.shift();this.emitStats();
 }

 reservedBoxes(){return [...document.querySelectorAll('[data-label-reserved]')].map(el=>{const r=el.getBoundingClientRect(),root=this.container.getBoundingClientRect();return{x:r.left-root.left,y:r.top-root.top,w:r.width,h:r.height}}).filter(r=>r.w>0&&r.h>0)}

 drawOverlay(){
  const {width:w,height:h}=this;this.ctx.clearRect(0,0,w,h);
  this.labels=placeLabels(this.points,{width:w,height:h,focusId:this.focusId,selectedId:this.selectedId,hoverId:this.hoverId,maxLabels:this.options.maxLabels,reserved:this.reservedBoxes()});
  const ctx=this.ctx,light=this.palette.id==='LIGHT';
  for(const label of this.labels){
   const color=colorForNode(label.point.node,this.palette);ctx.save();ctx.beginPath();ctx.roundRect?.(label.x,label.y,label.w,label.h,6);if(!ctx.roundRect)ctx.rect(label.x,label.y,label.w,label.h);ctx.fillStyle=light?'rgba(247,251,255,.92)':'rgba(7,12,18,.84)';ctx.fill();ctx.strokeStyle=color;ctx.globalAlpha=.72;ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=light?'#102033':'#eaf3ff';ctx.font='700 11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(label.label,label.x+label.w/2,label.y+14,label.w-10);ctx.fillStyle=light?'#425e78':'#8da7bd';ctx.font='700 7px system-ui,sans-serif';ctx.fillText(String(label.type||''),label.x+label.w/2,label.y+25,label.w-10);ctx.restore();
  }
 }

 resize(){
  const rect=this.container.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);this.dpr=Math.min(devicePixelRatio||1,2);
  this.overlay.width=Math.round(this.width*this.dpr);this.overlay.height=Math.round(this.height*this.dpr);this.overlay.style.width=`${this.width}px`;this.overlay.style.height=`${this.height}px`;this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  if(this.app)this.app.renderer.resize(this.width,this.height,this.dpr);
 }

 fit(){
  if(!this.targetPositions.size)return;const xs=[...this.targetPositions.values()].map(p=>p[0]),ys=[...this.targetPositions.values()].map(p=>p[1]);const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);const available=Math.min(this.width/Math.max(spanX,1),this.height/Math.max(spanY,1));const base=Math.min(this.width/1000,this.height/700)||1;this.camera.zoom=clamp((available/base)*.72/Math.max(.72,Number(this.options.fitPadding||1)),.34,2.2);this.camera.panX=0;this.camera.panY=0;this.invalidate();
 }
 reset(){this.camera={zoom:1,panX:0,panY:0};this.invalidate()}
 zoom(factor){this.camera.zoom=clamp(this.camera.zoom*factor,.28,4.5);this.invalidate()}
 toggleFlat(){return true}
 setSelected(id){this.selectedId=id;this.invalidate()}
 focusNode(id){const p=this.targetPositions.get(id);if(!p)return;const screen=this.project(p);this.camera.panX+=this.width/2-screen.x;this.camera.panY+=this.height/2-screen.y;this.selectedId=id;this.invalidate()}
 centerSelected(){this.focusNode(this.selectedId)}
 setPreset(name){this.options={...(PRESETS[name]||PRESETS.ORIGINAL)};this.invalidate();return this.options}
 setOptions(partial={}){Object.assign(this.options,partial);this.invalidate()}
 setTheme(theme='dark'){this.palette=getPalette(theme==='light'?'LIGHT':'A');this.invalidate()}

 installEvents(){
  const surface=this.overlay;let drag=null;const signal=this.eventController.signal;
  surface.addEventListener('wheel',event=>{event.preventDefault();this.zoom(Math.exp(-event.deltaY*.0011))},{passive:false,signal:this.eventController.signal});
  surface.addEventListener('pointerdown',event=>{surface.setPointerCapture?.(event.pointerId);drag={x:event.offsetX,y:event.offsetY,moved:0}},{signal:this.eventController.signal});
  surface.addEventListener('pointermove',event=>{
   if(drag){const dx=event.offsetX-drag.x,dy=event.offsetY-drag.y;drag.x=event.offsetX;drag.y=event.offsetY;drag.moved+=Math.abs(dx)+Math.abs(dy);this.camera.panX+=dx;this.camera.panY+=dy;this.invalidate();return}
   const hit=pickNode(this.points,event.offsetX,event.offsetY),next=hit?.node.id||null;if(next!==this.hoverId){this.hoverId=next;surface.style.cursor=next?'pointer':'grab';this.callbacks.onHover?.(hit?.node||null);this.invalidate()}
  },{signal:this.eventController.signal});
  const finish=event=>{if(drag&&drag.moved<7){const hit=pickNode(this.points,event.offsetX,event.offsetY);this.selectedId=hit?.node.id||null;this.callbacks.onSelect?.(hit?.node||null)}drag=null;this.invalidate()};
  surface.addEventListener('pointerup',finish,{signal:this.eventController.signal});surface.addEventListener('pointercancel',()=>{drag=null},{signal:this.eventController.signal});surface.addEventListener('dblclick',event=>{const hit=pickNode(this.points,event.offsetX,event.offsetY);if(hit)this.callbacks.onOpen?.(hit.node)},{signal:this.eventController.signal});
 }

 emitStats(){const now=performance.now();if(now-this.lastStatsAt<180)return;this.lastStatsAt=now;const avg=this.frameSamples.reduce((a,b)=>a+b,0)/Math.max(1,this.frameSamples.length);this.callbacks.onStats?.({fps:this.running&&avg?Math.min(120,1000/avg):60,frameMs:avg||0,nodes:this.source.nodes.length,edges:this.source.edges.length,labels:this.labels.length,dpr:this.dpr||1})}
 frame(){this.raf=0;if(!this.running||this.destroyed)return;this.drawScene();this.raf=requestAnimationFrame(this.frame)}
 start(){if(this.running)return;this.running=true;this.ready?.then(()=>{if(!this.destroyed&&!this.raf)this.raf=requestAnimationFrame(this.frame)})}
 stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
 invalidate(){if(this.destroyed)return;this.ready?.then(()=>{if(!this.destroyed)this.drawScene()})}
 destroy(){this.destroyed=true;this.stop();this.eventController?.abort();this.resizeObserver?.disconnect();try{this.app?.destroy(true,{children:true})}catch{}this.container.replaceChildren()}
}
