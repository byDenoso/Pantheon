import {defaultCamera,projectPoint} from './projection.mjs';
import {layoutNodes,interpolatePosition} from './layout.mjs';
import {filamentControl,quadraticBezierPoint,pulsePhase,filamentKind} from './filaments.mjs';
import {pickNode} from './picking.mjs';
import {orbitalDrift} from './motion.mjs';
import {placeLabels} from './labels.mjs';
import {PRESETS,SYSTEM_COLORS,STATUS_COLORS} from './palette.mjs';

const structural=n=>['SYSTEM','DOMAIN','CAMPAIGN'].includes(n?.type);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const fract=x=>x-Math.floor(x);

function hexRgb(hex){const h=hex.replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return[(n>>16)&255,(n>>8)&255,n&255]}
function mixHex(a,b,t){const A=hexRgb(a),B=hexRgb(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function alphaHex(alpha){return Math.round(clamp(alpha,0,1)*255).toString(16).padStart(2,'0')}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}}
function nodeBaseRadius(n){return n.type==='SYSTEM'?n.id==='system:NEXO'?30:23:n.type==='DOMAIN'?17:n.type==='CAMPAIGN'?14:n.type==='CLAIM'?11:n.type==='TEST'?9:7}
function kindStyle(kind){
 return {
  canonical:{width:1.25,alpha:.45,dash:[],tint:'#73bce9'},
  derived:{width:1,alpha:.28,dash:[5,7],tint:'#887cb3'},
  'cross-domain':{width:1.35,alpha:.34,dash:[2,6],tint:'#8fd3e7'},
  'intra-domain':{width:1.05,alpha:.32,dash:[],tint:'#6fa7c7'}
 }[kind]||{width:1,alpha:.3,dash:[],tint:'#6685a3'};
}

