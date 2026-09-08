import {layoutNodes} from '../graph-lab/graph/layout.mjs';
import {filamentControl} from '../graph-lab/graph/filaments.mjs';

const structural=n=>['SYSTEM','DOMAIN','CAMPAIGN'].includes(n?.type);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

function color3(hex){return BABYLON.Color3.FromHexString(hex)}
function radiusFor(node){return node.id==='system:NEXO'?22:node.type==='SYSTEM'?15:node.type==='DOMAIN'?10:node.type==='CAMPAIGN'?7.5:node.type==='CLAIM'?5.5:node.type==='TEST'?4.7:3.8}
function semanticPriority(node,focusId,selectedId){if(node.id===focusId)return 100;if(node.id===selectedId)return 95;return{SYSTEM:80,DOMAIN:65,CAMPAIGN:55,CLAIM:42,TEST:38,RESULT:30}[node.type]||20}

function quadratic3(a,b,curve=.18,samples=28,sign=1){
 const cp2=filamentControl({x:a.x,y:a.y},{x:b.x,y:b.y},curve,sign);
 const cz=(a.z+b.z)/2+Math.hypot(b.x-a.x,b.y-a.y)*curve*.35*sign;
 const cp=new BABYLON.Vector3(cp2.cx,cp2.cy,cz);
 const out=[];
 for(let i=0;i<=samples;i++){
  const t=i/samples,u=1-t;
  out.push(new BABYLON.Vector3(u*u*a.x+2*u*t*cp.x+t*t*b.x,u*u*a.y+2*u*t*cp.y+t*t*b.y,u*u*a.z+2*u*t*cp.z+t*t*b.z));
 }
 return out;
}

