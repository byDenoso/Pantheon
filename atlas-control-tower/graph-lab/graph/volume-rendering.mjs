import * as THREE from '../vendor/three.module.min.js';
import {GraphLabRenderer,parseCssColor} from './renderer.mjs';

const RING_NORMALS=[
 new THREE.Vector3(.18,.94,.28).normalize(),
 new THREE.Vector3(-.72,.28,.64).normalize(),
 new THREE.Vector3(.55,.36,.75).normalize(),
 new THREE.Vector3(-.28,.82,-.50).normalize()
];

function hashUnit(key){
 let hash=2166136261;
 for(let index=0;index<String(key).length;index++){
  hash^=String(key).charCodeAt(index);
  hash=Math.imul(hash,16777619);
 }
 return ((hash>>>0)%1000000)/1000000;
}

function stablePerpendicular(axis,radial){
 const normal=axis.clone().cross(radial);
 if(normal.lengthSq()>1e-6)return normal.normalize();
 const unit=axis.clone().normalize();
 const reference=Math.abs(unit.z)<.78?new THREE.Vector3(0,0,1):Math.abs(unit.y)<.78?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
 return axis.clone().cross(reference).normalize();
}

function canvasRgb(color){
 const rgb=new THREE.Color(color);
 const r=Math.round(rgb.r*255),g=Math.round(rgb.g*255),b=Math.round(rgb.b*255);
 return alpha=>`rgba(${r},${g},${b},${alpha})`;
}

function cloudTexture(color){
 const size=384,canvas=document.createElement('canvas');
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 const rgba=canvasRgb(color);
 const gradient=ctx.createRadialGradient(size*.46,size*.45,0,size*.5,size*.5,size*.5);
 gradient.addColorStop(0,rgba(.9));
 gradient.addColorStop(.22,rgba(.58));
 gradient.addColorStop(.53,rgba(.23));
 gradient.addColorStop(.82,rgba(.07));
 gradient.addColorStop(1,rgba(0));
 ctx.fillStyle=gradient;
 ctx.fillRect(0,0,size,size);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}

function galaxyTexture(){
 const width=2048,height=1152,canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 const cx=width*.47,cy=height*.52;
 const base=ctx.createRadialGradient(cx,cy,0,cx,cy,width*.66);
 base.addColorStop(0,'rgba(14,30,48,.98)');
 base.addColorStop(.32,'rgba(5,18,35,.72)');
 base.addColorStop(.68,'rgba(2,10,22,.42)');
 base.addColorStop(1,'rgba(0,2,8,.10)');
 ctx.fillStyle=base;ctx.fillRect(0,0,width,height);

 const drawParticle=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()};
 for(let arm=0;arm<5;arm++){
  for(let i=0;i<2300;i++){
   const t=i/2300;
   const radius=46+t*940+(hashUnit(`g:r:${arm}:${i}`)-.5)*92;
   const angle=arm*Math.PI*2/5+t*5.65+(hashUnit(`g:a:${arm}:${i}`)-.5)*.43;
   const thickness=(1-t)*70+18;
   const jitter=(hashUnit(`g:j:${arm}:${i}`)-.5)*thickness;
   const x=cx+Math.cos(angle)*radius*1.06+Math.cos(angle+Math.PI/2)*jitter;
   const y=cy+Math.sin(angle)*radius*.43+Math.sin(angle+Math.PI/2)*jitter*.46;
   const warm=hashUnit(`g:w:${arm}:${i}`)>.58;
   const alpha=(1-t)*.18+.025;
   const color=warm?`rgba(255,170,78,${alpha})`:`rgba(67,171,255,${alpha})`;
   drawParticle(x,y,hashUnit(`g:s:${arm}:${i}`)*1.8+.25,color);
  }
 }

 for(let i=0;i<1800;i++){
  const t=hashUnit(`dust:t:${i}`);
  const angle=t*8.4+hashUnit(`dust:a:${i}`)*Math.PI*2;
  const radius=150+t*870+(hashUnit(`dust:r:${i}`)-.5)*170;
  const x=cx+Math.cos(angle)*radius*1.08;
  const y=cy+Math.sin(angle)*radius*.40+(hashUnit(`dust:y:${i}`)-.5)*46;
  drawParticle(x,y,hashUnit(`dust:s:${i}`)*1.45+.20,`rgba(216,237,255,${.035+hashUnit(`dust:o:${i}`)*.09})`);
 }

 for(let i=0;i<140;i++){
  const t=hashUnit(`rock:t:${i}`);
  const angle=t*Math.PI*2;
  const radius=610+hashUnit(`rock:r:${i}`)*430;
  const x=cx+Math.cos(angle)*radius*1.08;
  const y=cy+Math.sin(angle)*radius*.43;
  const size=2.8+hashUnit(`rock:s:${i}`)*8;
  ctx.fillStyle=`rgba(0,3,8,${.42+hashUnit(`rock:o:${i}`)*.36})`;
  ctx.beginPath();
  for(let p=0;p<7;p++){
   const a=p/7*Math.PI*2;
   const rr=size*(.72+hashUnit(`rock:${i}:${p}`)*.55);
   const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr*.82;
   if(!p)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();ctx.fill();
 }

 ctx.save();ctx.translate(cx,cy);ctx.scale(1,.43);
 for(const [idx,colour] of ['rgba(255,184,92,.32)','rgba(74,177,255,.28)','rgba(255,255,255,.18)'].entries()){
  ctx.strokeStyle=colour;ctx.lineWidth=idx===0?2.6:1.4;
  for(let r=120+idx*40;r<890;r+=76){ctx.beginPath();ctx.ellipse(0,0,r,r,0,0,Math.PI*2);ctx.stroke()}
 }
 ctx.restore();

 const core=ctx.createRadialGradient(cx,cy,0,cx,cy,280);
 core.addColorStop(0,'rgba(255,246,212,.45)');
 core.addColorStop(.16,'rgba(255,186,82,.42)');
 core.addColorStop(.42,'rgba(255,120,55,.16)');
 core.addColorStop(1,'rgba(255,120,55,0)');
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,280,0,Math.PI*2);ctx.fill();

 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=4;
 return texture;
}

