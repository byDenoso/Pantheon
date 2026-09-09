import {GraphLabRenderer as LegacyCanvasRenderer} from './legacy-renderer.mjs';
import {filamentControl,quadraticBezierPoint,pulsePhase,filamentKind} from './filaments.mjs';
import {PALETTE_A,PALETTE_LIGHT,colorForNode} from './palette.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const fract=value=>value-Math.floor(value);
const hashUnit=key=>fract(Math.sin([...String(key)].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1)*12.9898,0))*43758.5453123);
const hexRgb=hex=>{const h=String(hex||'#ffffff').replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return[(n>>16)&255,(n>>8)&255,n&255]};
const rgb=hex=>{const [r,g,b]=hexRgb(hex);return`${r},${g},${b}`};
const mixHex=(a,b,t)=>{const A=hexRgb(a),B=hexRgb(b);return'#'+A.map((value,index)=>Math.round(value+(B[index]-value)*t).toString(16).padStart(2,'0')).join('')};

const SECTION_COLOURS={
 dark:{base:'#02070f',deep:'#000208',star:'#d9ecff',blue:'#2ebdff',violet:'#8a62ff',gold:'#ffba58',dust:'#dff4ff'},
 light:{base:'#eaf4ff',deep:'#f8fcff',star:'#386b95',blue:'#0077cc',violet:'#6f52be',gold:'#c97916',dust:'#214564'}
};

function canvas(width,height){
 if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(width,height);
 const node=document.createElement('canvas');node.width=width;node.height=height;return node;
}
function glowDot(ctx,x,y,r,color,alpha=1){
 const g=ctx.createRadialGradient(x,y,0,x,y,r*4.4);
 g.addColorStop(0,`rgba(${rgb(color)},${alpha})`);
 g.addColorStop(.24,`rgba(${rgb(color)},${alpha*.46})`);
 g.addColorStop(1,`rgba(${rgb(color)},0)`);
 ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*4.4,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=`rgba(255,255,255,${Math.min(.95,alpha+.15)})`;ctx.beginPath();ctx.arc(x,y,Math.max(.7,r*.55),0,Math.PI*2);ctx.fill();
}

function drawSpiralGalaxy(ctx,cx,cy,rx,ry,{theme='dark',spin=1,opacity=1,arms=5,prefix='galaxy'}={}){
 const C=SECTION_COLOURS[theme];
 ctx.save();
 ctx.globalCompositeOperation=theme==='light'?'source-over':'lighter';
 for(let arm=0;arm<arms;arm++){
  for(let i=0;i<720;i++){
   const t=i/720;
   const radius=t;
   const angle=spin*(arm*Math.PI*2/arms+t*5.9+(hashUnit(`${prefix}:a:${arm}:${i}`)-.5)*.34);
   const width=(1-t)*.075+.012;
   const lateral=(hashUnit(`${prefix}:j:${arm}:${i}`)-.5)*width;
   const x=cx+Math.cos(angle)*(radius+lateral)*rx+Math.cos(angle+Math.PI/2)*lateral*rx*.62;
   const y=cy+Math.sin(angle)*(radius+lateral)*ry+Math.sin(angle+Math.PI/2)*lateral*ry*.42;
   const warm=hashUnit(`${prefix}:warm:${arm}:${i}`)>.54;
   const color=warm?C.gold:C.blue;
   const alpha=((1-t)*.16+.018)*opacity;
   ctx.fillStyle=`rgba(${rgb(color)},${alpha})`;
   ctx.beginPath();ctx.arc(x,y,(.55+hashUnit(`${prefix}:s:${arm}:${i}`)*1.9)*Math.max(rx,ry)/1100,0,Math.PI*2);ctx.fill();
  }
 }
 const core=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry)*.20);
 core.addColorStop(0,`rgba(255,248,220,${.36*opacity})`);
 core.addColorStop(.26,`rgba(${rgb(C.gold)},${.25*opacity})`);
 core.addColorStop(1,`rgba(${rgb(C.gold)},0)`);
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,Math.max(rx,ry)*.20,0,Math.PI*2);ctx.fill();
 ctx.restore();
}

