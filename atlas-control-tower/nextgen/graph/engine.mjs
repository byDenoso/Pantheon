
function layoutGraph(nodes,{focus='system:NEXO'}={}){
  const list=Array.isArray(nodes)?nodes:[];
  const hashL=s=>{let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0};
  const jitter=(id,axis)=>(hashL(`${axis}:${id}`)%10000)/10000-.5;
  const rings={SYSTEM:120,DOMAIN:240,CAMPAIGN:315,HYPOTHESIS:360,CLAIM:360,TEST:425,RESULT:500,DATASET:470,MODEL:450,PROBE:440,PUBLICATION:520,SOURCE:570,SOURCE_REF:635};
  const byType=new Map();
  for(const n of list){const type=n.visualType||n.type||'UNKNOWN';if(!byType.has(type))byType.set(type,[]);byType.get(type).push(n)}
  const out=[];
  for(const [type,group] of byType){group.sort((a,b)=>String(a.id).localeCompare(String(b.id)));const base=rings[type]??380,count=Math.max(1,group.length);for(let i=0;i<group.length;i++){const n=group[i];if(n.id===focus){out.push({id:n.id,x:0,y:0,z:n.zBand??0});continue}const phase=(hashL(type)%6283)/1000,angle=phase+Math.PI*2*(i/count)+jitter(n.id,'a')*.24,radius=base*(.82+jitter(n.id,'r')*.16),domainBias=n.domain?((hashL(n.domain)%360)/360)*Math.PI*2:0;out.push({id:n.id,x:Math.cos(angle+domainBias*.18)*radius+jitter(n.id,'x')*36,y:Math.sin(angle+domainBias*.18)*radius*.62+jitter(n.id,'y')*30,z:(n.zBand??0)+jitter(n.id,'z')*34})}}
  return out;
}

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TYPE_COLOR={SYSTEM:'#8db7ff',DOMAIN:'#66d6ff',CAMPAIGN:'#967cff',HYPOTHESIS:'#f17ec2',CLAIM:'#e983c2',TEST:'#70e6bd',RESULT:'#ffd06b',DATASET:'#8da4ff',MODEL:'#b895ff',PROBE:'#73cfff',PUBLICATION:'#f4a66e',SOURCE:'#c9d4e8',SOURCE_REF:'#8b98af'};
const STATUS_DANGER=/blocked|kill|negative|contrad/i;
const EDGE_COLOR={SUPPORTS:'#70e6bd',CONTRADICTS:'#ff6d88',KILLS:'#ff5f7a',TESTS:'#c778ff',PRODUCES:'#ffd06b',PRODUCES_RESULT:'#ffd06b',VALIDATES:'#70e6bd',DERIVED_FROM:'#7da0d6',OBSERVED_BY:'#c7d5ea',LOCATED_AT:'#7b8aa4',CONTAINS:'#4f719d'};

