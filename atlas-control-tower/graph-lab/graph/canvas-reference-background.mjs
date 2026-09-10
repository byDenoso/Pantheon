import {GraphLabRenderer as LegacyCanvasRenderer} from './legacy-renderer.mjs';
import {GraphLabRenderer as ThreeCanvasRenderer} from './renderer.mjs';
import {filamentControl,quadraticBezierPoint,pulsePhase,filamentKind} from './filaments.mjs';
import {PALETTE_A,PALETTE_LIGHT,colorForNode} from './palette.mjs';
import './renderers/visual-presets.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const fract=value=>value-Math.floor(value);
const hashUnit=key=>fract(Math.sin([...String(key)].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1)*12.9898,0))*43758.5453123);
const hexRgb=hex=>{const h=String(hex||'#ffffff').replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return[(n>>16)&255,(n>>8)&255,n&255]};
const rgb=hex=>{const [r,g,b]=hexRgb(hex);return`${r},${g},${b}`};
const mixHex=(a,b,t)=>{const A=hexRgb(a),B=hexRgb(b);return'#'+A.map((value,index)=>Math.round(value+(B[index]-value)*t).toString(16).padStart(2,'0')).join('')};




export const LIGHT_CONTRAST={id:'LIGHT_CONTRAST',name:'Solar Observatory Contrast',stage:'#d7e8f7',labelBg:'#051c30',labelText:'#ffffff',labelDim:'#b9defe',orbit:'#006fc9',panel:'#f8fcff'};

const SECTION_COLOURS={
 dark:{base:'#02070f',deep:'#000208',star:'#d9ecff',blue:'#2ebdff',violet:'#8a62ff',gold:'#ffba58',dust:'#dff4ff'},
 light:{base:'#d7e8f7',deep:'#eef7ff',star:'#255a86',blue:'#006fc9',violet:'#6f52be',gold:'#b96a00',dust:'#173956'}
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
 ctx.save();ctx.globalCompositeOperation=theme==='light'?'multiply':'lighter';
 for(let arm=0;arm<arms;arm++)for(let i=0;i<520;i++){
  const t=i/520,radius=t,angle=spin*(arm*Math.PI*2/arms+t*5.9+(hashUnit(`${prefix}:a:${arm}:${i}`)-.5)*.34);
  const width=(1-t)*.075+.012,lateral=(hashUnit(`${prefix}:j:${arm}:${i}`)-.5)*width;
  const x=cx+Math.cos(angle)*(radius+lateral)*rx+Math.cos(angle+Math.PI/2)*lateral*rx*.62;
  const y=cy+Math.sin(angle)*(radius+lateral)*ry+Math.sin(angle+Math.PI/2)*lateral*ry*.42;
  const color=hashUnit(`${prefix}:warm:${arm}:${i}`)>.54?C.gold:C.blue;
  ctx.fillStyle=`rgba(${rgb(color)},${((1-t)*.16+.018)*opacity})`;
  ctx.beginPath();ctx.arc(x,y,(.55+hashUnit(`${prefix}:s:${arm}:${i}`)*1.9)*Math.max(rx,ry)/1100,0,Math.PI*2);ctx.fill();
 }
 const core=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry)*.20);
 core.addColorStop(0,`rgba(255,248,220,${.30*opacity})`);core.addColorStop(.26,`rgba(${rgb(C.gold)},${.22*opacity})`);core.addColorStop(1,`rgba(${rgb(C.gold)},0)`);
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,Math.max(rx,ry)*.20,0,Math.PI*2);ctx.fill();ctx.restore();
}