export class BabylonGraphLab{
 constructor(canvas,labelsLayer,{palette,onSelect,onOpen,onStats}={}){
  this.canvas=canvas;this.labelsLayer=labelsLayer;this.palette=palette;this.callbacks={onSelect,onOpen,onStats};
  this.options={glow:.82,pulseSpeed:1,maxLabels:22,maxVisibleNodes:120,autoOrbit:false};
  this.graph={nodes:[],edges:[]};this.focusId='system:NEXO';this.selectedId=null;this.nodeMeshes=new Map();this.edgeMeshes=[];this.pulses=[];this.labels=[];this.running=false;this.lastStats=0;this.lastFrame=performance.now();
  this.engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,antialias:true,adaptToDeviceRatio:true});
  this.scene=new BABYLON.Scene(this.engine);this.scene.clearColor=BABYLON.Color4.FromHexString('#030507ff');
  this.camera=new BABYLON.ArcRotateCamera('atlas-camera',-Math.PI/2.25,Math.PI/2.55,720,BABYLON.Vector3.Zero(),this.scene);
  this.camera.lowerRadiusLimit=110;this.camera.upperRadiusLimit=1900;this.camera.wheelPrecision=22;this.camera.panningSensibility=1200;this.camera.pinchPrecision=65;this.camera.attachControl(canvas,true);
  const hemi=new BABYLON.HemisphericLight('hemi',new BABYLON.Vector3(0,1,0),this.scene);hemi.intensity=.48;hemi.diffuse=new BABYLON.Color3(.67,.72,.78);hemi.groundColor=new BABYLON.Color3(.03,.04,.05);
  const key=new BABYLON.PointLight('key',new BABYLON.Vector3(0,260,-260),this.scene);key.intensity=1.25;key.diffuse=color3('#E8C982');
  this.glow=new BABYLON.GlowLayer('atlas-glow',this.scene,{blurKernelSize:32});this.glow.intensity=this.options.glow;
  this.createStars();this.installPicking();this.engine.onResizeObservable.add(()=>this.updateLabels());
 }
 createStars(){
  const mat=new BABYLON.StandardMaterial('star-mat',this.scene);mat.emissiveColor=color3('#B9C2CC');mat.disableLighting=true;
  const proto=BABYLON.MeshBuilder.CreateSphere('star-proto',{diameter:1.15,segments:4},this.scene);proto.material=mat;proto.isVisible=false;
  for(let i=0;i<180;i++){
   const s=proto.createInstance(`star-${i}`),r=900+(i%7)*85,theta=i*2.3999632297,phi=Math.acos(1-2*((i*.6180339887)%1));
   s.position.set(Math.sin(phi)*Math.cos(theta)*r,Math.cos(phi)*r*.7,Math.sin(phi)*Math.sin(theta)*r);s.scaling.scaleInPlace(i%17===0?2.4:i%5===0?1.5:.9);
  }
 }
 installPicking(){
  let lastClick=0,lastNode=null;
  this.scene.onPointerObservable.add(info=>{
   if(info.type!==BABYLON.PointerEventTypes.POINTERPICK)return;
   const mesh=info.pickInfo?.pickedMesh,node=mesh?.metadata?.node;if(!node)return;
   this.select(node.id);this.callbacks.onSelect?.(node);
   const now=performance.now();if(lastNode===node.id&&now-lastClick<360&&structural(node))this.callbacks.onOpen?.(node);lastNode=node.id;lastClick=now;
  });
 }
 setOptions(partial){Object.assign(this.options,partial);this.glow.intensity=this.options.glow}
 setGraph(graph,{focusId=this.focusId}={}){this.graph=graph;this.focusId=focusId;this.rebuildScene()}
 rebuildScene(){
  for(const mesh of this.nodeMeshes.values())mesh.dispose();this.nodeMeshes.clear();
  for(const mesh of this.edgeMeshes)mesh.dispose();this.edgeMeshes=[];
  for(const p of this.pulses)p.mesh.dispose();this.pulses=[];
  this.clearLabels();
  const positions=layoutNodes(this.graph.nodes,this.focusId,{baseRadius:230,ringGap:105,depthScale:135});
  for(const node of this.graph.nodes){
   const p=positions.get(node.id)||[0,0,0],mesh=BABYLON.MeshBuilder.CreateSphere(`node:${node.id}`,{diameter:radiusFor(node)*2,segments:node.type==='SYSTEM'?24:16},this.scene);
   mesh.position.set(p[0],-p[1],p[2]);mesh.metadata={node};
   const hex=this.palette.SYSTEM_COLORS[node.id]||this.palette.SYSTEM_COLORS[`system:${node.system}`]||this.palette.STATUS_COLORS[node.status]||'#B8C4D0';
   const mat=new BABYLON.StandardMaterial(`mat:${node.id}`,this.scene),col=color3(hex);mat.diffuseColor=col.scale(.34);mat.emissiveColor=col.scale(node.type==='SYSTEM'?.52:.27);mat.specularColor=new BABYLON.Color3(.72,.72,.68);mat.specularPower=64;mesh.material=mat;
   if(node.id===this.focusId){const ring=BABYLON.MeshBuilder.CreateTorus(`ring:${node.id}`,{diameter:radiusFor(node)*3.7,thickness:.55,tessellation:72},this.scene);ring.parent=mesh;ring.rotation.x=Math.PI/2.8;const rm=new BABYLON.StandardMaterial(`ringmat:${node.id}`,this.scene);rm.emissiveColor=col.scale(.55);rm.alpha=.48;rm.disableLighting=true;ring.material=rm}
   this.nodeMeshes.set(node.id,mesh);
  }
  const byId=this.nodeMeshes;
  for(const edge of this.graph.edges){
   const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
   const path=quadratic3(a.position,b.position,edge.kind==='cross-domain'?.26:.17,28,edge.source<edge.target?1:-1);
   const tube=BABYLON.MeshBuilder.CreateTube(`edge:${edge.id}`,{path,radius:edge.kind==='cross-domain'?.58:.42,tessellation:6,cap:BABYLON.Mesh.CAP_ALL},this.scene);
   const mat=new BABYLON.StandardMaterial(`edge-mat:${edge.id}`,this.scene);const hex=edge.kind==='cross-domain'?'#788B82':edge.authority==='derived'?'#6D6877':'#556676';mat.emissiveColor=color3(hex).scale(.55);mat.diffuseColor=color3(hex).scale(.14);mat.alpha=edge.kind==='cross-domain'?.48:.38;mat.disableLighting=true;tube.material=mat;this.edgeMeshes.push(tube);
   const pulse=BABYLON.MeshBuilder.CreateSphere(`pulse:${edge.id}`,{diameter:edge.kind==='cross-domain'?2.8:2.25,segments:8},this.scene),pm=new BABYLON.StandardMaterial(`pulse-mat:${edge.id}`,this.scene);pm.emissiveColor=color3('#E8C982');pm.disableLighting=true;pulse.material=pm;this.pulses.push({mesh:pulse,path,phase:(edge.id.length%17)/17,speed:.055+(edge.id.length%7)*.004});
  }
  this.buildLabels();this.fit();
 }
 buildLabels(){
  const ranked=[...this.graph.nodes].sort((a,b)=>semanticPriority(b,this.focusId,this.selectedId)-semanticPriority(a,this.focusId,this.selectedId)).slice(0,this.options.maxLabels);
  for(const node of ranked){const el=document.createElement('div');el.className=`node-label ${node.type==='SYSTEM'?'system':''}`;el.textContent=node.label;el.dataset.id=node.id;this.labelsLayer.appendChild(el);this.labels.push({node,el})}
  this.updateLabels();
 }
 clearLabels(){for(const l of this.labels)l.el.remove();this.labels=[]}
 select(id){this.selectedId=id;for(const [nodeId,mesh] of this.nodeMeshes){const base=nodeId===id?1.16:1;mesh.scaling.setAll(base)}this.buildLabelsAfterSelection()}
 buildLabelsAfterSelection(){this.clearLabels();this.buildLabels()}
 zoom(factor){this.camera.radius=clamp(this.camera.radius*factor,this.camera.lowerRadiusLimit,this.camera.upperRadiusLimit)}
 fit(){if(!this.graph.nodes.length)return;const r=this.graph.nodes.length>180?1050:this.graph.nodes.length>80?830:660;this.camera.radius=r;this.camera.target=BABYLON.Vector3.Zero()}
 centerSelected(){const mesh=this.nodeMeshes.get(this.selectedId);if(mesh)this.camera.setTarget(mesh.position.clone())}
 updateLabels(){
  if(!this.labels.length)return;const transform=this.scene.getTransformMatrix(),viewport=this.camera.viewport.toGlobal(this.engine.getRenderWidth(),this.engine.getRenderHeight()),rw=this.engine.getRenderWidth()/this.engine.getHardwareScalingLevel(),rh=this.engine.getRenderHeight()/this.engine.getHardwareScalingLevel();
  for(const item of this.labels){const mesh=this.nodeMeshes.get(item.node.id);if(!mesh){item.el.style.display='none';continue}const p=BABYLON.Vector3.Project(mesh.getAbsolutePosition(),BABYLON.Matrix.Identity(),transform,viewport),visible=p.z>0&&p.z<1&&p.x>=0&&p.x<=rw&&p.y>=0&&p.y<=rh;item.el.style.display=visible?'block':'none';if(visible){item.el.style.left=`${p.x}px`;item.el.style.top=`${p.y-radiusFor(item.node)-10}px`}}
 }
 start(){if(this.running)return;this.running=true;this.engine.runRenderLoop(()=>this.frame())}
 stop(){this.running=false;this.engine.stopRenderLoop()}
 frame(){
  if(!this.running)return;const now=performance.now(),dt=Math.min(80,now-this.lastFrame);this.lastFrame=now;
  if(this.options.autoOrbit&&!reducedMotion())this.camera.alpha+=dt*.00012;
  if(!reducedMotion()&&this.options.pulseSpeed>0){for(const p of this.pulses){p.phase=(p.phase+dt*.001*p.speed*this.options.pulseSpeed)%1;const idx=p.phase*(p.path.length-1),lo=Math.floor(idx),hi=Math.min(p.path.length-1,lo+1),t=idx-lo;p.mesh.position=BABYLON.Vector3.Lerp(p.path[lo],p.path[hi],t)}}
  this.scene.render();this.updateLabels();
  if(now-this.lastStats>250){this.lastStats=now;const fps=this.engine.getFps(),frameMs=fps?1000/fps:0,visible=this.labels.filter(l=>l.el.style.display!=='none').length;this.callbacks.onStats?.({fps,frameMs,nodes:this.graph.nodes.length,edges:this.graph.edges.length,labels:visible})}
 }
}
