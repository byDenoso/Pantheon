import Graph from 'graphology';
import Sigma from 'sigma';
import {layoutNodes} from './layout.mjs';
import {getPalette,colorForNode,PRESETS} from './palette.mjs';
import {filamentStyle,pulsePhase,quadraticBezierPoint} from './filaments.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const important=n=>n.id==='NEXO'||n.id==='system:NEXO'||n.authority==='canonical'||n.type==='SYSTEM'||n.kind==='SYSTEM';

export class GraphLabRenderer{
  constructor(container,{onSelect,onOpen,onStats}={}){
    this.container=container;this.callbacks={onSelect,onOpen,onStats};this.options={...PRESETS.ORIGINAL};this.palette=getPalette('A');
    this.graph=new Graph({multi:true,type:'undirected'});this.source={nodes:[],edges:[]};this.focusId='system:NEXO';this.selectedId=null;this.hoverId=null;this.running=false;this.raf=0;this.lastStatsAt=0;
    this.sigmaHost=document.createElement('div');this.sigmaHost.className='sigma-host';this.overlay=document.createElement('canvas');this.overlay.className='graph-overlay';this.overlay.setAttribute('aria-hidden','true');
    container.replaceChildren(this.sigmaHost,this.overlay);this.ctx=this.overlay.getContext('2d');
    this.sigma=new Sigma(this.graph,this.sigmaHost,{renderEdgeLabels:false,labelRenderedSizeThreshold:999,nodeReducer:(id,data)=>this.reduceNode(id,data),edgeReducer:(id,data)=>this.reduceEdge(id,data)});
    this.installEvents();this.resizeObserver=new ResizeObserver(()=>{this.resizeOverlay();this.invalidate()});this.resizeObserver.observe(container);this.resizeOverlay();
  }
  installEvents(){
    this.sigma.on('enterNode',({node})=>{this.hoverId=node;this.sigma.refresh();this.invalidate()});
    this.sigma.on('leaveNode',()=>{this.hoverId=null;this.sigma.refresh();this.invalidate()});
    this.sigma.on('clickNode',({node})=>{this.selectedId=node;this.callbacks.onSelect?.(this.nodeById(node));this.sigma.refresh();this.invalidate()});
    this.sigma.on('doubleClickNode',({node,event})=>{event?.preventSigmaDefault?.();const n=this.nodeById(node);if(n)this.callbacks.onOpen?.(n)});
    this.sigma.getCamera().on('updated',()=>this.invalidate());
  }
  nodeById(id){return this.source.nodes.find(n=>n.id===id)||null}
  neighborSet(id){if(!id||!this.graph.hasNode(id))return new Set();return new Set(this.graph.neighbors(id))}
  reduceNode(id,data){const focus=this.hoverId||this.selectedId;if(!focus)return data;const neighbors=this.neighborSet(focus);const visible=id===focus||neighbors.has(id);return{...data,color:visible?data.baseColor:data.baseColor+'26',zIndex:id===focus?3:visible?2:1,size:data.baseSize*(id===focus?1.22:visible?1.06:.86)}}
  reduceEdge(id,data){const focus=this.hoverId||this.selectedId;if(!focus)return data;const [s,t]=this.graph.extremities(id);const active=s===focus||t===focus;return{...data,color:active?this.palette.filaments.pulse:'rgba(90,100,112,0.06)',size:active?2:0.55,zIndex:active?2:0}}
  setPreset(name){this.options={...(PRESETS[name]||PRESETS.ORIGINAL),renderer:'sigma-canvas',palette:'A'};this.palette=getPalette(this.options.palette);this.sigma.refresh();this.invalidate();return this.options}
  setOptions(partial){Object.assign(this.options,partial);this.invalidate()}
  setGraph(source,{focusId=this.focusId}={}){
    this.source=source;this.focusId=focusId;const positions=layoutNodes(source.nodes,focusId,{baseRadius:245,ringGap:112,depthScale:145});this.graph.clear();
    for(const node of source.nodes){const p=positions.get(node.id)||[0,0,0];const baseColor=colorForNode(node,this.palette);const baseSize=(node.id===focusId?9:important(node)?7:5)*this.options.nodeRadius;this.graph.addNode(node.id,{...node,x:p[0],y:p[1],label:node.label||node.id,baseColor,color:baseColor,baseSize,size:baseSize,zIndex:important(node)?2:1});}
    for(const [i,edge] of source.edges.entries()){if(!this.graph.hasNode(edge.source)||!this.graph.hasNode(edge.target))continue;const key=edge.id||`edge:${i}:${edge.source}:${edge.target}`;const style=filamentStyle(edge,this.palette);this.graph.addEdgeWithKey(key,edge.source,edge.target,{...edge,color:style.stroke,size:style.width,zIndex:0});}
    if(this.selectedId&&!this.graph.hasNode(this.selectedId))this.selectedId=null;this.sigma.refresh();this.fit();this.invalidate();this.emitStats();
  }
  setFocus(id){this.focusId=id;this.setGraph(this.source,{focusId:id})}
  zoom(factor){const c=this.sigma.getCamera();const s=c.getState();c.animate({...s,ratio:clamp(s.ratio/factor,.05,20)},{duration:180})}
  fit(){this.sigma.getCamera().animatedReset({duration:260})}
  reset(){this.fit()}
  toggleFlat(){return true}
  centerSelected(){if(!this.selectedId||!this.graph.hasNode(this.selectedId))return;const p=this.sigma.getNodeDisplayData(this.selectedId);if(!p)return;this.sigma.getCamera().animate({x:p.x,y:p.y,ratio:Math.min(this.sigma.getCamera().getState().ratio,.7)},{duration:260})}
  start(){this.running=true;this.invalidate()}
  stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
  destroy(){this.stop();this.resizeObserver?.disconnect();this.sigma?.kill();this.container.replaceChildren()}
  invalidate(){if(!this.running||this.raf)return;this.raf=requestAnimationFrame(t=>{this.raf=0;this.drawOverlay(t);if(this.options.pulseSpeed>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches)this.invalidate()})}
  resizeOverlay(){const r=this.container.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.overlay.width=Math.max(1,Math.round(r.width*dpr));this.overlay.height=Math.max(1,Math.round(r.height*dpr));this.overlay.style.width=`${r.width}px`;this.overlay.style.height=`${r.height}px`;this.ctx.setTransform(dpr,0,0,dpr,0,0);this.width=r.width;this.height=r.height}
  viewportPoint(id){const d=this.sigma.getNodeDisplayData(id);return d?this.sigma.graphToViewport({x:d.x,y:d.y}):null}
  drawOverlay(now){const c=this.ctx,w=this.width,h=this.height,p=this.palette;c.clearRect(0,0,w,h);this.drawAmbient(c,w,h,p);this.drawFilaments(c,now,p);this.drawHalos(c,p);this.drawLabels(c,p);this.emitStats(now)}
  drawAmbient(c,w,h,p){const g=c.createRadialGradient(w*.5,h*.4,0,w*.5,h*.4,Math.max(w,h)*.72);g.addColorStop(0,p.background.nebulaA);g.addColorStop(.55,p.background.nebulaB);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,w,h);c.globalAlpha=.34;c.fillStyle=p.background.stars;for(let i=0;i<Math.min(this.options.stars,140);i++){const x=((i*73)%997)/997*w,y=((i*193)%991)/991*h;c.fillRect(x,y,i%19===0?1.4:.65,i%19===0?1.4:.65)}c.globalAlpha=1}
  drawFilaments(c,now,p){for(const [i,e] of this.source.edges.entries()){const a=this.viewportPoint(e.source),b=this.viewportPoint(e.target);if(!a||!b)continue;const s=filamentStyle(e,p);c.strokeStyle=s.stroke;c.lineWidth=s.width;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();const active=this.hoverId&&[e.source,e.target].includes(this.hoverId)||this.selectedId&&[e.source,e.target].includes(this.selectedId);if(!active||this.options.pulseSpeed<=0)continue;const phase=pulsePhase(e.id||String(i),now,.22*this.options.pulseSpeed);const q=quadraticBezierPoint(a,{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2},b,phase.t);const glow=c.createRadialGradient(q.x,q.y,0,q.x,q.y,10);glow.addColorStop(0,p.filaments.pulseHalo);glow.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=glow;c.beginPath();c.arc(q.x,q.y,10,0,Math.PI*2);c.fill();c.fillStyle=p.filaments.pulse;c.beginPath();c.arc(q.x,q.y,1.7,0,Math.PI*2);c.fill()}}
  drawHalos(c,p){const ids=new Set([this.focusId,this.selectedId,this.hoverId].filter(Boolean));for(const id of ids){const q=this.viewportPoint(id);if(!q)continue;const selected=id===this.selectedId;const r=selected?28:22;const g=c.createRadialGradient(q.x,q.y,4,q.x,q.y,r);g.addColorStop(0,selected?p.chrome.accentSoft:p.nodes.glow);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();if(selected){c.strokeStyle=p.chrome.accent;c.globalAlpha=.55;c.beginPath();c.arc(q.x,q.y,13,0,Math.PI*2);c.stroke();c.globalAlpha=1}}}
  drawLabels(c,p){const candidates=this.source.nodes.filter(n=>n.id===this.selectedId||n.id===this.hoverId||n.id===this.focusId||important(n)).slice(0,this.options.maxLabels);for(const n of candidates){const q=this.viewportPoint(n.id);if(!q)continue;const text=n.label||n.id;c.font='600 11px Inter,system-ui,sans-serif';const tw=c.measureText(text).width,pad=7,x=q.x+12,y=q.y-10;c.fillStyle=n.id===this.selectedId?p.labels.selectedBg:p.labels.bg;c.strokeStyle=n.id===this.selectedId?p.labels.selectedBorder:p.labels.border;c.lineWidth=1;c.beginPath();c.roundRect?.(x,y-14,tw+pad*2,24,7);if(c.roundRect){c.fill();c.stroke()}else{c.fillRect(x,y-14,tw+pad*2,24);c.strokeRect(x,y-14,tw+pad*2,24)}c.fillStyle=p.labels.text;c.fillText(text,x+pad,y+2)}}
  emitStats(now=performance.now()){if(now-this.lastStatsAt<220)return;this.lastStatsAt=now;this.callbacks.onStats?.({fps:60,frameMs:0,nodes:this.graph.order,edges:this.graph.size,labels:Math.min(this.options.maxLabels,this.source.nodes.length),dpr:Math.min(devicePixelRatio||1,2)})}
}