export class GraphLabRenderer{
 constructor(canvas,{onSelect,onOpen,onStats}={}){
  this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
  this.callbacks={onSelect,onOpen,onStats};
  this.camera=defaultCamera();this.options={...PRESETS.ORIGINAL};this.graph={nodes:[],edges:[]};
  this.focusId='system:NEXO';this.selectedId=null;this.hoverId=null;this.points=[];this.labels=[];
  this.positions=new Map();this.targetPositions=new Map();this.transition=null;this.running=false;this.raf=0;this.lastFrame=0;this.lastStatsAt=0;this.frameSamples=[];
  this.pointers=new Map();this.drag=null;this.pinchDistance=0;
  this.stars=Array.from({length:260},(_,i)=>({x:fract(Math.sin(i*12.9898)*43758.5453),y:fract(Math.sin(i*7.233)*19873.113),s:i%17===0?1.7:i%5===0?1.2:.7,a:i%17===0?.72:.28}));
  this.frame=this.frame.bind(this);this.installEvents();
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>this.render()).observe(canvas);
 }
 installEvents(){
  const c=this.canvas;
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.0011))},{passive:false});
  c.addEventListener('pointerdown',e=>{
   c.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
   this.drag={x:e.offsetX,y:e.offsetY,moved:0,button:e.button};this.pinchDistance=this.measurePinch();
  });
  c.addEventListener('pointermove',e=>{
   const prev=this.pointers.get(e.pointerId);
   if(prev){
    const dx=e.offsetX-prev.x,dy=e.offsetY-prev.y;this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
    if(this.drag)this.drag.moved+=Math.abs(dx)+Math.abs(dy);
    if(this.pointers.size===2){const d=this.measurePinch();if(this.pinchDistance)this.camera.zoom=clamp(this.camera.zoom*d/this.pinchDistance,.28,4.5);this.pinchDistance=d}
    else if(e.shiftKey||this.drag?.button===2){this.camera.panX+=dx;this.camera.panY+=dy}
    else{this.camera.yaw+=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.006,-1.35,1.35)}
   }else{
    const hit=pickNode(this.points,e.offsetX,e.offsetY);const next=hit?.node.id||null;
    if(next!==this.hoverId){this.hoverId=next;c.style.cursor=next?'pointer':'grab';this.render()}
   }
  });
  const finish=e=>{
   this.pointers.delete(e.pointerId);this.pinchDistance=this.measurePinch();
   if(this.drag&&this.drag.moved<7){const hit=pickNode(this.points,e.offsetX,e.offsetY);this.selectedId=hit?.node.id||null;this.callbacks.onSelect?.(hit?.node||null);this.render()}
   this.drag=null;
  };
  c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',finish);
  c.addEventListener('dblclick',e=>{const hit=pickNode(this.points,e.offsetX,e.offsetY);if(hit&&structural(hit.node))this.callbacks.onOpen?.(hit.node)});
  c.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.camera.yaw-=.12;if(e.key==='ArrowRight')this.camera.yaw+=.12;if(e.key==='ArrowUp')this.camera.pitch-=.12;if(e.key==='ArrowDown')this.camera.pitch+=.12;if(e.key==='+')this.zoom(1.12);if(e.key==='-')this.zoom(.88);this.render()});
 }
 measurePinch(){const p=[...this.pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0}
 setPreset(name){this.options={...PRESETS[name]||PRESETS.ORIGINAL};this.render();return this.options}
 setOptions(partial){Object.assign(this.options,partial);this.render()}
 setGraph(graph,{focusId=this.focusId}={}){
  const old=new Map(this.positions);this.graph=graph;this.focusId=focusId;
  const target=layoutNodes(graph.nodes,focusId,{baseRadius:245,ringGap:112,depthScale:145});
  const start=new Map();
  for(const node of graph.nodes){
   if(old.has(node.id))start.set(node.id,[...old.get(node.id)]);
   else{const anchor=old.get(node.parentId)||target.get(node.parentId)||[0,0,-45];start.set(node.id,[anchor[0],anchor[1],anchor[2]-22])}
  }
  this.positions=start;this.targetPositions=target;this.transition={start,target,at:performance.now(),duration:this.options.transitionMs||780};
  if(this.selectedId&&!graph.nodes.some(n=>n.id===this.selectedId))this.selectedId=null;
  this.render();
 }
 setFocus(id){this.focusId=id;this.setGraph(this.graph,{focusId:id})}
 reset(){this.camera=defaultCamera();this.render()}
 zoom(factor){this.camera.zoom=clamp(this.camera.zoom*factor,.28,4.5);this.render()}
 toggleFlat(){this.camera.flat=!this.camera.flat;this.render();return this.camera.flat}
 centerSelected(){const p=this.points.find(x=>x.node.id===this.selectedId);if(!p)return;this.camera.panX+=this.width/2-p.x;this.camera.panY+=this.height/2-p.y;this.render()}
 fit(){
  if(!this.positions.size)return;const xs=[...this.positions.values()].map(p=>p[0]),ys=[...this.positions.values()].map(p=>p[1]);
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),300);
  this.camera.zoom=clamp(640/span,.42,1.55);this.camera.panX=0;this.camera.panY=0;this.render();
 }
 start(){if(this.running)return;this.running=true;this.raf=requestAnimationFrame(this.frame)}
 stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
 frame(now){
  this.raf=0;if(!this.running)return;
  const dt=this.lastFrame?Math.min(80,now-this.lastFrame):16;this.lastFrame=now;
  if(this.options.autoOrbit&&!reducedMotion())this.camera.yaw+=dt*.00008;
  this.draw(now,dt);this.raf=requestAnimationFrame(this.frame);
 }
 render(){if(!this.running)this.draw(performance.now(),16)}
 updateTransition(now){
  if(!this.transition)return;
  const t=(now-this.transition.at)/this.transition.duration;
  if(t>=1){this.positions=new Map([...this.transition.target].map(([id,p])=>[id,[...p]]));this.transition=null;return}
  const next=new Map();for(const [id,target] of this.transition.target){const start=this.transition.start.get(id)||target;next.set(id,interpolatePosition(start,target,t))}this.positions=next;
 }
 resize(){
  const w=this.canvas.clientWidth||this.canvas.parentElement?.clientWidth||960,h=this.canvas.clientHeight||this.canvas.parentElement?.clientHeight||640;
  const dpr=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr)}
  this.ctx.setTransform(dpr,0,0,dpr,0,0);this.width=w;this.height=h;return{w,h,dpr};
 }
 draw(now,dt){
  const started=performance.now();this.updateTransition(now);const {w,h,dpr}=this.resize();const c=this.ctx,o=this.options;
  c.clearRect(0,0,w,h);c.fillStyle=o.background;c.fillRect(0,0,w,h);this.drawSpace(c,w,h);this.drawGuides(c,w,h);
  const still=reducedMotion(),positions=[];
  for(const node of this.graph.nodes){const base=this.positions.get(node.id)||[0,0,0],drift=still?[0,0,0]:orbitalDrift(node.id,now,o.drift);const xyz=[base[0]+drift[0],base[1]+drift[1],base[2]+drift[2]];const p=projectPoint(xyz,this.camera,w,h,{focalLength:o.focalLength});positions.push({...p,node,r:Math.max(4,nodeBaseRadius(node)*o.nodeRadius*p.scale)})}
  this.points=positions;const byId=new Map(positions.map(p=>[p.node.id,p]));this.drawFilaments(c,byId,now,still);this.drawNodes(c,positions,now);this.drawLabels(c,positions,w,h);
  const frameMs=performance.now()-started;this.frameSamples.push(frameMs);if(this.frameSamples.length>45)this.frameSamples.shift();
  if(now-this.lastStatsAt>220){this.lastStatsAt=now;const avg=this.frameSamples.reduce((a,b)=>a+b,0)/Math.max(1,this.frameSamples.length);this.callbacks.onStats?.({fps:avg?1000/avg:0,frameMs:avg,nodes:this.graph.nodes.length,edges:this.graph.edges.length,labels:this.labels.length,dpr})}
 }
 drawSpace(c,w,h){
  const o=this.options;const haze=c.createRadialGradient(w*.5,h*.43,0,w*.5,h*.43,Math.max(w,h)*.64);haze.addColorStop(0,'#14395b35');haze.addColorStop(.48,'#091a2d12');haze.addColorStop(1,o.background+'00');c.fillStyle=haze;c.fillRect(0,0,w,h);
  const count=Math.min(o.stars,this.stars.length);for(let i=0;i<count;i++){const s=this.stars[i];c.globalAlpha=s.a;c.fillStyle=i%19===0?'#bce8ff':'#7894ae';c.fillRect(s.x*w,s.y*h,s.s,s.s)}c.globalAlpha=1;
 }
 drawGuides(c,w,h){
  c.save();c.translate(w/2+(this.camera.panX||0),h/2+(this.camera.panY||0));c.strokeStyle='#6ea5cf20';c.lineWidth=1;
  for(const r of [120,220,330]){c.beginPath();c.ellipse(0,0,r*this.camera.zoom,r*.34*this.camera.zoom,-.22,0,Math.PI*2);c.stroke()}c.restore();
 }
 drawFilaments(c,byId,now,still){
  const o=this.options;
  for(const edge of this.graph.edges){const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;const kind=filamentKind(edge),style=kindStyle(kind),cp=filamentControl(a,b,o.filamentCurve,edge.source<edge.target?1:-1);const depth=(a.z+b.z)/2;const fade=1-clamp((110-depth)/600,0,o.fog);const col=mixHex(style.tint,o.background,(1-fade)*.55);
   c.globalAlpha=style.alpha*fade;c.strokeStyle=col;c.lineWidth=style.width;c.setLineDash(style.dash);c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(cp.cx,cp.cy,b.x,b.y);c.stroke();c.setLineDash([]);
   if(still)continue;const pulse=pulsePhase(edge.id||`${edge.source}:${edge.target}`,now,.24*o.pulseSpeed);const head=quadraticBezierPoint(a,cp,b,pulse.t);const behind=quadraticBezierPoint(a,cp,b,clamp(pulse.t-pulse.direction*.065,0,1));c.globalAlpha=.35;c.lineWidth=3.2;c.beginPath();c.moveTo(behind.x,behind.y);c.lineTo(head.x,head.y);c.stroke();
   const g=c.createRadialGradient(head.x,head.y,0,head.x,head.y,10*o.glow);g.addColorStop(0,col+'e8');g.addColorStop(.35,col+'58');g.addColorStop(1,col+'00');c.globalAlpha=1;c.fillStyle=g;c.beginPath();c.arc(head.x,head.y,10*o.glow,0,Math.PI*2);c.fill();c.fillStyle='#eafbff';c.beginPath();c.arc(head.x,head.y,1.7,0,Math.PI*2);c.fill();
  }c.globalAlpha=1;
 }
 nodeColor(node){return SYSTEM_COLORS[node.id]||SYSTEM_COLORS[`system:${node.system}`]||STATUS_COLORS[node.status]||'#80b7dc'}
 drawNodes(c,points,now){
  const o=this.options;for(const p of [...points].sort((a,b)=>a.z-b.z)){const n=p.node,base=this.nodeColor(n),near=clamp((p.z+320)/700,0,1),col=mixHex(base,o.background,(1-near)*o.fog),selected=n.id===this.selectedId,hover=n.id===this.hoverId,focus=n.id===this.focusId;const r=p.r*(selected||hover?1.08:1);
   const halo=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r*(focus?5.7:4.1)*o.glow);halo.addColorStop(0,col+alphaHex(focus?.30:.22));halo.addColorStop(.48,col+'18');halo.addColorStop(1,col+'00');c.fillStyle=halo;c.beginPath();c.arc(p.x,p.y,r*(focus?5.7:4.1)*o.glow,0,Math.PI*2);c.fill();
   if(n.type==='SYSTEM'){const angle=now*.0004+String(n.id).length;const sr=r+9;c.fillStyle=col+'dc';c.beginPath();c.arc(p.x+Math.cos(angle)*sr,p.y+Math.sin(angle)*sr*.55,focus?2.3:1.5,0,Math.PI*2);c.fill()}
   if(focus){c.strokeStyle=col+'70';c.lineWidth=1.2;for(let k=0;k<3;k++){c.beginPath();c.ellipse(p.x,p.y,r*(1.65+k*.34),r*(.52+k*.12),-.32+k*.18,0,Math.PI*2);c.stroke()}}
   const sphere=c.createRadialGradient(p.x-r*.34,p.y-r*.42,0,p.x+r*.18,p.y+r*.18,r*1.22);sphere.addColorStop(0,'#f8fdff');sphere.addColorStop(.18,col);sphere.addColorStop(.58,mixHex(col,o.background,.34));sphere.addColorStop(1,mixHex(col,o.background,.78));c.fillStyle=sphere;c.strokeStyle=col+'ef';c.lineWidth=selected||hover?2.3:1.1;c.beginPath();
   if(n.type==='CLAIM'){c.moveTo(p.x,p.y-r*1.2);c.lineTo(p.x+r,p.y);c.lineTo(p.x,p.y+r*1.2);c.lineTo(p.x-r,p.y);c.closePath()}else if(n.type==='RESULT'){roundRect(c,p.x-r,p.y-r,r*2,r*2,Math.max(2,r*.25))}else c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.stroke();
   if(selected||hover){c.strokeStyle='#dff6ff';c.lineWidth=1.2;c.beginPath();c.arc(p.x,p.y,r+6,0,Math.PI*2);c.stroke()}
  }
 }
 drawLabels(c,points,w,h){
  const reserved=[{x:12,y:12,w:220,h:52},{x:w-190,y:12,w:178,h:48},{x:w/2-170,y:h-70,w:340,h:58}];
  this.labels=placeLabels(points,{width:w,height:h,focusId:this.focusId,selectedId:this.selectedId,hoverId:this.hoverId,maxLabels:this.options.maxLabels,reserved});
  c.textAlign='center';for(const l of this.labels){const col=this.nodeColor(l.point.node);roundRect(c,l.x,l.y,l.w,l.h,8);c.fillStyle='#06101bdc';c.fill();c.strokeStyle=col+'aa';c.lineWidth=1;c.stroke();c.fillStyle=this.options.text;c.font='650 12px ui-sans-serif,system-ui,sans-serif';c.fillText(l.label,l.x+l.w/2,l.y+15);c.fillStyle=this.options.muted;c.font='700 8px ui-sans-serif,system-ui,sans-serif';c.fillText(l.type,l.x+l.w/2,l.y+26)}
 }
}