function drawDustLane(ctx,w,h,theme,intensity=1){
 // Approved option 3: blue-gold dust lane sweeping behind the 2D graph.
 const C=SECTION_COLOURS[theme],cx=w*.50,cy=h*.50;
 ctx.save();ctx.translate(cx,cy);ctx.rotate(-.18);ctx.scale(1,.44);ctx.globalCompositeOperation=theme==='light'?'multiply':'lighter';
 for(let ring=0;ring<7;ring++){
  const r=Math.min(w,h)*(.28+ring*.065);ctx.lineWidth=Math.max(1.2,w*.0014)*(ring%2?1:.62);
  ctx.strokeStyle=`rgba(${rgb(ring<3?C.gold:C.blue)},${(theme==='light'?.13:.14)*intensity})`;ctx.setLineDash(ring%2?[2,14]:[]);
  ctx.beginPath();ctx.ellipse(0,0,r*1.72,r,0,Math.PI*.07,Math.PI*1.92);ctx.stroke();
 }
 ctx.setLineDash([]);
 const count=theme==='light'?1200:1800;
 for(let i=0;i<count;i++){
  const t=hashUnit(`lane:t:${i}`),angle=-2.75+t*5.35+(hashUnit(`lane:a:${i}`)-.5)*.18,r=Math.min(w,h)*(.24+t*.55)+(hashUnit(`lane:r:${i}`)-.5)*34;
  const x=Math.cos(angle)*r*1.72,y=Math.sin(angle)*r+(hashUnit(`lane:y:${i}`)-.5)*(48*(1-t)+13),color=hashUnit(`lane:warm:${i}`)>.47?C.gold:C.blue;
  const alpha=((theme==='light'?.026:.04)+(1-t)*(theme==='light'?.07:.09))*intensity;
  ctx.fillStyle=`rgba(${rgb(color)},${alpha})`;ctx.beginPath();ctx.arc(x,y,Math.max(.35,hashUnit(`lane:s:${i}`)*2.1),0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}

function drawReferenceStars(ctx,w,h,theme,stars,intensity=1){
 const C=SECTION_COLOURS[theme],count=theme==='light'?Math.min(560,stars*2):Math.min(1500,stars*5);
 for(let i=0;i<count;i++){
  const x=hashUnit(`refstar:x:${i}`)*w,y=hashUnit(`refstar:y:${i}`)*h,major=i%53===0,twinkle=i%137===0;
  const r=major?1.8+hashUnit(`refstar:r:${i}`)*1.9:.45+hashUnit(`refstar:r:${i}`)*1.15,color=i%17===0?C.gold:i%7===0?C.blue:C.star;
  const alpha=(theme==='light'?(major?.48:.24):(major?.86:.40))*intensity;
  if(major)glowDot(ctx,x,y,r,color,alpha);else{ctx.fillStyle=`rgba(${rgb(color)},${alpha})`;ctx.fillRect(x,y,r,r)}
  if(twinkle){ctx.strokeStyle=`rgba(${rgb(color)},${(theme==='light'?.22:.42)*intensity})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-10,y);ctx.lineTo(x+10,y);ctx.moveTo(x,y-10);ctx.lineTo(x,y+10);ctx.stroke()}
 }
}

function drawNebulaClouds(ctx,w,h,theme,intensity=1){
 const C=SECTION_COLOURS[theme];
 const clouds=[{x:.18,y:.23,r:.42,color:C.blue,a:theme==='light'?.18:.28},{x:.70,y:.28,r:.38,color:C.blue,a:theme==='light'?.16:.23},{x:.40,y:.72,r:.46,color:C.violet,a:theme==='light'?.11:.18},{x:.22,y:.58,r:.32,color:C.gold,a:theme==='light'?.09:.16},{x:.82,y:.58,r:.32,color:theme==='light'?C.blue:'#d0528f',a:theme==='light'?.08:.12}];
 ctx.save();ctx.globalCompositeOperation=theme==='light'?'multiply':'lighter';
 for(const cloud of clouds){const x=w*cloud.x,y=h*cloud.y,r=Math.max(w,h)*cloud.r,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${rgb(cloud.color)},${cloud.a*intensity})`);g.addColorStop(.35,`rgba(${rgb(cloud.color)},${cloud.a*.42*intensity})`);g.addColorStop(1,`rgba(${rgb(cloud.color)},0)`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}
 ctx.restore();
}

function drawCornerGalaxies(ctx,w,h,theme,intensity=1){
 const C=SECTION_COLOURS[theme];
 drawSpiralGalaxy(ctx,w*.15,h*.18,w*.12,h*.055,{theme,spin:1,opacity:(theme==='light'?.44:.9)*intensity,arms:4,prefix:'corner-left'});
 drawSpiralGalaxy(ctx,w*.88,h*.74,w*.075,h*.035,{theme,spin:-1,opacity:(theme==='light'?.28:.45)*intensity,arms:4,prefix:'corner-right'});
 ctx.strokeStyle=`rgba(${rgb(C.blue)},${(theme==='light'?.14:.13)*intensity})`;ctx.lineWidth=1;
 for(const spec of [[.5,.50,.40,-.17],[.5,.50,.31,-.17],[.5,.50,.22,-.17]]){ctx.beginPath();ctx.ellipse(w*spec[0],h*spec[1],w*spec[2],h*spec[2]*.33,spec[3],0,Math.PI*2);ctx.stroke()}
}

function referenceGalaxyTexture(w,h,theme='dark',stars=260,intensity=1){
 const scale=Math.min(1.35,Math.max(1,globalThis.devicePixelRatio||1)),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
 const layer=canvas(width,height),ctx=layer.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);
 const C=SECTION_COLOURS[theme],base=ctx.createLinearGradient(0,0,w,h);
 if(theme==='light'){base.addColorStop(0,'#eef7ff');base.addColorStop(.44,LIGHT_CONTRAST.stage);base.addColorStop(1,'#bfd8f2')}else{base.addColorStop(0,'#01040a');base.addColorStop(.38,'#07172a');base.addColorStop(1,'#000106')}
 ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
 drawNebulaClouds(ctx,w,h,theme,intensity);drawDustLane(ctx,w,h,theme,intensity);drawReferenceStars(ctx,w,h,theme,stars,intensity);drawCornerGalaxies(ctx,w,h,theme,intensity);
 const center=ctx.createRadialGradient(w*.5,h*.48,0,w*.5,h*.48,Math.max(w,h)*.36);center.addColorStop(0,`rgba(${rgb(C.gold)},${(theme==='light'?.20:.18)*intensity})`);center.addColorStop(.32,`rgba(${rgb(C.blue)},${(theme==='light'?.13:.12)*intensity})`);center.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=center;ctx.fillRect(0,0,w,h);
 const vignette=ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.18,w*.5,h*.48,Math.max(w,h)*.72);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,theme==='light'?'rgba(24,62,96,.18)':'rgba(0,0,0,.52)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
 return layer;
}


const originalDrawGuides=LegacyCanvasRenderer.prototype.drawGuides;
LegacyCanvasRenderer.prototype.drawSpace=function(ctx,w,h){
 const theme=this.referenceBackgroundTheme||this.theme||'dark',intensity=this.options?.backgroundIntensity??1;
 const roundedW=Math.round(w/24)*24,roundedH=Math.round(h/24)*24;
 const cacheKey=`${theme}:${roundedW}x${roundedH}:${this.options?.stars||0}:${intensity}`;
 if(this.referenceBackgroundCacheKey!==cacheKey){this.referenceBackgroundCacheKey=cacheKey;this.referenceBackgroundCanvas=referenceGalaxyTexture(Math.max(roundedW,w),Math.max(roundedH,h),theme,this.options?.stars||260,intensity)}
 ctx.drawImage(this.referenceBackgroundCanvas,0,0,w,h);
};
LegacyCanvasRenderer.prototype.drawGuides=function(ctx,w,h){
 originalDrawGuides.call(this,ctx,w,h);
 const theme=this.referenceBackgroundTheme||this.theme||'dark',C=SECTION_COLOURS[theme];
 ctx.save();ctx.translate(w/2+(this.camera?.panX||0),h/2+(this.camera?.panY||0));ctx.rotate(-.17);
 ctx.strokeStyle=`rgba(${rgb(theme==='light'?C.blue:C.gold)},${theme==='light'?.18:.18})`;ctx.lineWidth=1;ctx.setLineDash([2,9]);
 for(const r of [90,154,235,315]){ctx.beginPath();ctx.ellipse(0,0,r*this.camera.zoom*1.55,r*this.camera.zoom*.47,0,0,Math.PI*2);ctx.stroke()}ctx.restore();
};
function filamentStyleFor(kind,theme){const dark={canonical:'#74c7ff',derived:'#9b82ff','cross-domain':'#62e1cb','intra-domain':'#b8d9f2',learning:'#2ec9ff',transfer:'#b48dff',validation:'#69dcc1',hypothesis:'#ffbe5c',risk:'#c96a7c'};const light={canonical:'#006fc9',derived:'#5e3eb7','cross-domain':'#007f71','intra-domain':'#315c80',learning:'#006fc9',transfer:'#5e3eb7',validation:'#008c76',hypothesis:'#a85d00',risk:'#b83e61'};return (theme==='light'?light:dark)[kind]||(theme==='light'?'#315c80':'#6685a3')}
LegacyCanvasRenderer.prototype.drawFilaments=function(ctx,byId,now,still){
 const theme=this.referenceBackgroundTheme||this.theme||'dark',background=theme==='light'?LIGHT_CONTRAST.stage:'#02070f';
 for(const edge of this.graph.edges){const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;const kind=filamentKind(edge),base=filamentStyleFor(kind,theme),cp=filamentControl(a,b,this.options.filamentCurve,edge.source<edge.target?1:-1);const depth=(a.z+b.z)/2,fade=1-clamp((110-depth)/600,0,this.options.fog);const col=mixHex(base,background,(1-fade)*(theme==='light'?.12:.45));ctx.globalAlpha=(kind==='canonical'?.58:.40)*fade;ctx.strokeStyle=col;ctx.lineWidth=kind==='canonical'?1.45:1.08;ctx.setLineDash(kind==='derived'?[5,7]:kind==='cross-domain'||kind==='learning'?[2,6]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(cp.cx,cp.cy,b.x,b.y);ctx.stroke();ctx.setLineDash([]);if(still)continue;const pulse=pulsePhase(edge.id||`${edge.source}:${edge.target}`,now,.24*this.options.pulseSpeed),head=quadraticBezierPoint(a,cp,b,pulse.t),behind=quadraticBezierPoint(a,cp,b,clamp(pulse.t-pulse.direction*.065,0,1));ctx.globalAlpha=theme==='light'?.34:.44;ctx.lineWidth=3.2;ctx.beginPath();ctx.moveTo(behind.x,behind.y);ctx.lineTo(head.x,head.y);ctx.stroke();const g=ctx.createRadialGradient(head.x,head.y,0,head.x,head.y,10*this.options.glow);g.addColorStop(0,col+'e8');g.addColorStop(.35,col+'58');g.addColorStop(1,col+'00');ctx.globalAlpha=1;ctx.fillStyle=g;ctx.beginPath();ctx.arc(head.x,head.y,10*this.options.glow,0,Math.PI*2);ctx.fill();ctx.fillStyle=theme==='light'?'#051c30':'#eafbff';ctx.beginPath();ctx.arc(head.x,head.y,1.7,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
};
LegacyCanvasRenderer.prototype.nodeColor=function(node){
 const theme=this.referenceBackgroundTheme||this.theme||'dark',palette=theme==='light'?PALETTE_LIGHT:PALETTE_A;
 if(theme==='light'){if(node?.ops?.tone==='blocked'||String(node?.status||'').toUpperCase().includes('BLOCK'))return palette.chrome.danger;if(node?.id==='system:NEXO'||node?.recordId==='NEXO')return palette.semantic.NEXO;const system=String(node?.system||'').replace(/^system:/,'');if(system&&palette.semantic[system])return palette.semantic[system];const status=String(node?.status||'').toLowerCase();if(palette.states[status])return palette.states[status];return palette.semantic.DEFAULT}
 return node?.hue||colorForNode(node,palette);
};

function installLightContrastCss(){
 if(document.getElementById('light-contrast-atlas'))return;const style=document.createElement('style');style.id='light-contrast-atlas';style.textContent=`:root[data-theme=light]{--graph-label-bg:${LIGHT_CONTRAST.labelBg};--graph-label-text:${LIGHT_CONTRAST.labelText};--graph-stage-bg:${LIGHT_CONTRAST.stage}}:root[data-theme=light] .stage{background:radial-gradient(80% 70% at 48% 42%,rgba(0,111,201,.17),transparent 58%),linear-gradient(135deg,#eef7ff,#d7e8f7 48%,#bfd8f2)!important}:root[data-theme=light] .stage-badge,:root[data-theme=light] .focus-readout,:root[data-theme=light] .stage-count,:root[data-theme=light] .stage-dock{background:rgba(5,28,48,.88)!important;color:#fff!important;border-color:rgba(0,111,201,.42)!important}:root[data-theme=light] .gesture-hint{color:#173956!important}`;document.head.append(style);
}

installLightContrastCss();
