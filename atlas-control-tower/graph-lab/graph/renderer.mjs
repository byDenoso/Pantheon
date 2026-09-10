import * as THREE from '../vendor/three.module.min.js';
import {layoutNodes,interpolatePosition,unitHash} from './layout.mjs';
import {getPalette,colorForNode,levelStyle,PRESETS} from './palette.mjs';
import {filamentStyle,pulsePhase} from './filaments.mjs';
import {placeLabels} from './labels.mjs';
import {pickNode} from './picking.mjs';

// Three.js draws the orbital system into a WebGL canvas; a second 2D canvas sits on
// top for labels, expansion badges and the focus ring, which stay crisp at any DPR.
// One requestAnimationFrame loop drives both.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAMERA_3D={yaw:.42,pitch:.34};
const LEVEL_CAPTION={root:'NÚCLEO',domain:'DOMÍNIO',program:'PROGRAM',campaign:'CAMPAIGN'};
const CAMERA_FLAT={yaw:0,pitch:.0001};

/** The palette states filament colours as rgba(); WebGL needs the hue and the alpha apart. */
export function parseCssColor(value){
 const rgba=/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(String(value||''));
 if(!rgba)return{color:String(value||'#ffffff'),alpha:1};
 const hex=`#${rgba.slice(1,4).map(part=>Math.round(Number(part)).toString(16).padStart(2,'0')).join('')}`;
 return{color:hex,alpha:rgba[4]==null?1:Number(rgba[4])};
}

/** Soft volumetric body: a radial gradient baked once per colour and reused as a sprite. */
function bodyTexture(color,{core=.16,soft=.52}={}){
 const size=128,canvas=document.createElement('canvas');
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 const gradient=ctx.createRadialGradient(size*.42,size*.38,0,size*.5,size*.5,size*.5);
 gradient.addColorStop(0,'rgba(255,255,255,0.96)');
 gradient.addColorStop(core,color);
 gradient.addColorStop(soft,`${color}b0`);
 gradient.addColorStop(1,`${color}00`);
 ctx.fillStyle=gradient;
 ctx.fillRect(0,0,size,size);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}

function haloTexture(color){
 const size=128,canvas=document.createElement('canvas');
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 const gradient=ctx.createRadialGradient(size*.5,size*.5,0,size*.5,size*.5,size*.5);
 gradient.addColorStop(0,`${color}52`);
 gradient.addColorStop(.34,`${color}22`);
 gradient.addColorStop(1,`${color}00`);
 ctx.fillStyle=gradient;
 ctx.fillRect(0,0,size,size);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}

export class GraphLabRenderer{
 constructor(container,{onSelect,onOpen,onStats,onHover}={}){
  this.container=container;
  this.callbacks={onSelect,onOpen,onStats,onHover};
  this.options={...PRESETS.ORIGINAL};
  this.palette=getPalette('A');
  this.source={rootId:null,nodes:[],edges:[]};
  this.focusId=null;this.selectedId=null;this.hoverId=null;
  this.positions=new Map();this.transition=null;
  this.points=[];this.labels=[];
  this.running=false;this.raf=0;this.lastFrame=0;this.lastStatsAt=0;this.frameSamples=[];
  this.textures=new Map();this.nodeObjects=new Map();this.edgeObjects=[];
  this.orbit={yaw:CAMERA_3D.yaw,pitch:CAMERA_3D.pitch,distance:1150,target:new THREE.Vector3()};
  this.cameraGoal=null;this.flat=false;this.destroyed=false;

  this.glCanvas=document.createElement('canvas');
  this.glCanvas.className='graph-gl';
  this.overlay=document.createElement('canvas');
  this.overlay.className='graph-overlay';
  this.overlay.tabIndex=0;
  container.replaceChildren(this.glCanvas,this.overlay);
  this.ctx=this.overlay.getContext('2d');

  this.ready=this.initThree();
  this.resize();
  if(typeof ResizeObserver==='function'){this.resizeObserver=new ResizeObserver(()=>{this.resize();this.invalidate()});this.resizeObserver.observe(container)}
  this.installEvents();
 }

