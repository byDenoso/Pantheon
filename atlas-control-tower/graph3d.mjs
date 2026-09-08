import {themePalette,MAP_CONFIG,FILAMENT_STYLE,SYSTEM_COLORS,mixHex} from './ui/visual-config.mjs';
import {clusteredPositions,visualCut,withDomainLinks} from './ui/map-data.mjs';
import {nodeDisplayLabel} from './ui/cockpit-copy.mjs';
import {orbitalOffset} from './ui/orbital-layout.mjs';
import {buildFilaments,advancePulse,filamentControl,quadraticBezierPoint} from './ui/filaments.mjs';
import {projectionLayout,applyLod,cull,LOD_BUDGET} from './ui/projection-layout.mjs';

/** Layer identity is carried by the ring around a body; its fill stays the
 *  operational signal, so status and provenance are readable at the same time. */
export const LAYER_ACCENT=Object.freeze({science:'#4da3ff',execution:'#ff7ac2',integrity:'#57e0c0'});

export function project([x,y,z],c,w,h){
 if(c.flat)z=0;
 const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
 const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp,depth=y*sp+zz*cp;
 const scale=750/(750-depth)*(c.zoom||1)*Math.min(w/1000,h/660);
 return{x:w/2+xx*scale+(c.panX||0),y:h/2+yy*scale+(c.panY||0),z:depth,scale};
}

export function layout(nodes,focus){
 const count=Math.max(1,nodes.length-1);let k=0;
 return nodes.map(n=>{
  if(n.id===focus)return[0,0,0];
  const i=k++;
  if(count<10){const a=i/count*Math.PI*2-.78;return[Math.cos(a)*285,Math.sin(a)*205,Math.sin(a*2)*82]}
  const r=count<30?275:325,angle=i*2.399963229728653,yy=1-2*(i+.5)/count,rad=Math.sqrt(1-yy*yy);
  return[Math.cos(angle)*rad*r,yy*r*.8,Math.sin(angle)*rad*r*.75];
 });
}

export const colors={supported:'#69dec0',partial:'#efc379',negative:'#f38999',blocked:'#ff687c',active:'#6bceff',legacy:'#73819b',unknown:'#a2b3ce'};
/** A structural body opens (drills in); a leaf selects (inspects). Projection
 *  tiers that group other tiers behave the same way as the declared systems. */
const structural=n=>['SYSTEM','DOMAIN','CAMPAIGN','TRUTH_OWNER','SOURCE','RUNTIME','AGENT'].includes(n?.type);
/** Cosine ease for the soft appearance of a newly disclosed body. */
const ease=t=>.5-Math.cos(Math.PI*Math.max(0,Math.min(1,t)))/2;
/** easeInOutCubic drives the structural expansion: slow start, slow landing and
 *  no overshoot at either end, so the motion reads as orbital, not springy. */
const easeInOutCubic=t=>{const x=Math.max(0,Math.min(1,t));return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2};
const lerp=(a,b,t)=>a+(b-a)*t;
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const pageHidden=()=>typeof document==='object'&&!!document?.hidden;
const hash=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))|0;return(Math.abs(h)%628)/100};