function hash(s){let h=0;for(const ch of String(s))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;return Math.abs(h)}
function rgba(hex,a){const v=hex.replace('#','');const n=parseInt(v.length===3?v.split('').map(x=>x+x).join(''):v,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`}
function bezier(a,c,b,t){const m=1-t;return{x:m*m*a.x+2*m*t*c.x+t*t*b.x,y:m*m*a.y+2*m*t*c.y+t*t*b.y}}

export class AtlasEngine{
  constructor(canvas,{onSelect,onOpen,onZoom}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.callbacks={onSelect,onOpen,onZoom};
    this.camera={yaw:.34,pitch:-.24,zoom:.72,panX:0,panY:0,flat:false};
    this.graph={nodes:[],edges:[]};this.positions=new Map();this.points=[];this.selected=null;this.hover=null;this.focus='system:NEXO';
    this.drag=null;this.pointers=new Map();this.orbit=false;this.frame=0;this.last=0;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stars=Array.from({length:220},(_,i)=>({x:(hash('x'+i)%10000)/10000,y:(hash('y'+i)%10000)/10000,s:i%17===0?1.5:.75,p:(hash('p'+i)%100)/100}));
    this.bind();new ResizeObserver(()=>this.draw()).observe(canvas);this.kick();
  }
  bind(){
    const c=this.canvas;
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('wheel',e=>{e.preventDefault();const before=this.camera.zoom;this.camera.zoom=clamp(this.camera.zoom*Math.exp(-e.deltaY*.0012),.48,3.1);if(Math.abs(before-this.camera.zoom)>.01)this.callbacks.onZoom?.(this.camera.zoom);this.kick()},{passive:false});
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});this.drag={x:e.offsetX,y:e.offsetY,button:e.button,moved:0,node:this.hit(e.offsetX,e.offsetY)}});
    c.addEventListener('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);
      if(p){const dx=e.offsetX-p.x,dy=e.offsetY-p.y;this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});this.drag.moved+=Math.abs(dx)+Math.abs(dy);
        if(e.shiftKey||this.drag.button===2){this.camera.panX+=dx;this.camera.panY+=dy}else{this.camera.yaw+=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.006,-1.2,1.2)}this.kick();
      } else {const n=this.hit(e.offsetX,e.offsetY);if(n?.id!==this.hover?.id){this.hover=n;c.style.cursor=n?'pointer':'grab';this.kick()}}
    });
    c.addEventListener('pointerup',e=>{this.pointers.delete(e.pointerId);if(this.drag&&this.drag.moved<7){const n=this.hit(e.offsetX,e.offsetY);if(n){this.selected=n.id;this.callbacks.onSelect?.(n);this.kick()}}this.drag=null});
    c.addEventListener('dblclick',e=>{const n=this.hit(e.offsetX,e.offsetY);if(n)this.callbacks.onOpen?.(n)});
    c.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.camera.yaw-=.14;if(e.key==='ArrowRight')this.camera.yaw+=.14;if(e.key==='ArrowUp')this.camera.pitch-=.12;if(e.key==='ArrowDown')this.camera.pitch+=.12;if(e.key==='+')this.zoom(1.15);if(e.key==='-')this.zoom(.87);this.kick()});
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{this.reduced=e.matches;if(this.reduced)this.orbit=false;this.kick()});
  }
  setData(graph,{focus}={}){this.graph=graph||{nodes:[],edges:[]};this.focus=focus||graph?.focus||this.focus;this.positions=new Map(layoutGraph(this.graph.nodes,{focus:this.focus}).map(p=>[p.id,p]));this.selected=null;this.hover=null;this.kick()}
  setSelected(id){this.selected=id;this.kick()}
  setZoom(value){this.camera.zoom=clamp(value,.48,3.1);this.callbacks.onZoom?.(this.camera.zoom);this.kick()}
  zoom(f){this.setZoom(this.camera.zoom*f)}
  reset(){Object.assign(this.camera,{yaw:.34,pitch:-.24,zoom:this.graph.semanticView==='macro'?.72:this.graph.semanticView==='provenance'?2.1:1.2,panX:0,panY:0});this.callbacks.onZoom?.(this.camera.zoom);this.kick()}
  toggleFlat(){this.camera.flat=!this.camera.flat;if(this.camera.flat){this.camera.pitch=0;this.camera.yaw=0}this.kick();return this.camera.flat}
  toggleOrbit(){if(this.reduced)return false;this.orbit=!this.orbit;this.kick();return this.orbit}
  focusSelected(){const p=this.points.find(p=>p.node.id===this.selected);if(!p)return;this.camera.panX+=this.w/2-p.x;this.camera.panY+=this.h/2-p.y;this.kick()}
  kick(){if(!this.frame)this.frame=requestAnimationFrame(t=>this.loop(t))}
  loop(t){this.frame=0;const dt=this.last?Math.min(40,t-this.last):16;this.last=t;if(this.orbit&&!this.reduced)this.camera.yaw+=dt*.000055;this.draw(t);if(this.orbit||(!this.reduced&&this.graph.nodes.some(n=>(n.temporalWeight||0)>.45)))this.kick();else this.last=0}
  project(pos){let {x,y,z}=pos;if(this.camera.flat)z=0;const cy=Math.cos(this.camera.yaw),sy=Math.sin(this.camera.yaw),cp=Math.cos(this.camera.pitch),sp=Math.sin(this.camera.pitch);const xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp,depth=y*sp+zz*cp;const scale=780/(780-depth)*this.camera.zoom*Math.min(this.w/1080,this.h/720);return{x:this.w/2+xx*scale+this.camera.panX,y:this.h/2+yy*scale+this.camera.panY,z:depth,scale}}
  hit(x,y){return [...this.points].sort((a,b)=>b.z-a.z).find(p=>Math.hypot(x-p.x,y-p.y)<p.r+8)?.node}
  nodeRadius(n){if(n.id===this.focus)return 17;if(n.type==='SYSTEM')return 15;if(n.type==='DOMAIN')return 13;if(n.type==='CAMPAIGN')return 10;if(n.type==='SOURCE')return 8;return 6.5}
  draw(now=performance.now()){
    const c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.w=w;this.h=h;const dpr=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr)}c.setTransform(dpr,0,0,dpr,0,0);
    const bg=c.createRadialGradient(w*.48,h*.42,0,w*.48,h*.42,Math.max(w,h)*.72);bg.addColorStop(0,'#07152b');bg.addColorStop(.38,'#040a16');bg.addColorStop(1,'#01030a');c.fillStyle=bg;c.fillRect(0,0,w,h);
    const neb=(x,y,r,rgb)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${rgb},.13)`);g.addColorStop(.45,`rgba(${rgb},.075)`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.fillRect(0,0,w,h)};
    neb(w*.18,h*.22,w*.5,'78,65,198');neb(w*.78,h*.68,w*.42,'0,157,213');
    for(const s of this.stars){const par=1+(this.camera.yaw*.04*s.p);let x=((s.x*par)%1)*w,y=s.y*h;c.fillStyle=`rgba(205,226,255,${.12+s.p*.34})`;c.fillRect(x,y,s.s,s.s)}
    this.points=this.graph.nodes.map(n=>{const pos=this.positions.get(n.id)||{x:0,y:0,z:n.zBand||0};const drift=this.reduced?0:Math.sin(now*.00016+(hash(n.id)%100))*5*(n.temporalWeight||.2);const p=this.project({x:pos.x+drift,y:pos.y+Math.cos(now*.00013+(hash(n.id)%70))*drift*.45,z:pos.z});return{...p,node:n,r:Math.max(4,this.nodeRadius(n)*p.scale)}});
    const map=new Map(this.points.map(p=>[p.node.id,p]));const focused=this.selected||this.hover?.id;const related=new Set([focused]);for(const e of this.graph.edges){if(e.source===focused||e.target===focused){related.add(e.source);related.add(e.target)}}
    for(const e of this.graph.edges){const a=map.get(e.source),b=map.get(e.target);if(!a||!b)continue;const active=!focused||(related.has(e.source)&&related.has(e.target));const col=EDGE_COLOR[e.type]||'#52739e';const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const cp={x:(a.x+b.x)/2-dy/len*Math.min(56,len*.18),y:(a.y+b.y)/2+dx/len*Math.min(56,len*.18)};c.globalAlpha=active?.42:.065;c.strokeStyle=col;c.lineWidth=active?1.15:.7;c.setLineDash(e.authority==='SCIENCE_CANONICAL'?[]:[4,7]);c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(cp.x,cp.y,b.x,b.y);c.stroke();c.setLineDash([]);
      if(active&&!this.reduced){const speed=.00008+(hash(e.id||e.source+e.target)%30)*.000001;const t=(now*speed)%1;const p=bezier(a,cp,b,t);const g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,8);g.addColorStop(0,rgba(col,.9));g.addColorStop(1,rgba(col,0));c.fillStyle=g;c.globalAlpha=.9;c.beginPath();c.arc(p.x,p.y,8,0,TAU);c.fill()}
    }
    c.globalAlpha=1;
    const depth=this.points.map(p=>p.z);const min=Math.min(0,...depth),max=Math.max(1,...depth);
    for(const p of [...this.points].sort((a,b)=>a.z-b.z)){const n=p.node;const near=(p.z-min)/(max-min||1);let col=TYPE_COLOR[n.visualType||n.type]||'#91a7c6';if(STATUS_DANGER.test(String(n.status||n.summary||'')))col='#ff6d88';const activity=n.temporalWeight??.25;const selected=n.id===this.selected,hover=n.id===this.hover?.id,focus=n.id===this.focus;const dim=focused&&!related.has(n.id)&&!selected;const pulse=this.reduced?1:1+Math.sin(now*.003+hash(n.id))*0.045*activity;const r=p.r*pulse;c.globalAlpha=(.35+.65*near)*(dim?.16:1);
      const haloR=r*(2.5+activity*3.8);const halo=c.createRadialGradient(p.x,p.y,0,p.x,p.y,haloR);halo.addColorStop(0,rgba(col,.18+.26*activity));halo.addColorStop(.45,rgba(col,.06+.08*activity));halo.addColorStop(1,rgba(col,0));c.fillStyle=halo;c.beginPath();c.arc(p.x,p.y,haloR,0,TAU);c.fill();
      c.strokeStyle=col;c.fillStyle=rgba(col,.16+activity*.13);c.lineWidth=selected||hover?2.2:focus?1.8:1;
      c.beginPath();if((n.visualType||n.type)==='HYPOTHESIS'||n.type==='CLAIM'){c.moveTo(p.x,p.y-r*1.2);c.lineTo(p.x+r,p.y);c.lineTo(p.x,p.y+r*1.2);c.lineTo(p.x-r,p.y);c.closePath()}else if(n.type==='SOURCE'||n.type==='SOURCE_REF'){c.roundRect(p.x-r,p.y-r,r*2,r*2,Math.max(2,r*.22))}else{c.arc(p.x,p.y,r,0,TAU)}c.fill();c.stroke();
      if(n.type==='DOMAIN'||n.type==='SYSTEM'||focus){c.beginPath();c.ellipse(p.x,p.y,r*1.55,r*.52,this.camera.yaw*.35,0,TAU);c.strokeStyle=rgba(col,.48);c.lineWidth=.8;c.stroke()}
      if(selected||hover){c.beginPath();c.arc(p.x,p.y,r+7,0,TAU);c.strokeStyle=rgba(col,.75);c.lineWidth=1.2;c.stroke()}
    }
    c.globalAlpha=1;this.drawLabels(c,w,h,focused,related);
    const vignette=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.25,w/2,h/2,Math.max(w,h)*.7);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.55)');c.fillStyle=vignette;c.fillRect(0,0,w,h)
  }
  drawLabels(c,w,h,focused,related){const occupied=[];const priorities={SYSTEM:10,DOMAIN:9,CAMPAIGN:8,HYPOTHESIS:7,CLAIM:7,TEST:5,RESULT:4,SOURCE:3};const sorted=[...this.points].sort((a,b)=>(b.node.id===this.selected?100:priorities[b.node.visualType||b.node.type]||0)-(a.node.id===this.selected?100:priorities[a.node.visualType||a.node.type]||0));let count=0;const max=w<620?7:16;for(const p of sorted){const n=p.node;if(count>=max&&n.id!==this.selected&&n.id!==this.hover?.id)continue;if(focused&&!related.has(n.id)&&n.id!==this.selected)continue;const label=String(n.label||n.id).replace(/\s+/g,' ').slice(0,w<620?28:42);c.font=`${n.id===this.focus?700:600} ${n.id===this.focus?13:11}px system-ui`;const tw=c.measureText(label).width;const box={x:clamp(p.x-tw/2-8,8,w-tw-24),y:clamp(p.y+p.r+10,8,h-34),w:tw+16,h:25};if(occupied.some(o=>box.x<o.x+o.w+5&&box.x+box.w+5>o.x&&box.y<o.y+o.h+4&&box.y+box.h+4>o.y))continue;occupied.push(box);count++;c.fillStyle='rgba(3,8,18,.76)';c.strokeStyle='rgba(124,160,211,.18)';c.lineWidth=1;c.beginPath();c.roundRect(box.x,box.y,box.w,box.h,7);c.fill();c.stroke();c.fillStyle='#dce9fb';c.textAlign='center';c.fillText(label,box.x+box.w/2,box.y+16)}c.textAlign='left'}
}