function galaxyArmPoints(count,prefix){
 const positions=new Float32Array(count*3);
 const colors=new Float32Array(count*3);
 const palette=[new THREE.Color('#2EC9FF'),new THREE.Color('#5EA8FF'),new THREE.Color('#FFB24D'),new THREE.Color('#B066FF'),new THREE.Color('#35EBC3')];
 for(let i=0;i<count;i++){
  const t=hashUnit(`${prefix}:t:${i}`);
  const arm=i%5;
  const angle=arm*Math.PI*2/5+t*6.2+(hashUnit(`${prefix}:a:${i}`)-.5)*.62;
  const radius=125+t*900+(hashUnit(`${prefix}:r:${i}`)-.5)*120;
  const thickness=(1-t)*70+20;
  const side=(hashUnit(`${prefix}:s:${i}`)-.5)*thickness;
  positions[i*3]=Math.cos(angle)*radius+Math.cos(angle+Math.PI/2)*side;
  positions[i*3+1]=Math.sin(angle)*radius*.43+Math.sin(angle+Math.PI/2)*side*.34;
  positions[i*3+2]=-720+(hashUnit(`${prefix}:z:${i}`)-.5)*210;
  const color=palette[(arm+(hashUnit(`${prefix}:c:${i}`)>.72?2:0))%palette.length].clone().lerp(new THREE.Color('#EAF6FF'),hashUnit(`${prefix}:l:${i}`)*.18);
  colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 const material=new THREE.PointsMaterial({size:4.2,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.76,depthWrite:false,blending:THREE.AdditiveBlending});
 const points=new THREE.Points(geometry,material);
 points.name='galaxyArmPoints';
 points.renderOrder=-48;
 return points;
}

function asteroidBelt(count){
 const positions=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const t=hashUnit(`belt:t:${i}`);
  const angle=t*Math.PI*2;
  const radius=760+hashUnit(`belt:r:${i}`)*540;
  positions[i*3]=Math.cos(angle)*radius*1.08;
  positions[i*3+1]=Math.sin(angle)*radius*.43+(hashUnit(`belt:y:${i}`)-.5)*70;
  positions[i*3+2]=-600+(hashUnit(`belt:z:${i}`)-.5)*260;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const material=new THREE.PointsMaterial({color:new THREE.Color('#02050A'),size:18,sizeAttenuation:true,transparent:true,opacity:.78,depthWrite:false,depthTest:false});
 const belt=new THREE.Points(geometry,material);
 belt.name='asteroidBelt';
 belt.renderOrder=-42;
 return belt;
}

// The reference asks for an actual galactic field, not a black canvas with a few
// polite specks. This replaces only the renderer background volume: node positions,
// hierarchy and graph geometry still come from the canonical layout module.
GraphLabRenderer.prototype.buildSpace=function(){
 if(this.renderer)this.renderer.setClearColor(new THREE.Color('#020813'),1);
 if(this.scene)this.scene.fog=new THREE.FogExp2(new THREE.Color('#020813'),.00024);
 this.space=new THREE.Group();

 const galaxy=new THREE.Sprite(new THREE.SpriteMaterial({
  map:this.texture('galaxy-disc-reference',galaxyTexture),
  transparent:true,
  depthWrite:false,
  depthTest:false,
  opacity:.96
 }));
 galaxy.name='galaxy-disc';
 galaxy.position.set(-20,0,-1800);
 galaxy.scale.set(4050,2280,1);
 galaxy.renderOrder=-60;
 this.space.add(galaxy);

 this.space.add(this.starShell(1400,1200,3900,'rgba(211,234,255,0.96)',.95,6.8,'reference-star'));
 this.space.add(this.starShell(850,720,3100,'rgba(114,190,255,0.70)',.62,4.6,'reference-dust'));
 this.space.add(galaxyArmPoints(4600,'reference-arm'));
 this.space.add(asteroidBelt(190));

 const clouds=[
  {color:'#175D9E',position:[-920,420,-1580],scale:[3600,1660],opacity:.64,rotation:-.18},
  {color:'#0B2D58',position:[980,-330,-2140],scale:[3800,1860],opacity:.58,rotation:.20},
  {color:'#1B6DBA',position:[300,740,-2380],scale:[2800,1240],opacity:.42,rotation:.46},
  {color:'#8E472D',position:[160,120,-1320],scale:[2300,1000],opacity:.28,rotation:-.38},
  {color:'#113B74',position:[-210,-760,-2260],scale:[3200,1100],opacity:.36,rotation:.08}
 ];
 for(const [index,cloudSpec] of clouds.entries()){
  const material=new THREE.SpriteMaterial({
   map:this.texture(`observatory-cloud:${index}:${cloudSpec.color}`,()=>cloudTexture(cloudSpec.color)),
   transparent:true,
   depthWrite:false,
   depthTest:false,
   blending:THREE.AdditiveBlending,
   opacity:cloudSpec.opacity,
   rotation:cloudSpec.rotation
  });
  const cloud=new THREE.Sprite(material);
  cloud.position.set(...cloudSpec.position);
  cloud.scale.set(cloudSpec.scale[0],cloudSpec.scale[1],1);
  cloud.renderOrder=-52+index;
  this.space.add(cloud);
 }
 this.scene.add(this.space);
};

GraphLabRenderer.prototype.curveFor=function(a,b){
 const from=new THREE.Vector3(a[0],a[1],a[2]);
 const to=new THREE.Vector3(b[0],b[1],b[2]);
 const mid=from.clone().add(to).multiplyScalar(.5);
 const axis=to.clone().sub(from);
 const radial=mid.lengthSq()>1e-6?mid.clone().normalize():to.clone().normalize();
 const normal=stablePerpendicular(axis,radial);
 const bend=axis.length()*this.options.filamentCurve;
 const control=mid.clone().addScaledVector(normal,bend).addScaledVector(radial,bend*.28);
 return new THREE.QuadraticBezierCurve3(from,control,to);
};

GraphLabRenderer.prototype.buildOrbitRings=function(){
 const radii=[...this.nodeObjects.values()]
  .filter(object=>object.node.hierarchyLevel==='domain')
  .map(object=>this.targetPositions?.get(object.node.id))
  .filter(Boolean)
  .map(position=>Math.hypot(...position))
  .filter(Boolean);
 if(!radii.length)return;
 const base=radii.reduce((total,value)=>total+value,0)/radii.length;
 const {color,alpha}=parseCssColor(this.palette.space.orbitRing);
 for(const [index,scale] of [.46,.7,1,1.28].entries()){
  const radius=base*scale;
  const normal=RING_NORMALS[index%RING_NORMALS.length];
  const reference=Math.abs(normal.y)<.88?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
  const u=new THREE.Vector3().crossVectors(normal,reference).normalize();
  const v=new THREE.Vector3().crossVectors(normal,u).normalize();
  const points=Array.from({length:129},(unused,step)=>{
   const angle=step/128*Math.PI*2;
   return u.clone().multiplyScalar(Math.cos(angle)*radius).addScaledVector(v,Math.sin(angle)*radius);
  });
  const ring=new THREE.LineLoop(
   new THREE.BufferGeometry().setFromPoints(points),
   new THREE.LineBasicMaterial({color:new THREE.Color(color),transparent:true,opacity:alpha*(index===2?1.35:.62),depthWrite:false})
  );
  this.ringGroup.add(ring);
 }
};