export class Graph3D{
 constructor(canvas,{select,open,edge}){
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.callbacks={select,open,edge};
  this.camera={yaw:.2,pitch:-.2,zoom:1,panX:0,panY:0};this.data={nodes:[],edges:[]};this.points=[];this.positions=[];
  this.selected=null;this.hover=null;this.pointers=new Map();this.transition=null;this.motionFrame=0;this.pulseUntil=0;this.lastAmbient=0;
  this.filaments=[];this.filamentKey='';this.spawned=new Set();this.spawnProgress=1;this.lastFrame=0;
  this.draw=this.draw.bind(this);this.motionLoop=this.motionLoop.bind(this);
  new ResizeObserver(()=>this.draw()).observe(canvas);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.001))},{passive:false});
  canvas.addEventListener('pointerdown',e=>{
   canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
   this.down={x:e.offsetX,y:e.offsetY,node:this.hit(e.offsetX,e.offsetY),button:e.button,moved:0};this.distance=this.pinch();
  });
  canvas.addEventListener('pointermove',e=>{
   const p=this.pointers.get(e.pointerId);
   if(p){
    if(!this.down)this.down={x:p.x,y:p.y,node:null,button:0,moved:10};
    const dx=e.offsetX-p.x,dy=e.offsetY-p.y;this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});this.down.moved+=Math.abs(dx)+Math.abs(dy);
    if(this.pointers.size===2){const d=this.pinch();if(this.distance)this.camera.zoom=Math.max(.3,Math.min(4,this.camera.zoom*d/this.distance));this.distance=d}
    else if(e.shiftKey||this.down.button===2){this.camera.panX+=dx;this.camera.panY+=dy}
    else if(this.down.node&&e.altKey){const i=this.data.nodes.findIndex(n=>n.id===this.down.node.id);if(i>=0){this.positions[i][0]+=dx;this.positions[i][1]+=dy}}
    else{this.camera.yaw+=dx*.006;this.camera.pitch=Math.max(-1.4,Math.min(1.4,this.camera.pitch+dy*.006))}
    this.draw();
   }else{
    const n=this.hit(e.offsetX,e.offsetY);
    if(n?.id!==this.hover?.id){this.hover=n;canvas.style.cursor=n?'pointer':'grab';this.kick(420)}
   }
  });
  canvas.addEventListener('pointerup',e=>{
   this.pointers.delete(e.pointerId);
   if(this.down&&this.down.moved<6){
    const n=this.hit(e.offsetX,e.offsetY);
    if(n){
     this.selected=n.id;this.kick(480);
     if(structural(n)&&n.id!==this.focus)this.callbacks.open?.(n);else this.callbacks.select?.(n);
    }else{const ed=this.hitEdge(e.offsetX,e.offsetY);if(ed)this.callbacks.edge?.(ed)}
   }
   this.down=null;
  });
  canvas.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);this.down=null});
  canvas.addEventListener('dblclick',e=>{const n=this.hit(e.offsetX,e.offsetY);if(n)this.callbacks.open?.(n)});
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.camera.yaw-=.15;if(e.key==='ArrowRight')this.camera.yaw+=.15;if(e.key==='ArrowUp')this.camera.pitch-=.15;if(e.key==='ArrowDown')this.camera.pitch+=.15;if(e.key==='+')this.zoom(1.15);if(e.key==='-')this.zoom(.85);this.draw()});
 }
 pinch(){const p=[...this.pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0}
 rootOnly(data,focus){
  if(focus!=='system:NEXO')return data;
  const nodes=data.nodes.filter(n=>n.type==='SYSTEM');const ids=new Set(nodes.map(n=>n.id));
  return{...data,nodes,edges:data.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),visualTotal:nodes.length};
 }
 set(raw,focus){
  const data=withDomainLinks(visualCut(this.rootOnly(raw,focus),focus,MAP_CONFIG.maxNodes),focus),oldById=new Map(this.data.nodes.map((n,i)=>[n.id,this.positions[i]]));
  this.selected=null;this.hover=null;this.focus=focus;this.data=data;
  this.mode='graph';this.projection=null;this.lod=null;
  const target=clusteredPositions(data,focus,layout),targetById=new Map(data.nodes.map((n,i)=>[n.id,target[i]]));
  const parent=new Map();for(const e of data.edges)if(!parent.has(e.target))parent.set(e.target,e.source);
  // A disclosed child is born at its parent and travels out to its orbit;
  // nothing teleports into place.
  const spawned=new Set();
  const start=data.nodes.map(n=>{
   if(oldById.has(n.id))return[...oldById.get(n.id)];
   spawned.add(n.id);
   const p=parent.get(n.id),anchor=oldById.get(p)||targetById.get(p)||[0,0,-60];
   return[anchor[0],anchor[1],anchor[2]-25];
  });
  this.spawned=spawned;
  this.positions=start;this.transition={start,target,at:performance.now(),duration:MAP_CONFIG.transitionMs};
  this.refreshFilaments();
  this.reset(false);this.kick(MAP_CONFIG.transitionMs+220);
 }
 /** Draws a layered projection instead of a focus-and-children subgraph.
  *
  *  Depth here is semantic, not decorative: Z comes from the node's tier inside
  *  its layer and from its layer's band inside the composition, so "closer" and
  *  "nearer to the origin of the truth" are the same direction. The LOD budget
  *  decides how much of it is worth drawing, and reports what it left out rather
  *  than letting the map imply it is complete. */
 setProjection(projection,{focus='',budget=LOD_BUDGET}={}){
  const cutdown=applyLod(projection,{focus,selected:this.selected,hover:this.hover?.id,budget});
  const nodes=cutdown.nodes.map(n=>({
   ...n,
   type:n.tier||n.type||'NODE',
   tint:colors[n.signal]||colors.unknown,
   accent:LAYER_ACCENT[n.layer]||null
  }));
  const data={nodes,edges:cutdown.edges,visualTotal:projection?.metadata?.drawnNodes??nodes.length};
  const oldById=new Map(this.data.nodes.map((n,i)=>[n.id,this.positions[i]]));
  this.mode='projection';this.projection=projection;this.lod=cutdown;this.focus=focus;this.hover=null;this.data=data;
  const target=projectionLayout({...projection,nodes},{focus,tiers:projection?.tiers});
  // A body already on screen travels to its new seat; a new one rises from the
  // centre of its tier rather than appearing out of nothing.
  const start=nodes.map((n,i)=>oldById.get(n.id)?[...oldById.get(n.id)]:[target[i][0]*.42,target[i][1]*.42,target[i][2]]);
  this.spawned=new Set(nodes.filter(n=>!oldById.has(n.id)).map(n=>n.id));
  this.positions=start;this.transition={start,target,at:performance.now(),duration:MAP_CONFIG.transitionMs};
  this.refreshFilaments();
  this.reset(false);this.kick(MAP_CONFIG.transitionMs+220);
  return cutdown.omitted;
 }
 /** Filaments are precomputed per dataset/selection, never per frame.
  *  The key lets an external selection change (inspector, search, WebMCP) pick
  *  up a new neighbourhood without every caller having to know about it. */
 refreshFilaments(){
  this.filamentKey=`${this.data.nodes.length}|${this.selected||''}|${this.hover?.id||''}`;
  this.filaments=buildFilaments(this.data,{selected:this.selected,hover:this.hover?.id||null});
 }
 syncFilaments(){
  const key=`${this.data.nodes.length}|${this.selected||''}|${this.hover?.id||''}`;
  if(key!==this.filamentKey)this.refreshFilaments();
 }
 motionLoop(t){
  this.motionFrame=0;let active=false;
  const dt=Math.min(FILAMENT_STYLE.maxDeltaSeconds,this.lastFrame?(t-this.lastFrame)/1000:0);
  this.lastFrame=t;
  if(this.transition){
   const raw=(t-this.transition.at)/this.transition.duration,p=easeInOutCubic(raw);
   this.positions=this.transition.start.map((s,i)=>[lerp(s[0],this.transition.target[i][0],p),lerp(s[1],this.transition.target[i][1],p),lerp(s[2],this.transition.target[i][2],p)]);
   this.spawnProgress=ease(raw);
   if(raw>=1){this.positions=this.transition.target.map(x=>[...x]);this.transition=null;this.spawnProgress=1}else active=true;
  }
  const still=reducedMotion();
  const ambient=this.data.nodes.length<=MAP_CONFIG.ambientMaxNodes&&!still&&!pageHidden();
  if(ambient&&dt>0)for(const f of this.filaments||[])advancePulse(f,dt);
  if(t<this.pulseUntil)active=true;
  if(ambient&&t-this.lastAmbient>30){this.lastAmbient=t;active=true}
  if(this.stopped)return;
  this.draw(t);
  if(active||ambient)this.motionFrame=requestAnimationFrame(this.motionLoop);else this.lastFrame=0;
 }
 kick(ms=380){if(this.stopped)return;this.pulseUntil=Math.max(this.pulseUntil,performance.now()+ms);if(!this.motionFrame)this.motionFrame=requestAnimationFrame(this.motionLoop)}
 /** Releases the animation loop. A panel that replaces its canvas must call
  *  this, or the detached renderer keeps a requestAnimationFrame alive. */
 stop(){this.stopped=true;if(this.motionFrame)cancelAnimationFrame(this.motionFrame);this.motionFrame=0;this.pulseUntil=0}
 reset(redraw=true){Object.assign(this.camera,{yaw:.2,pitch:-.2,zoom:1,panX:0,panY:0});if(redraw)this.draw()}
 zoom(f){this.camera.zoom=Math.max(.3,Math.min(4,this.camera.zoom*f));this.kick(240);this.draw()}
 center(){const p=this.points.find(p=>p.node.id===this.selected);if(p){this.camera.panX+=this.w/2-p.x;this.camera.panY+=this.h/2-p.y;this.kick(280);this.draw()}}
 hit(x,y){return[...this.points].sort((a,b)=>b.z-a.z).find(p=>Math.hypot(p.x-x,p.y-y)<p.r+10)?.node}
 edgeControl(a,b){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,k=len*MAP_CONFIG.edgeCurve;return{cx:(a.x+b.x)/2-dy/len*k,cy:(a.y+b.y)/2+dx/len*k}}
 /** Edge picking samples the same curve the filament is drawn with. */
 hitEdge(x,y){for(const f of this.filaments||[]){const a=this.points.find(p=>p.node.id===f.edge.source),b=this.points.find(p=>p.node.id===f.edge.target);if(!a||!b)continue;const cp=filamentControl(a,b,f.kind);for(let i=0;i<=12;i++){const p=quadraticBezierPoint(a,cp,b,i/12);if(Math.hypot(x-p.x,y-p.y)<6)return f.edge}}return null}
 draw(now=performance.now()){
  const palette=themePalette(this.theme),c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
  this.w=w;this.h=h;const dpr=Math.min(globalThis.devicePixelRatio||1,2);
  if(this.canvas.width!==w*dpr||this.canvas.height!==h*dpr){this.canvas.width=w*dpr;this.canvas.height=h*dpr}
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle=palette.background;c.fillRect(0,0,w,h);
  const haze=(x,y,r,color)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,palette.background+'00');c.fillStyle=g;c.fillRect(0,0,w,h)};
  haze(w*.48,h*.42,w*.48,palette.haze);haze(w*.78,h*.64,w*.31,palette.haze2||palette.haze);
  for(let i=0;i<MAP_CONFIG.stars;i++){const x=(Math.sin(i*12.9898)*43758.5453%1+1)%1*w,y=(Math.sin(i*7.23)*14321.33%1+1)%1*h;c.fillStyle=i%13===0?palette.stars+'a0':palette.stars+'38';const s=i%13===0?1.6:1;c.fillRect(x,y,s,s)}
  for(const [radius,tilt] of [[170,0],[285,0],[365,.45],[365,-.45]]){c.beginPath();for(let i=0;i<=160;i++){const a=i/160*Math.PI*2,p=project([Math.cos(a)*radius,Math.sin(a)*radius*tilt+35,Math.sin(a)*radius],this.camera,w,h);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)}c.strokeStyle=palette.guide+(tilt?'30':'58');c.lineWidth=1;c.stroke()}
  this.syncFilaments();
  // The drift is an offset on top of the semantic position, applied before the
  // projection so what is clicked is exactly what is drawn.
  const still=reducedMotion(),drift=still||this.transition?0:MAP_CONFIG.driftAmplitude;
  this.points=this.data.nodes.map((node,i)=>{
   const at=this.positions[i]||[0,0,0];
   const off=drift?orbitalOffset(node.id,now,{amplitude:node.id===this.focus?drift*.34:drift}):[0,0,0];
   const p=project([at[0]+off[0],at[1]+off[1],at[2]+off[2]],this.camera,w,h);
   let base=node.id===this.focus?MAP_CONFIG.coreRadius:node.type==='SYSTEM'?MAP_CONFIG.groupRadius:node.type==='DOMAIN'?MAP_CONFIG.domainRadius:node.type==='CAMPAIGN'?MAP_CONFIG.campaignRadius:MAP_CONFIG.nodeRadius;
   const grow=this.spawned?.has(node.id)?lerp(MAP_CONFIG.spawnScale,1,this.spawnProgress??1):1;
   return{...p,node,r:Math.max(5,base*p.scale*grow)};
  });
  // Frustum culling: a body entirely off-canvas is hidden by the camera, not
  // removed from the model — it returns the moment it is panned back into view.
  if(this.mode==='projection')this.points=cull(this.points,{width:w,height:h});
  const zs=this.points.map(p=>p.z),zmin=zs.length?Math.min(...zs):0,zmax=zs.length?Math.max(...zs):1;
  const nearness=z=>this.camera.flat||zmax===zmin?1:(z-zmin)/(zmax-zmin),fog=(color,z)=>mixHex(color,palette.background,(1-nearness(z))*MAP_CONFIG.fog);
  const map=new Map(this.points.map(p=>[p.node.id,p])),neighbors=new Set([this.selected]);
  const parentOf=new Map();for(const e of this.data.edges)if(!parentOf.has(e.target))parentOf.set(e.target,e.source);
  const systemRoot=id=>{let cur=id,guard=0;while(cur&&guard++<10){if(SYSTEM_COLORS[cur])return cur;cur=parentOf.get(cur)}return null};
  // In projection mode the fill carries the operational signal the backend
  // published; the system palette only applies to the declared-systems map.
  const nodeBase=n=>n.tint||SYSTEM_COLORS[n.id]||SYSTEM_COLORS[systemRoot(n.id)]||(n.domain?SYSTEM_COLORS['system:SCIENCE']:null)||palette.node;
  const focusedId=this.selected||this.hover?.id||null;
  if(focusedId)neighbors.add(focusedId);
  for(const e of this.data.edges)if(e.source===focusedId||e.target===focusedId){neighbors.add(e.source);neighbors.add(e.target)}
  // Filaments: a thin fibre per declared relation, with a pulse travelling the
  // curve A→B→A. Class, speed and phase were precomputed; here we only draw.
  for(const f of this.filaments||[]){
   const a=map.get(f.edge.source),b=map.get(f.edge.target);if(!a||!b)continue;
   const style=FILAMENT_STYLE[f.kind]||FILAMENT_STYLE['intra-domain'];
   const near=!focusedId||(neighbors.has(a.node.id)&&neighbors.has(b.node.id));
   const canonical=f.edge.authority==='SCIENCE_CANONICAL',branch=nodeBase(a.node);
   // The class carries its own hue, blended with the branch colour so the three
   // kinds of relation are told apart without leaving the system palette.
   const tinted=style.hue?mixHex(branch,style.hue,FILAMENT_STYLE.tint):branch;
   const col=fog(canonical?mixHex(tinted,palette.edge,.18):mixHex(tinted,palette.derived,.30),(a.z+b.z)/2);
   const cp=filamentControl(a,b,f.kind);
   c.globalAlpha=!focusedId?style.alpha:near?style.activeAlpha:FILAMENT_STYLE.dimAlpha;
   c.strokeStyle=col;c.lineWidth=style.width;c.setLineDash(canonical?[]:style.dash||[]);
   c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(cp.cx,cp.cy,b.x,b.y);c.stroke();c.setLineDash([]);
   if(!near||still){c.globalAlpha=1;continue}
   // The travelling head sits on the curve at the current phase; the wake is
   // sampled behind it along the direction of travel, so A→B→A is readable.
   const head=quadraticBezierPoint(a,cp,b,f.phase);
   const back=Math.max(0,Math.min(1,f.phase-f.direction*style.trail));
   const mid=quadraticBezierPoint(a,cp,b,Math.max(0,Math.min(1,f.phase-f.direction*style.trail*.5)));
   const tail=quadraticBezierPoint(a,cp,b,back);
   c.globalAlpha=.34;c.lineWidth=style.width*1.9;c.lineCap='round';
   c.beginPath();c.moveTo(tail.x,tail.y);c.quadraticCurveTo(mid.x,mid.y,head.x,head.y);c.stroke();c.lineCap='butt';
   const halo=c.createRadialGradient(head.x,head.y,0,head.x,head.y,style.glow);
   halo.addColorStop(0,col+'c8');halo.addColorStop(.4,col+'3a');halo.addColorStop(1,col+'00');
   c.globalAlpha=1;c.fillStyle=halo;c.beginPath();c.arc(head.x,head.y,style.glow,0,Math.PI*2);c.fill();
   c.fillStyle=col;c.globalAlpha=.95;c.beginPath();c.arc(head.x,head.y,style.led,0,Math.PI*2);c.fill();
   c.fillStyle=palette.highlight;c.globalAlpha=.9;c.beginPath();c.arc(head.x,head.y,style.led*.42,0,Math.PI*2);c.fill();
   c.globalAlpha=1;
  }
  c.globalAlpha=1;this.badges=[];
  for(const p of [...this.points].sort((a,b)=>a.z-b.z)){
   const n=p.node,active=n.id===this.selected||n.id===this.hover?.id,core=n.id===this.focus,base=nodeBase(n),col=fog(base,p.z),pulse=active?1+.05*Math.sin(now*.018):1,rr=p.r*pulse;
   const mid=mixHex(base,palette.background,palette.isLight?.28:.42),shadow=mixHex(base,palette.background,palette.isLight?.58:.79),rim=mixHex(base,palette.isLight?'#07192d':'#ffffff',palette.isLight?.18:.28);
   c.globalAlpha=this.selected&&!neighbors.has(n.id)?.30:1;
   // The radial halo is the most expensive thing per body. Under a projection
   // budget only the bodies that carry the reading get one; the rest keep their
   // sphere, so nothing disappears — it just stops glowing.
   const haloed=this.mode!=='projection'||core||active||this.lod?.glowIds?.has(n.id);
   if(haloed){const glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*(core?5.5:4.35));glow.addColorStop(0,col+(core?MAP_CONFIG.haloAlpha:'3d'));glow.addColorStop(.38,col+'14');glow.addColorStop(1,col+'00');c.fillStyle=glow;c.beginPath();c.arc(p.x,p.y,rr*(core?5.5:4.35),0,Math.PI*2);c.fill()}
   if(n.type==='SYSTEM'){
    const ang=now*.00125+hash(n.id),or=rr+10;c.fillStyle=col+'e6';c.beginPath();c.arc(p.x+Math.cos(ang)*or,p.y+Math.sin(ang)*or*.58,core?2.6:1.9,0,Math.PI*2);c.fill();
   }
   if(core){const squash=.30+Math.abs(Math.sin(this.camera.pitch))*.55;for(let j=0;j<3;j++){c.beginPath();c.ellipse(p.x,p.y,rr*(1.62+j*.30),rr*(1.62+j*.30)*squash,-.5+j*.4,0,Math.PI*2);c.strokeStyle=col+(j?'62':'c4');c.lineWidth=j?1:1.5;c.stroke()}}
   const sphere=c.createRadialGradient(p.x-rr*.34,p.y-rr*.42,0,p.x+rr*.2,p.y+rr*.2,rr*1.22);sphere.addColorStop(0,palette.highlight);sphere.addColorStop(.16,col);sphere.addColorStop(.56,fog(mid,p.z));sphere.addColorStop(1,fog(shadow,p.z));c.fillStyle=sphere;
   // The ring is the layer's identity, so a composed map says which projection a
   // body came from without needing a legend lookup.
   c.strokeStyle=(n.accent?fog(n.accent,p.z):col)+'f4';c.lineWidth=active?2.8:n.accent?1.8:n.type==='SYSTEM'?1.9:1.2;c.beginPath();
   if(['FILE','ARTIFACT','DATASET'].includes(n.type))c.roundRect(p.x-rr,p.y-rr,rr*2,rr*2,Math.max(2,rr*.2));
   else if(n.type==='CLAIM'){c.moveTo(p.x,p.y-rr*1.28);c.lineTo(p.x+rr,p.y);c.lineTo(p.x,p.y+rr*1.28);c.lineTo(p.x-rr,p.y);c.closePath()}
   else c.arc(p.x,p.y,rr,0,Math.PI*2);c.fill();c.stroke();
   if(rr>7&&!['FILE','ARTIFACT','DATASET','CLAIM'].includes(n.type)){c.beginPath();c.arc(p.x,p.y,rr*.94,Math.PI*1.04,Math.PI*1.84);c.strokeStyle=fog(rim,p.z)+(core?'ee':'a8');c.lineWidth=Math.max(1.1,rr*.11);c.stroke()}
   if(active){c.beginPath();c.arc(p.x,p.y,rr+7,0,Math.PI*2);c.strokeStyle=palette.activeRing;c.lineWidth=2;c.stroke();c.beginPath();c.arc(p.x,p.y,rr+12,0,Math.PI*2);c.strokeStyle=col+'90';c.lineWidth=1.1;c.stroke()}
   if(n.hiddenChildren>0&&this.focus!=='system:NEXO'&&rr>=6&&!core){const text='+'+(n.hiddenChildren>999?'999':n.hiddenChildren);c.font='700 9px sans-serif';const bw=c.measureText(text).width+10,bx=p.x+rr*.72,by=p.y-rr*.72-11;c.fillStyle=palette.badge;c.beginPath();c.roundRect(bx,by,bw,14,7);c.fill();c.strokeStyle=col+'aa';c.stroke();c.fillStyle=palette.badgeText;c.textAlign='center';c.fillText(text,bx+bw/2,by+10);this.badges.push({x:bx,y:by,w:bw,h:14,node:n})}
  }
  c.globalAlpha=1;
  const vig=Math.round(Math.max(0,Math.min(1,MAP_CONFIG.vignette))*255).toString(16).padStart(2,'0'),vg=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.28,w/2,h/2,Math.max(w,h)*.72);vg.addColorStop(0,palette.background+'00');vg.addColorStop(1,palette.background+vig);c.fillStyle=vg;c.fillRect(0,0,w,h);
  this.drawLabels(c,w,h,nodeBase,fog);
 }
 drawLabels(c,w,h,nodeBase,fog){
  // Keep clear of the map chrome. A host without those controls (the Learning
  // filament stage) sets `reserved` to [] and gets the whole canvas for labels.
  const boxes=[];this.labelBoxes=boxes;
  const reserved=this.reserved||[{x:w/2-135,y:h-105,w:270,h:56},{x:10,y:h-46,w:w-20,h:40},{x:14,y:h-150,w:230,h:104},{x:12,y:8,w:230,h:34}];
  const topGuard=this.reserved?10:48,RANK={SYSTEM:700,DOMAIN:480,CAMPAIGN:260,CLAIM:130};
  // In a projection the spine replaces the type ranking: an earlier tier is
  // structural, so it earns its label before a leaf does.
  const tiers=this.projection?.tiers||[];
  const rankOf=n=>this.mode==='projection'
   ?(tiers.includes(n.tier)?(tiers.length-tiers.indexOf(n.tier))*70:0)+(4-(n.zoom||2))*90+(n.alsoInLayers?.length?300:0)
   :(RANK[n.type]||0);
  const priority=p=>p.node.id===this.focus?1e4:p.node.id===this.selected?9e3:p.node.id===this.hover?.id?8e3:rankOf(p.node)+p.z;
  const labelCap=this.mode==='projection'?Math.max(7,this.lod?.labelBudget|0):Math.max(7,MAP_CONFIG.maxLabels|0);
  for(const p of [...this.points].sort((a,b)=>priority(b)-priority(a))){const n=p.node,core=n.id===this.focus,active=n.id===this.selected||n.id===this.hover?.id;if(!core&&!active&&boxes.length>=labelCap)continue;if(this.focus==='system:NEXO'&&n.type!=='SYSTEM'&&!active)continue;if(this.data.nodes.length>44&&p.z<0&&n.type!=='SYSTEM'&&!core&&!active)continue;
   const maxChars=w<500?18:this.data.nodes.length>30?22:30,label=nodeDisplayLabel(n,maxChars),size=core?20:n.type==='SYSTEM'?14:12;c.font=(core?'750 ':'650 ')+size+'px sans-serif';const bw=c.measureText(label).width+26,bh=46,candidates=[[p.x-bw/2,p.y+p.r+14],[p.x-bw/2,p.y-p.r-bh-14],[p.x+p.r+16,p.y-bh/2],[p.x-p.r-bw-16,p.y-bh/2],...[48,80,112].flatMap(d=>[[p.x-bw/2,p.y-p.r-bh-d],[p.x-bw/2,p.y+p.r+d]])];let box;
   for(const[x,y]of candidates){const b={x,y,w:bw,h:bh,id:n.id};if(x<8||x+bw>w-8||y<topGuard||y+bh>h-38)continue;if(this.points.some(q=>q.node.id!==n.id&&q.x+q.r+4>x&&q.x-q.r-4<x+bw&&q.y+q.r+4>y&&q.y-q.r-4<y+bh))continue;if(boxes.some(a=>x<a.x+a.w+6&&x+bw+6>a.x&&y<a.y+a.h+5&&y+bh+5>a.y))continue;if(reserved.some(r=>x<r.x+r.w&&x+bw>r.x&&y<r.y+r.h&&y+bh>r.y))continue;box=b;break}if(!box)continue;boxes.push(box);
   const palette=themePalette(this.theme),labelColor=fog(nodeBase(n),p.z);
   // The chip border keeps the body's colour identity, but on a light ground a
   // pale system colour is unreadable as type: darken it toward the text ink.
   const labelInk=palette.isLight?mixHex(labelColor,palette.text,.62):labelColor;
   c.globalAlpha=this.selected&&n.id!==this.selected?.48:1;c.fillStyle=palette.label;c.beginPath();c.roundRect(box.x,box.y,bw,bh,7);c.fill();c.strokeStyle=labelColor+'df';c.lineWidth=1.35;c.stroke();c.fillStyle=palette.text;c.textAlign='center';c.fillText(label,box.x+bw/2,box.y+19);c.font='700 9px sans-serif';c.fillStyle=core?labelInk:palette.muted;const kind=n.type.replaceAll('_',' ');c.fillText(core?'FOCO ATUAL':kind,box.x+bw/2,box.y+35);c.globalAlpha=1;
  }
 }
}