function drawDustLane(ctx,w,h,theme){
 // Approved option 3: blue-gold dust lane sweeping behind the 2D graph.
 const C=SECTION_COLOURS[theme];
 const cx=w*.50,cy=h*.50;
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-.18);ctx.scale(1,.44);
 ctx.globalCompositeOperation=theme==='light'?'multiply':'lighter';
 for(let ring=0;ring<7;ring++){
  const r=Math.min(w,h)*(.28+ring*.065);
  ctx.lineWidth=Math.max(1.2,w*.0014)*(ring%2?1:.62);
  ctx.strokeStyle=`rgba(${rgb(ring<3?C.gold:C.blue)},${theme==='light'?.08:.14})`;
  ctx.setLineDash(ring%2?[2,14]:[]);
  ctx.beginPath();ctx.ellipse(0,0,r*1.72,r,0,Math.PI*.07,Math.PI*1.92);ctx.stroke();
 }
 ctx.setLineDash([]);
 for(let i=0;i<1800;i++){
  const t=hashUnit(`lane:t:${i}`);
  const angle=-2.75+t*5.35+(hashUnit(`lane:a:${i}`)-.5)*.18;
  const r=Math.min(w,h)*(.24+t*.55)+(hashUnit(`lane:r:${i}`)-.5)*34;
  const yj=(hashUnit(`lane:y:${i}`)-.5)*(48*(1-t)+13);
  const x=Math.cos(angle)*r*1.72;
  const y=Math.sin(angle)*r+yj;
  const color=hashUnit(`lane:warm:${i}`)>.47?C.gold:C.blue;
  const alpha=(theme==='light'?.018:.04)+(1-t)*(theme==='light'?.05:.09);
  ctx.fillStyle=`rgba(${rgb(color)},${alpha})`;
  ctx.beginPath();ctx.arc(x,y,Math.max(.35,hashUnit(`lane:s:${i}`)*2.1),0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}

function drawReferenceStars(ctx,w,h,theme,stars){
 const C=SECTION_COLOURS[theme];
 const count=theme==='light'?Math.min(420,stars):Math.min(1200,stars*5);
 for(let i=0;i<count;i++){
  const x=hashUnit(`refstar:x:${i}`)*w,y=hashUnit(`refstar:y:${i}`)*h;
  const major=i%53===0,twinkle=i%137===0;
  const r=major?1.8+hashUnit(`refstar:r:${i}`)*1.9:.45+hashUnit(`refstar:r:${i}`)*1.15;
  const color=i%17===0?C.gold:i%7===0?C.blue:C.star;
  const alpha=theme==='light'?(major?.34:.18):(major?.86:.40);
  if(major)glowDot(ctx,x,y,r,color,alpha);
  else{ctx.fillStyle=`rgba(${rgb(color)},${alpha})`;ctx.fillRect(x,y,r,r)}
  if(twinkle){ctx.strokeStyle=`rgba(${rgb(color)},${theme==='light'?.12:.42})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke()}
 }
}

function drawNebulaClouds(ctx,w,h,theme){
 const C=SECTION_COLOURS[theme];
 const clouds=[
  {x:.18,y:.23,r:.42,color:C.blue,a:theme==='light'?.12:.28},
  {x:.70,y:.28,r:.38,color:C.blue,a:theme==='light'?.11:.23},
  {x:.40,y:.72,r:.46,color:C.violet,a:theme==='light'?.08:.18},
  {x:.22,y:.58,r:.32,color:C.gold,a:theme==='light'?.07:.16},
  {x:.82,y:.58,r:.32,color:theme==='light'?C.blue:'#d0528f',a:theme==='light'?.06:.12}
 ];
 ctx.save();ctx.globalCompositeOperation=theme==='light'?'source-over':'lighter';
 for(const cloud of clouds){
  const x=w*cloud.x,y=h*cloud.y,r=Math.max(w,h)*cloud.r;
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(${rgb(cloud.color)},${cloud.a})`);
  g.addColorStop(.35,`rgba(${rgb(cloud.color)},${cloud.a*.42})`);
  g.addColorStop(1,`rgba(${rgb(cloud.color)},0)`);
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 }
 ctx.restore();
}

function drawCornerGalaxies(ctx,w,h,theme){
 const C=SECTION_COLOURS[theme];
 drawSpiralGalaxy(ctx,w*.15,h*.18,w*.12,h*.055,{theme,spin:1,opacity:theme==='light'?.36:.9,arms:4,prefix:'corner-left'});
 drawSpiralGalaxy(ctx,w*.88,h*.74,w*.075,h*.035,{theme,spin:-1,opacity:theme==='light'?.22:.45,arms:4,prefix:'corner-right'});
 drawSpiralGalaxy(ctx,w*.15,h*.78,w*.055,h*.025,{theme,spin:1,opacity:theme==='light'?.16:.35,arms:4,prefix:'corner-low'});
 ctx.strokeStyle=`rgba(${rgb(C.blue)},${theme==='light'?.08:.13})`;ctx.lineWidth=1;
 for(const spec of [[.5,.50,.40,-.17],[.5,.50,.31,-.17],[.5,.50,.22,-.17]]){
  ctx.beginPath();ctx.ellipse(w*spec[0],h*spec[1],w*spec[2],h*spec[2]*.33,spec[3],0,Math.PI*2);ctx.stroke();
 }
}

function referenceGalaxyTexture(w,h,theme='dark',stars=260){
 const scale=Math.min(1.35,Math.max(1,globalThis.devicePixelRatio||1));
 const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
 const layer=canvas(width,height);const ctx=layer.getContext('2d');
 ctx.setTransform(scale,0,0,scale,0,0);
 const C=SECTION_COLOURS[theme];
 const base=ctx.createLinearGradient(0,0,w,h);
 if(theme==='light'){
  base.addColorStop(0,'#f8fcff');base.addColorStop(.42,'#eaf4ff');base.addColorStop(1,'#dceafa');
 }else{
  base.addColorStop(0,'#01040a');base.addColorStop(.38,'#07172a');base.addColorStop(1,'#000106');
 }
 ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
 drawNebulaClouds(ctx,w,h,theme);
 drawDustLane(ctx,w,h,theme);
 drawReferenceStars(ctx,w,h,theme,stars);
 drawCornerGalaxies(ctx,w,h,theme);
 const center=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.48,Math.max(w,h)*.36);
 center.addColorStop(0,`rgba(${rgb(C.gold)},${theme==='light'?.13:.18})`);
 center.addColorStop(.32,`rgba(${rgb(C.blue)},${theme==='light'?.08:.12})`);
 center.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=center;ctx.fillRect(0,0,w,h);
 const vignette=ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.18,w*.5,h*.48,Math.max(w,h)*.72);
 vignette.addColorStop(0,'rgba(0,0,0,0)');
 vignette.addColorStop(1,theme==='light'?'rgba(70,105,150,.10)':'rgba(0,0,0,.52)');
 ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
 return layer;
}