 async initThree(){
  this.renderer=new THREE.WebGLRenderer({canvas:this.glCanvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setClearColor(new THREE.Color(this.options.background),1);
  this.scene=new THREE.Scene();
  this.scene.fog=new THREE.FogExp2(new THREE.Color(this.options.background),.00055);
  this.camera=new THREE.PerspectiveCamera(46,1,1,9000);
  this.nodeGroup=new THREE.Group();
  this.edgeGroup=new THREE.Group();
  this.pulseGroup=new THREE.Group();
  this.scene.add(this.edgeGroup,this.nodeGroup,this.pulseGroup);
  this.buildStars();
  this.applyCamera();
  return this.renderer;
 }

 buildStars(){
  const count=520,positions=new Float32Array(count*3);
  for(let i=0;i<count;i++){
   const seed=unitHash(`star:${i}`),theta=seed*Math.PI*2,phi=Math.acos(2*unitHash(`starp:${i}`)-1),radius=2400+unitHash(`starr:${i}`)*2600;
   positions[i*3]=Math.sin(phi)*Math.cos(theta)*radius;
   positions[i*3+1]=Math.sin(phi)*Math.sin(theta)*radius;
   positions[i*3+2]=Math.cos(phi)*radius;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const star=parseCssColor(this.palette.background.stars);
  this.stars=new THREE.Points(geometry,new THREE.PointsMaterial({color:new THREE.Color(star.color),size:5,sizeAttenuation:true,transparent:true,opacity:star.alpha*.55,depthWrite:false}));
  this.scene.add(this.stars);
 }

 texture(key,factory){if(!this.textures.has(key))this.textures.set(key,factory());return this.textures.get(key)}

 // --- graph ---------------------------------------------------------------

 setGraph(source,{focusId=this.focusId,fit=false}={}){
  const previous=new Map(this.positions);
  this.source=source;
  this.focusId=focusId||source.rootId;
  const target=layoutNodes(source.nodes,this.focusId,{baseRadius:250,ringGap:132,depthScale:150});
  const start=new Map();
  for(const node of source.nodes){
   if(previous.has(node.id)){start.set(node.id,[...previous.get(node.id)]);continue}
   // A node that has just been opened grows out of its parent instead of popping in.
   const anchor=previous.get(node.parentId)||target.get(node.parentId)||[0,0,0];
   start.set(node.id,[anchor[0],anchor[1],anchor[2]]);
  }
  this.positions=start;
  this.targetPositions=target;
  this.transition={start,target,at:(globalThis.performance?.now?.()||Date.now()),duration:this.options.transitionMs||420};
  if(this.selectedId&&!source.nodes.some(n=>n.id===this.selectedId))this.selectedId=null;
  this.rebuildScene();
  if(fit)this.fit();else this.ensureInFrame(target);
  this.invalidate();
  this.emitStats();
 }

 rebuildScene(){
  if(!this.scene)return;
  for(const object of this.nodeObjects.values())this.nodeGroup.remove(object.group);
  this.nodeObjects.clear();
  for(const line of this.edgeObjects)this.edgeGroup.remove(line.object);
  this.edgeObjects=[];
  this.pulseGroup.clear();

  for(const node of this.source.nodes){
   const color=colorForNode(node,this.palette);
   const style=levelStyle(node);
   const group=new THREE.Group();
   const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture(`halo:${color}`,()=>haloTexture(color)),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));
   const body=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture(`body:${color}`,()=>bodyTexture(color)),transparent:true,depthWrite:false}));
   group.add(halo,body);
   this.nodeGroup.add(group);
   this.nodeObjects.set(node.id,{group,halo,body,node,color,style});
  }

  for(const edge of this.source.edges){
   const {color,alpha}=parseCssColor(filamentStyle(edge,this.palette).stroke);
   const geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:26},()=>new THREE.Vector3()));
   const material=new THREE.LineBasicMaterial({color:new THREE.Color(color),transparent:true,opacity:alpha,depthWrite:false});
   const object=new THREE.Line(geometry,material);
   this.edgeGroup.add(object);
   this.edgeObjects.push({edge,object,geometry,material,baseOpacity:alpha});
  }

  const pulseColor=this.palette.filaments.pulse;
  this.pulse=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture(`pulse:${pulseColor}`,()=>bodyTexture(pulseColor,{core:.1,soft:.4})),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  this.pulse.scale.set(16,16,1);
  this.pulse.visible=false;
  this.pulseGroup.add(this.pulse);
 }

 // --- camera --------------------------------------------------------------

 applyCamera(){
  if(!this.camera)return;
  const {yaw,pitch,distance,target}=this.orbit;
  this.camera.position.set(
   target.x+Math.sin(yaw)*Math.cos(pitch)*distance,
   target.y+Math.sin(pitch)*distance,
   target.z+Math.cos(yaw)*Math.cos(pitch)*distance
  );
  this.camera.lookAt(target);
  this.camera.updateMatrixWorld();
 }

 zoom(factor){this.orbit.distance=clamp(this.orbit.distance/factor,180,4200);this.invalidate()}

 // How far back the camera must sit to hold a sphere of this radius, in the
 // narrower of the two axes — a phone is tall, so width is what usually binds.
 distanceFor(reach){
  const half=Math.tan(THREE.MathUtils.degToRad(this.camera?.fov||46)/2);
  const aspect=Math.max(.25,this.camera?.aspect||1);
  return clamp(Math.max(reach/half,reach/(half*aspect))*1.2,220,4200);
 }

 // Opening a branch must never push its new bodies off screen: widen the shot just
 // enough to hold them, without recentring and losing the reader's orientation.
 ensureInFrame(positions){
  const points=[...positions.values()];
  if(!points.length)return;
  const {x,y,z}=this.orbit.target;
  const reach=Math.max(...points.map(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)));
  const needed=this.distanceFor(reach);
  if(needed>this.orbit.distance)this.orbit.distance=needed;
 }

 fit(){
  const points=[...this.targetPositions?.values?.()||[]];
  if(!points.length)return;
  const reach=Math.max(...points.map(p=>Math.hypot(p[0],p[1],p[2])),240);
  this.orbit.target.set(0,0,0);
  this.orbit.distance=this.distanceFor(reach);
  this.invalidate();
 }

 reset(){this.orbit.yaw=CAMERA_3D.yaw;this.orbit.pitch=CAMERA_3D.pitch;this.flat=false;this.fit()}

 toggleFlat(){
  this.flat=!this.flat;
  const goal=this.flat?CAMERA_FLAT:CAMERA_3D;
  this.orbit.yaw=goal.yaw;this.orbit.pitch=goal.pitch;
  this.invalidate();
  return this.flat;
 }

 centerSelected(){this.focusNode(this.selectedId)}

 // Aim between the core and the node rather than jumping onto it: the NEXO stays
 // in frame, so the map never loses its centre while a branch is being read.
 focusNode(id){
  const position=this.positions.get(id);
  if(!position)return;
  const point=new THREE.Vector3(position[0],position[1],position[2]);
  this.orbit.target.copy(point).multiplyScalar(.55);
  this.orbit.distance=this.distanceFor(Math.max(point.length()*.75,220));
  this.invalidate();
 }

 setPreset(name){
  this.options={...(PRESETS[name]||PRESETS.ORIGINAL),renderer:'three-canvas',palette:'A'};
  this.palette=getPalette(this.options.palette);
  this.renderer?.setClearColor(new THREE.Color(this.options.background),1);
  if(this.scene?.fog)this.scene.fog.color=new THREE.Color(this.options.background);
  this.invalidate();
  return this.options;
 }

 setOptions(partial){Object.assign(this.options,partial);if(this.scene?.fog)this.scene.fog.density=.00028+this.options.fog*.0009;this.invalidate()}

 setSelected(id){this.selectedId=id;this.invalidate()}

 // --- interaction ---------------------------------------------------------

 installEvents(){
  const surface=this.overlay;
  this.pointers=new Map();
  this.drag=null;
  this.pinchDistance=0;
  surface.addEventListener('contextmenu',e=>e.preventDefault());
  surface.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.0012))},{passive:false});
  surface.addEventListener('pointerdown',e=>{
   surface.setPointerCapture?.(e.pointerId);
   this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
   this.drag={x:e.offsetX,y:e.offsetY,moved:0,button:e.button};
   this.pinchDistance=this.measurePinch();
  });
  surface.addEventListener('pointermove',e=>{
   const previous=this.pointers.get(e.pointerId);
   if(!previous){
    const hit=pickNode(this.points,e.offsetX,e.offsetY);
    const next=hit?.node.id||null;
    if(next!==this.hoverId){this.hoverId=next;surface.style.cursor=next?'pointer':'grab';this.callbacks.onHover?.(hit?.node||null);this.invalidate()}
    return;
   }
   const dx=e.offsetX-previous.x,dy=e.offsetY-previous.y;
   this.pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
   if(this.drag)this.drag.moved+=Math.abs(dx)+Math.abs(dy);
   if(this.pointers.size===2){
    const distance=this.measurePinch();
    if(this.pinchDistance)this.zoom(distance/this.pinchDistance);
    this.pinchDistance=distance;
   }else if(e.shiftKey||this.drag?.button===2){
    this.pan(dx,dy);
   }else{
    this.orbit.yaw-=dx*.005;
    this.orbit.pitch=clamp(this.orbit.pitch+dy*.005,-1.35,1.35);
    this.flat=false;
   }
   this.invalidate();
  });
  const finish=e=>{
   this.pointers.delete(e.pointerId);
   this.pinchDistance=this.measurePinch();
   if(this.drag&&this.drag.moved<7){
    const hit=pickNode(this.points,e.offsetX,e.offsetY);
    this.selectedId=hit?.node.id||null;
    this.callbacks.onSelect?.(hit?.node||null);
    this.invalidate();
   }
   this.drag=null;
  };
  surface.addEventListener('pointerup',finish);
  surface.addEventListener('pointercancel',finish);
  surface.addEventListener('dblclick',e=>{const hit=pickNode(this.points,e.offsetX,e.offsetY);if(hit)this.callbacks.onOpen?.(hit.node)});
  surface.addEventListener('keydown',e=>{
   if(e.key==='ArrowLeft')this.orbit.yaw-=.12;
   else if(e.key==='ArrowRight')this.orbit.yaw+=.12;
   else if(e.key==='ArrowUp')this.orbit.pitch=clamp(this.orbit.pitch+.1,-1.35,1.35);
   else if(e.key==='ArrowDown')this.orbit.pitch=clamp(this.orbit.pitch-.1,-1.35,1.35);
   else if(e.key==='+'||e.key==='=')this.zoom(1.14);
   else if(e.key==='-')this.zoom(.88);
   else return;
   e.preventDefault();this.invalidate();
  });
 }

 measurePinch(){const p=[...this.pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0}

 pan(dx,dy){
  if(!this.camera)return;
  const scale=this.orbit.distance*.0016;
  const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
  this.orbit.target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);
 }

 // --- loop ----------------------------------------------------------------

 start(){this.running=true;this.invalidate()}
 stop(){this.running=false;if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
 destroy(){
  this.destroyed=true;this.stop();this.resizeObserver?.disconnect();
  for(const texture of this.textures.values())texture.dispose();
  this.renderer?.dispose();this.container.replaceChildren();
 }

 invalidate(){
  if(this.destroyed||this.raf)return;
  this.raf=requestAnimationFrame(now=>{this.raf=0;this.draw(now);if(this.running)this.invalidate()});
 }

 resize(){
  const rect=this.container.getBoundingClientRect();
  const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
  const dpr=Math.min(devicePixelRatio||1,2);
  this.width=width;this.height=height;this.dpr=dpr;
  this.overlay.width=Math.round(width*dpr);this.overlay.height=Math.round(height*dpr);
  this.overlay.style.width=`${width}px`;this.overlay.style.height=`${height}px`;
  this.ctx.setTransform(dpr,0,0,dpr,0,0);
  if(this.renderer){this.renderer.setPixelRatio(dpr);this.renderer.setSize(width,height,false)}
  if(this.camera){this.camera.aspect=width/height;this.camera.updateProjectionMatrix()}
 }

 advanceTransition(now){
  if(!this.transition)return;
  const t=(now-this.transition.at)/this.transition.duration;
  if(t>=1){this.positions=new Map([...this.transition.target].map(([id,p])=>[id,[...p]]));this.transition=null;return}
  const next=new Map();
  for(const [id,target] of this.transition.target)next.set(id,interpolatePosition(this.transition.start.get(id)||target,target,t));
  this.positions=next;
 }

 draw(now){
  if(!this.renderer||!this.scene)return;
  const started=globalThis.performance?.now?.()||now;
  this.advanceTransition(now);
  const still=reducedMotion();
  if(this.options.autoOrbit&&!still&&!this.flat)this.orbit.yaw+=.0011;
  this.applyCamera();
  this.syncObjects(now,still);
  this.renderer.render(this.scene,this.camera);
  this.projectPoints();
  this.drawOverlay();
  const frameMs=(globalThis.performance?.now?.()||now)-started;
  this.frameSamples.push(frameMs);
  if(this.frameSamples.length>45)this.frameSamples.shift();
  this.emitStats(now);
 }

 syncObjects(now,still){
  const active=this.selectedId||this.hoverId;
  for(const [id,object] of this.nodeObjects){
   const position=this.positions.get(id)||[0,0,0];
   object.group.position.set(position[0],position[1],position[2]);
   const emphasis=id===active?1.24:id===this.focusId?1.1:1;
   const radius=object.style.radius*this.options.nodeRadius*emphasis;
   object.body.scale.set(radius*2,radius*2,1);
   object.halo.scale.set(radius*2*object.style.halo*this.options.glow,radius*2*object.style.halo*this.options.glow,1);
   const dim=active&&id!==active&&!this.isNeighbour(id,active);
   object.body.material.opacity=dim?.34:1;
   object.halo.material.opacity=dim?.16:.9;
  }
  for(const item of this.edgeObjects){
   const a=this.positions.get(item.edge.source),b=this.positions.get(item.edge.target);
   if(!a||!b){item.object.visible=false;continue}
   item.object.visible=true;
   const curve=this.curveFor(a,b);
   item.geometry.setFromPoints(curve.getPoints(25));
   item.geometry.attributes.position.needsUpdate=true;
   const live=active&&(item.edge.source===active||item.edge.target===active);
   item.material.opacity=live?.85:active?.14:item.baseOpacity;
   item.curve=curve;
   item.live=live;
  }
  const lead=this.edgeObjects.find(item=>item.live&&item.curve);
  if(this.pulse){
   if(lead&&!still&&this.options.pulseSpeed>0){
    const phase=pulsePhase(lead.edge.id||`${lead.edge.source}:${lead.edge.target}`,now,.3*this.options.pulseSpeed);
    const point=lead.curve.getPoint(phase.t);
    this.pulse.position.copy(point);
    this.pulse.visible=true;
   }else this.pulse.visible=false;
  }
 }

 curveFor(a,b){
  const from=new THREE.Vector3(a[0],a[1],a[2]);
  const to=new THREE.Vector3(b[0],b[1],b[2]);
  const mid=from.clone().add(to).multiplyScalar(.5);
  const axis=to.clone().sub(from);
  const normal=axis.clone().cross(new THREE.Vector3(0,0,1));
  if(normal.lengthSq()<1e-6)normal.set(1,0,0);
  normal.normalize().multiplyScalar(axis.length()*this.options.filamentCurve);
  return new THREE.QuadraticBezierCurve3(from,mid.add(normal),to);
 }

 isNeighbour(id,active){return this.source.edges.some(e=>(e.source===active&&e.target===id)||(e.target===active&&e.source===id))}

 projectPoints(){
  const vector=new THREE.Vector3();
  const halfHeight=Math.tan(THREE.MathUtils.degToRad(this.camera.fov)/2);
  this.points=[];
  for(const node of this.source.nodes){
   const position=this.positions.get(node.id);
   if(!position)continue;
   vector.set(position[0],position[1],position[2]);
   const distance=this.camera.position.distanceTo(vector);
   vector.project(this.camera);
   if(vector.z>1)continue;
   const style=levelStyle(node);
   const radius=style.radius*this.options.nodeRadius*(this.height/2)/Math.max(1,distance*halfHeight);
   this.points.push({node,x:(vector.x*.5+.5)*this.width,y:(-vector.y*.5+.5)*this.height,r:Math.max(4,radius),z:-distance});
  }
 }

 labelCandidates(){
  const active=new Set([this.selectedId,this.hoverId,this.focusId].filter(Boolean));
  const compact=this.points.length<=28;
  return this.points.filter(point=>{
   const level=point.node.hierarchyLevel;
   if(active.has(point.node.id))return true;
   if(level==='root'||level==='domain')return true;
   if(level==='program')return true;
   return compact||active.has(point.node.parentId);
  });
 }

 drawOverlay(){
  const c=this.ctx,w=this.width,h=this.height,p=this.palette;
  c.clearRect(0,0,w,h);
  this.drawFocusRings(c,p);
  this.drawBadges(c,p);
  this.drawLabels(c,p,w,h);
 }

 drawFocusRings(c,p){
  for(const point of this.points){
   const isSelected=point.node.id===this.selectedId;
   const isHover=point.node.id===this.hoverId;
   if(!isSelected&&!isHover)continue;
   c.save();
   c.strokeStyle=isSelected?p.chrome.accent:p.labels.border;
   c.globalAlpha=isSelected?.9:.5;
   c.lineWidth=isSelected?1.6:1;
   c.beginPath();c.arc(point.x,point.y,point.r+9,0,Math.PI*2);c.stroke();
   if(isSelected){
    c.globalAlpha=.35;
    c.beginPath();c.arc(point.x,point.y,point.r+16,0,Math.PI*2);c.stroke();
   }
   c.restore();
  }
 }

 // A collapsed body carries the weight of what a click would open.
 drawBadges(c,p){
  for(const point of this.points){
   const hidden=point.node.hiddenChildren||0;
   if(!hidden||point.node.expanded)continue;
   const text=`+${hidden}`;
   c.font='700 9px Inter,system-ui,sans-serif';
   const width=c.measureText(text).width+12;
   const x=point.x+point.r*.72,y=point.y-point.r*.72-14;
   c.fillStyle=p.labels.bg;c.strokeStyle=p.labels.border;c.lineWidth=1;
   c.beginPath();
   if(c.roundRect){c.roundRect(x,y,width,15,7.5);c.fill();c.stroke()}
   else{c.fillRect(x,y,width,15);c.strokeRect(x,y,width,15)}
   c.fillStyle=p.chrome.textDim;
   c.fillText(text,x+6,y+11);
  }
 }

 // Labels must not slide under the HUD surfaces, so the overlays on the stage
 // declare themselves with data-label-reserved and are measured every frame.
 reservedBoxes(){
  const host=this.container.closest('.stage')||this.container.parentElement;
  const overlays=host?.querySelectorAll?.('[data-label-reserved]');
  if(!overlays?.length)return[];
  const origin=this.container.getBoundingClientRect();
  const boxes=[];
  for(const element of overlays){
   const rect=element.getBoundingClientRect();
   if(!rect.width||!rect.height)continue;
   boxes.push({x:rect.left-origin.left-6,y:rect.top-origin.top-6,w:rect.width+12,h:rect.height+12});
  }
  return boxes;
 }

 drawLabels(c,p,w,h){
  const reserved=this.reservedBoxes();
  this.labels=placeLabels(this.labelCandidates(),{
   width:w,height:h,focusId:this.focusId,selectedId:this.selectedId,hoverId:this.hoverId,
   maxLabels:this.options.maxLabels,reserved
  });
  for(const label of this.labels){
   const node=label.point.node;
   const selected=node.id===this.selectedId;
   const color=colorForNode(node,this.palette);
   c.fillStyle=selected?p.labels.selectedBg:p.labels.bg;
   c.strokeStyle=selected?p.labels.selectedBorder:p.labels.border;
   c.lineWidth=1;
   c.beginPath();
   if(c.roundRect){c.roundRect(label.x,label.y,label.w,label.h,8);c.fill();c.stroke()}
   else{c.fillRect(label.x,label.y,label.w,label.h);c.strokeRect(label.x,label.y,label.w,label.h)}
   c.fillStyle=color;
   c.fillRect(label.x,label.y+6,2,label.h-12);
   c.textAlign='left';
   c.fillStyle=p.labels.text;
   c.font='650 11px Inter,system-ui,sans-serif';
   c.fillText(this.clip(c,label.label,label.w-20),label.x+10,label.y+14);
   c.fillStyle=p.chrome.textMuted;
   c.font='700 8px Inter,system-ui,sans-serif';
   c.fillText(LEVEL_CAPTION[node.hierarchyLevel]||String(node.type||'').toUpperCase(),label.x+10,label.y+25);
  }
 }

 clip(c,text,maxWidth){
  if(c.measureText(text).width<=maxWidth)return text;
  let value=text;
  while(value.length>4&&c.measureText(`${value}…`).width>maxWidth)value=value.slice(0,-1);
  return`${value}…`;
 }

 emitStats(now=globalThis.performance?.now?.()||Date.now()){
  if(now-this.lastStatsAt<220)return;
  this.lastStatsAt=now;
  const average=this.frameSamples.reduce((a,b)=>a+b,0)/Math.max(1,this.frameSamples.length);
  this.callbacks.onStats?.({
   fps:average?Math.min(120,1000/average):0,frameMs:average,
   nodes:this.source.nodes.length,edges:this.source.edges.length,
   labels:this.labels.length,dpr:this.dpr||1
  });
 }
}
