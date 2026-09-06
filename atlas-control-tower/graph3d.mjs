import {themePalette,MAP_CONFIG,mixHex} from './ui/visual-config.mjs';
import {clusteredPositions} from './ui/map-data.mjs';
import {state} from './lib/model.mjs';
export function project([x,y,z],c,w,h){if(c.flat)z=0;const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp,depth=y*sp+zz*cp;const scale=750/(750-depth)*(c.zoom||1)*Math.min(w/1000,h/660);return{x:w/2+xx*scale+(c.panX||0),y:h/2+yy*scale+(c.panY||0),z:depth,scale}}
export function layout(nodes,focus){const count=Math.max(1,nodes.length-1);let k=0;return nodes.map(n=>{if(n.id===focus)return[0,0,0];const i=k++;if(count<10){const a=i/count*Math.PI*2-.8;return[Math.cos(a)*275,Math.sin(a)*200,Math.sin(a*2)*75]}const r=count<30?270:320,angle=i*2.399963229728653,yy=1-2*(i+.5)/count,rad=Math.sqrt(1-yy*yy);return[Math.cos(angle)*rad*r,yy*r*.8,Math.sin(angle)*rad*r*.75]})}
export const colors={supported:'#69dec0',partial:'#efc379',negative:'#f38999',blocked:'#ff687c',active:'#6bceff',legacy:'#73819b',unknown:'#a2b3ce'};
export class Graph3D{constructor(canvas,{select,open,edge}){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.callbacks={select,open,edge};this.camera={yaw:.2,pitch:-.2,zoom:1,panX:0,panY:0};this.data={nodes:[],edges:[]};this.points=[];this.selected=null;this.hover=null;this.pointers=new Map();this.draw=this.draw.bind(this);new ResizeObserver(()=>this.draw()).observe(canvas);canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.001))},{passive:false});canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});this.down={x:e.offsetX,y:e.offsetY,node:this.hit(e.offsetX,e.offsetY),button:e.button,moved:0};this.distance=this.pinch()});canvas.addEventListener('pointermove',e=>{const p=this.pointers.get(e.pointerId);if(p){if(!this.down)this.down={x:p.x,y:p.y,node:null,button:0,moved:10};const dx=e.offsetX-p.x,dy=e.offsetY-p.y;this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});this.down.moved+=Math.abs(dx)+Math.abs(dy);if(this.pointers.size===2){const d=this.pinch();if(this.distance)this.camera.zoom=Math.max(.3,Math.min(4,this.camera.zoom*d/this.distance));this.distance=d}else if(e.shiftKey||this.down.button===2){this.camera.panX+=dx;this.camera.panY+=dy}else if(this.down.node&&e.altKey){const i=this.data.nodes.findIndex(n=>n.id===this.down.node.id);this.positions[i][0]+=dx;this.positions[i][1]+=dy}else{this.camera.yaw+=dx*.006;this.camera.pitch=Math.max(-1.4,Math.min(1.4,this.camera.pitch+dy*.006))}this.draw()}else{const n=this.hit(e.offsetX,e.offsetY);if(n?.id!==this.hover?.id){this.hover=n;canvas.style.cursor=n?'pointer':'grab';this.draw()}}});canvas.addEventListener('pointerup',e=>{this.pointers.delete(e.pointerId);if(this.down&&this.down.moved<6){const n=this.hit(e.offsetX,e.offsetY);if(n){this.selected=n.id;this.callbacks.select(n);this.draw()}else{const edge=this.hitEdge(e.offsetX,e.offsetY);if(edge)this.callbacks.edge?.(edge)}}this.down=null});canvas.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);this.down=null});canvas.addEventListener('dblclick',e=>{const n=this.hit(e.offsetX,e.offsetY);if(n)this.callbacks.open(n)});canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.camera.yaw-=.15;if(e.key==='ArrowRight')this.camera.yaw+=.15;if(e.key==='ArrowUp')this.camera.pitch-=.15;if(e.key==='ArrowDown')this.camera.pitch+=.15;if(e.key==='+')this.zoom(1.15);if(e.key==='-')this.zoom(.85);this.draw()})}
pinch(){const p=[...this.pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0}
set(data,focus){this.selected=null;this.hover=null;this.data=data;this.focus=focus;this.positions=clusteredPositions(data,focus,layout);this.reset()}
reset(){Object.assign(this.camera,{yaw:.2,pitch:-.2,zoom:1,panX:0,panY:0});this.draw()}
zoom(f){this.camera.zoom=Math.max(.3,Math.min(4,this.camera.zoom*f));this.draw()}
center(){const p=this.points.find(p=>p.node.id===this.selected);if(p){this.camera.panX+=this.w/2-p.x;this.camera.panY+=this.h/2-p.y;this.draw()}}
hit(x,y){return [...this.points].sort((a,b)=>b.z-a.z).find(p=>Math.hypot(p.x-x,p.y-y)<p.r+9)?.node}
/** Control point of the bow drawn for a relation. Curvature is decorative; picking uses the same curve. */
edgeControl(a,b){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,k=len*MAP_CONFIG.edgeCurve;return{cx:(a.x+b.x)/2-dy/len*k,cy:(a.y+b.y)/2+dx/len*k}}
hitEdge(x,y){for(const e of this.data.edges){const a=this.points.find(p=>p.node.id===e.source),b=this.points.find(p=>p.node.id===e.target);if(!a||!b)continue;const cp=this.edgeControl(a,b);for(let i=0;i<=12;i++){const t=i/12,u=1-t,px=u*u*a.x+2*u*t*cp.cx+t*t*b.x,py=u*u*a.y+2*u*t*cp.cy+t*t*b.y;if(Math.hypot(x-px,y-py)<6)return e}}return null}
draw(){
 const palette=themePalette(this.theme);const c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
 this.w=w;this.h=h;const dpr=Math.min(globalThis.devicePixelRatio||1,2);
 if(this.canvas.width!==w*dpr||this.canvas.height!==h*dpr){this.canvas.width=w*dpr;this.canvas.height=h*dpr}
 c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle=palette.background;c.fillRect(0,0,w,h);
 const haze=(x,y,r,color)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,palette.background+'00');c.fillStyle=g;c.fillRect(0,0,w,h)};
 haze(w*.49,h*.45,w*.48,palette.haze);haze(w*.72,h*.62,w*.3,palette.haze);
 for(let i=0;i<MAP_CONFIG.stars;i++){const x=(Math.sin(i*12.9898)*43758.5453%1+1)%1*w,y=(Math.sin(i*7.23)*14321.33%1+1)%1*h;c.fillStyle=i%11===0?palette.stars+'77':palette.stars+'30';c.fillRect(x,y,i%11===0?1.5:1,i%11===0?1.5:1)}
 // Orbital guides describe the camera space, never scientific strength.
 for(const [radius,tilt] of [[170,0],[285,0],[365,.45],[365,-.45]]){c.beginPath();for(let i=0;i<=180;i++){const a=i/180*Math.PI*2,p=project([Math.cos(a)*radius,Math.sin(a)*radius*tilt+35,Math.sin(a)*radius],this.camera,w,h);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)}c.strokeStyle=palette.guide+(tilt?'25':'45');c.lineWidth=1;c.stroke()}
 this.points=this.data.nodes.map((node,i)=>{const p=project(this.positions[i],this.camera,w,h);return{...p,node,r:Math.max(4,(node.id===this.focus?MAP_CONFIG.coreRadius:node.type==='SYSTEM'?MAP_CONFIG.groupRadius:this.focus==='system:NEXO'?MAP_CONFIG.nodeRadius:node.type==='DOMAIN'?15:node.type==='CAMPAIGN'?10:6)*p.scale)}});
 // Atmospheric depth: distance dissolves a node into the background. It encodes camera
 // distance only, never confidence, and the flat view removes it entirely.
 const zs=this.points.map(p=>p.z),zmin=zs.length?Math.min(...zs):0,zmax=zs.length?Math.max(...zs):1;
 const nearness=z=>this.camera.flat||zmax===zmin?1:(z-zmin)/(zmax-zmin);
 const fog=(color,z)=>mixHex(color,palette.background,(1-nearness(z))*MAP_CONFIG.fog);
 const map=new Map(this.points.map(p=>[p.node.id,p])),neighbors=new Set([this.selected]);
 for(const e of this.data.edges)if(e.source===this.selected||e.target===this.selected){neighbors.add(e.source);neighbors.add(e.target)}
 for(const e of this.data.edges){const a=map.get(e.source),b=map.get(e.target);if(!a||!b)continue;
 const active=!this.selected||neighbors.has(a.node.id)&&neighbors.has(b.node.id);
 const col=fog(e.authority==='SCIENCE_CANONICAL'?palette.edge:palette.derived,(a.z+b.z)/2);
 const cp=this.edgeControl(a,b);
 c.globalAlpha=active?.62:.07;c.strokeStyle=col;c.setLineDash(e.authority==='SCIENCE_CANONICAL'?[]:[3,7]);c.lineWidth=active?1.15:.65;
 c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(cp.cx,cp.cy,b.x,b.y);c.stroke();c.setLineDash([]);
 // The arrow sits on the curve and points along its tangent.
 const t=.68,u=1-t,x=u*u*a.x+2*u*t*cp.cx+t*t*b.x,y=u*u*a.y+2*u*t*cp.cy+t*t*b.y;
 const angle=Math.atan2(2*u*(cp.cy-a.y)+2*t*(b.y-cp.cy),2*u*(cp.cx-a.x)+2*t*(b.x-cp.cx));
 c.beginPath();c.moveTo(x,y);c.lineTo(x-5*Math.cos(angle-.5),y-5*Math.sin(angle-.5));c.lineTo(x-5*Math.cos(angle+.5),y-5*Math.sin(angle+.5));c.fillStyle=col;c.fill()}
 c.globalAlpha=1;this.badges=[];
 for(const p of [...this.points].sort((a,b)=>a.z-b.z)){const n=p.node,active=n.id===this.selected||n.id===this.hover?.id,core=n.id===this.focus;
 const base=core?palette.core:palette.node,col=fog(base,p.z);
 c.globalAlpha=this.selected&&!neighbors.has(n.id)?.23:1;
 const glow=c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*(core?5:3.5));glow.addColorStop(0,col+MAP_CONFIG.haloAlpha);glow.addColorStop(.35,col+'08');glow.addColorStop(1,col+'00');c.fillStyle=glow;c.beginPath();c.arc(p.x,p.y,p.r*(core?5:3.5),0,Math.PI*2);c.fill();
 // The focal rings answer the camera: they flatten as the pitch approaches the equator.
 if(core){const squash=.30+Math.abs(Math.sin(this.camera.pitch))*.55;for(let j=0;j<3;j++){c.beginPath();c.ellipse(p.x,p.y,p.r*(1.6+j*.28),p.r*(1.6+j*.28)*squash,-.5+j*.4,0,Math.PI*2);c.strokeStyle=col+(j?'44':'99');c.lineWidth=1;c.stroke()}}
 const sphere=c.createRadialGradient(p.x-p.r*.32,p.y-p.r*.4,0,p.x+p.r*.2,p.y+p.r*.2,p.r*1.2);
 sphere.addColorStop(0,fog(palette.highlight,p.z));sphere.addColorStop(.18,col);sphere.addColorStop(.55,fog(palette.sphereMid,p.z));sphere.addColorStop(1,fog(palette.sphereShadow,p.z));
 c.fillStyle=sphere;c.strokeStyle=col+'bb';c.lineWidth=active?2:1;c.beginPath();
 if(['FILE','ARTIFACT','DATASET'].includes(n.type))c.rect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);
 else if(n.type==='CLAIM'){c.moveTo(p.x,p.y-p.r*1.3);c.lineTo(p.x+p.r,p.y);c.lineTo(p.x,p.y+p.r*1.3);c.lineTo(p.x-p.r,p.y);c.closePath()}
 else c.arc(p.x,p.y,p.r,0,Math.PI*2);
 c.fill();c.stroke();
 // A rim light on the lit side gives the sphere its volume.
 if(p.r>7&&!['FILE','ARTIFACT','DATASET','CLAIM'].includes(n.type)){c.beginPath();c.arc(p.x,p.y,p.r*.94,Math.PI*1.05,Math.PI*1.85);c.strokeStyle=fog(palette.rim,p.z)+(core?'cc':'66');c.lineWidth=Math.max(1,p.r*.10);c.stroke()}
 if(active){c.beginPath();c.arc(p.x,p.y,p.r+7,0,Math.PI*2);c.strokeStyle=col+'aa';c.stroke()}
 // A truncated branch says how much it still hides; drill in to see the rest.
 if(n.hiddenChildren>0&&p.r>=5&&!core){const text='+'+(n.hiddenChildren>999?'999':n.hiddenChildren);c.font='600 9px sans-serif';const bw=c.measureText(text).width+10,bx=p.x+p.r*.75,by=p.y-p.r*.75-11;
  c.globalAlpha=this.selected&&!neighbors.has(n.id)?.25:.95;c.fillStyle=palette.badge;c.beginPath();c.roundRect(bx,by,bw,13,7);c.fill();c.strokeStyle=fog(palette.border,p.z);c.lineWidth=1;c.stroke();
  c.fillStyle=palette.badgeText;c.textAlign='center';c.fillText(text,bx+bw/2,by+9.5);this.badges.push({x:bx,y:by,w:bw,h:13,node:n})}
 }
 c.globalAlpha=1;
 // Vignette: the periphery recedes so the focus keeps the eye.
 const vig=Math.round(Math.max(0,Math.min(1,MAP_CONFIG.vignette))*255).toString(16).padStart(2,'0');
 const vg=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.30,w/2,h/2,Math.max(w,h)*.70);
 vg.addColorStop(0,palette.background+'00');vg.addColorStop(1,palette.background+vig);
 c.fillStyle=vg;c.fillRect(0,0,w,h);
 // Place focal/selected labels first; subsequent labels cannot cover them.
 const boxes=[];this.labelBoxes=boxes;
 // The floating chrome (controls, legend, caption, mode pill) owns these rectangles;
 // a label placed under them would be unreadable, so they are treated as occupied.
 const reserved=[{x:w/2-135,y:h-105,w:270,h:56},{x:10,y:h-46,w:w-20,h:40},{x:14,y:h-150,w:230,h:104},{x:12,y:8,w:230,h:34}];
 const RANK={SYSTEM:600,DOMAIN:400,CAMPAIGN:220,CLAIM:120};
 // Structure outranks leaves so a dense recorte still reads as a map.
 const priority=p=>p.node.id===this.focus?1e4:p.node.id===this.selected?9e3:p.node.id===this.hover?.id?8e3:(RANK[p.node.type]||0)+p.z;
 for(const p of [...this.points].sort((a,b)=>priority(b)-priority(a))){const n=p.node,core=n.id===this.focus,active=n.id===this.selected||n.id===this.hover?.id;
 if(!core&&!active&&boxes.length>=Math.max(6,MAP_CONFIG.maxLabels|0))continue;
 if((this.data.nodes.length>40&&p.z<0&&n.type!=='SYSTEM'||this.focus==='system:NEXO'&&n.type!=='SYSTEM')&&!core&&!active)continue;
 const label=(n.label||n.id).slice(0,w<500?24:this.data.nodes.length>30?29:38),size=core?18:12;
 c.font=(core?'bold ':'')+size+'px sans-serif';const bw=c.measureText(label).width+22,bh=43;
 const candidates=[[p.x-bw/2,p.y+p.r+13],[p.x-bw/2,p.y-p.r-bh-13],[p.x+p.r+15,p.y-bh/2],[p.x-p.r-bw-15,p.y-bh/2],...[45,75,105].flatMap(d=>[[p.x-bw/2,p.y-p.r-bh-d],[p.x-bw/2,p.y+p.r+d]])];
 let box;for(const [x,y] of candidates){const b={x,y,w:bw,h:bh,id:n.id};if(x<8||x+bw>w-8||y<50||y+bh>h-38)continue;if(this.points.some(q=>q.node.id!==n.id&&q.x+q.r+3>x&&q.x-q.r-3<x+bw&&q.y+q.r+3>y&&q.y-q.r-3<y+bh))continue;if(boxes.some(a=>x<a.x+a.w+5&&x+bw+5>a.x&&y<a.y+a.h+4&&y+bh+4>a.y))continue;if(reserved.some(r=>x<r.x+r.w&&x+bw>r.x&&y<r.y+r.h&&y+bh>r.y))continue;box=b;break}
 if(!box)continue;boxes.push(box);
 c.globalAlpha=this.selected&&!neighbors.has(n.id)?.35:1;
 c.fillStyle=palette.label;c.fillRect(box.x,box.y,bw,bh);c.strokeStyle=core?palette.core+'88':palette.border;c.lineWidth=1;c.strokeRect(box.x,box.y,bw,bh);
 c.fillStyle=palette.text;c.textAlign='center';c.fillText(label,box.x+bw/2,box.y+18);
 c.font='9px sans-serif';c.fillStyle=core?palette.core:palette.muted;c.fillText(core?'FOCO ATUAL':n.type.replaceAll('_',' '),box.x+bw/2,box.y+33);
 }c.globalAlpha=1;
}
}