const originalDrawGuides=LegacyCanvasRenderer.prototype.drawGuides;
LegacyCanvasRenderer.prototype.drawSpace=function(ctx,w,h){
 const referenceBackgroundTheme=this.referenceBackgroundTheme||this.theme||'dark';
 const roundedW=Math.round(w/24)*24,roundedH=Math.round(h/24)*24;
 const cacheKey=`${referenceBackgroundTheme}:${roundedW}x${roundedH}:${this.options?.stars||0}`;
 if(this.referenceBackgroundCacheKey!==cacheKey){
  this.referenceBackgroundCacheKey=cacheKey;
  this.referenceBackgroundCanvas=referenceGalaxyTexture(Math.max(roundedW,w),Math.max(roundedH,h),referenceBackgroundTheme,this.options?.stars||260);
 }
 ctx.drawImage(this.referenceBackgroundCanvas,0,0,w,h);
};

LegacyCanvasRenderer.prototype.drawGuides=function(ctx,w,h){
 originalDrawGuides.call(this,ctx,w,h);
 const theme=this.referenceBackgroundTheme||this.theme||'dark';
 const C=SECTION_COLOURS[theme];
 ctx.save();
 ctx.translate(w/2+(this.camera?.panX||0),h/2+(this.camera?.panY||0));
 ctx.rotate(-.17);
 ctx.strokeStyle=`rgba(${rgb(theme==='light'?C.blue:C.gold)},${theme==='light'?.14:.18})`;
 ctx.lineWidth=1;
 ctx.setLineDash([2,9]);
 for(const r of [90,154,235,315]){ctx.beginPath();ctx.ellipse(0,0,r*this.camera.zoom*1.55,r*this.camera.zoom*.47,0,0,Math.PI*2);ctx.stroke()}
 ctx.restore();
};

function filamentStyleFor(kind,theme){
 const dark={canonical:'#74c7ff',derived:'#9b82ff','cross-domain':'#62e1cb','intra-domain':'#b8d9f2'};
 const light={canonical:'#087fbe',derived:'#7658c9','cross-domain':'#168e7d','intra-domain':'#55718b'};
 return (theme==='light'?light:dark)[kind]||(theme==='light'?'#55718b':'#6685a3');
}

LegacyCanvasRenderer.prototype.drawFilaments=function(ctx,byId,now,still){
 const theme=this.referenceBackgroundTheme||this.theme||'dark';
 const background=theme==='light'?'#eaf4ff':'#02070f';
 for(const edge of this.graph.edges){
  const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
  const kind=filamentKind(edge),base=filamentStyleFor(kind,theme),cp=filamentControl(a,b,this.options.filamentCurve,edge.source<edge.target?1:-1);
  const depth=(a.z+b.z)/2,fade=1-clamp((110-depth)/600,0,this.options.fog);
  const col=mixHex(base,background,(1-fade)*(theme==='light'?.2:.45));
  ctx.globalAlpha=(kind==='canonical'?.48:.34)*fade;
  ctx.strokeStyle=col;ctx.lineWidth=kind==='canonical'?1.35:1.05;ctx.setLineDash(kind==='derived'?[5,7]:kind==='cross-domain'?[2,6]:[]);
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cp.cx,cp.cy,b.x,b.y);ctx.stroke();ctx.setLineDash([]);
  if(still)continue;
  const pulse=pulsePhase(edge.id||`${edge.source}:${edge.target}`,now,.24*this.options.pulseSpeed);
  const head=quadraticBezierPoint(a,cp,b,pulse.t),behind=quadraticBezierPoint(a,cp,b,clamp(pulse.t-pulse.direction*.065,0,1));
  ctx.globalAlpha=theme==='light'?.28:.44;ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(behind.x,behind.y);ctx.lineTo(head.x,head.y);ctx.stroke();
  const g=ctx.createRadialGradient(head.x,head.y,0,head.x,head.y,10*this.options.glow);g.addColorStop(0,col+'e8');g.addColorStop(.35,col+'58');g.addColorStop(1,col+'00');
  ctx.globalAlpha=1;ctx.fillStyle=g;ctx.beginPath();ctx.arc(head.x,head.y,10*this.options.glow,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=theme==='light'?'#102033':'#eafbff';ctx.beginPath();ctx.arc(head.x,head.y,1.7,0,Math.PI*2);ctx.fill();
 }
 ctx.globalAlpha=1;
};

LegacyCanvasRenderer.prototype.nodeColor=function(node){
 const theme=this.referenceBackgroundTheme||this.theme||'dark';
 const palette=theme==='light'?PALETTE_LIGHT:PALETTE_A;
 if(theme==='light'){
  if(node?.ops?.tone==='blocked'||String(node?.status||'').toUpperCase().includes('BLOCK'))return palette.chrome.danger;
  if(node?.id==='system:NEXO'||node?.recordId==='NEXO')return palette.semantic.NEXO;
  const system=String(node?.system||'').replace(/^system:/,'');
  if(system&&palette.semantic[system])return palette.semantic[system];
  const status=String(node?.status||'').toLowerCase();
  if(palette.states[status])return palette.states[status];
  return palette.semantic.DEFAULT;
 }
 return node?.hue||colorForNode(node,palette);
};

LegacyCanvasRenderer.prototype.setTheme=function(theme='dark'){
 const next=theme==='light'?'light':'dark';
 this.theme=next;
 this.referenceBackgroundTheme=next;
 this.options.background=next==='light'?'#eaf4ff':'#02070f';
 this.options.text=next==='light'?'#102033':'#eaf3ff';
 this.options.muted=next==='light'?'#425e78':'#a7bed5';
 this.referenceBackgroundCacheKey='';
 this.render();
};
