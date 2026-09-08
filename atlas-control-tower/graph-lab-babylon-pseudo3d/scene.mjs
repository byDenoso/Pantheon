import {layoutNodes} from '../graph-lab/graph/layout.mjs';
import {filamentControl} from '../graph-lab/graph/filaments.mjs';

const structural=n=>['SYSTEM','DOMAIN','CAMPAIGN'].includes(n?.type);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function color3(hex){return BABYLON.Color3.FromHexString(hex)}
function radiusFor(node){return node.id==='system:NEXO'?22:node.type==='SYSTEM'?15:node.type==='DOMAIN'?10:node.type==='CAMPAIGN'?7.5:node.type==='CLAIM'?5.5:node.type==='TEST'?4.7:3.8}
function semanticPriority(node,focusId,selectedId){if(node.id===focusId)return 100;if(node.id===selectedId)return 95;return{SYSTEM:80,DOMAIN:65,CAMPAIGN:55,CLAIM:42,TEST:38,RESULT:30}[node.type]||20}

function quadraticShallow(a,b,curve=.18,samples=30,sign=1){
 const cp2=filamentControl({x:a.x,y:a.y},{x:b.x,y:b.y},curve,sign);
 const span=Math.hypot(b.x-a.x,b.y-a.y);
 const cp=new BABYLON.Vector3(cp2.cx,cp2.cy,(a.z+b.z)/2+span*curve*.055*sign);
 const out=[];
 for(let i=0;i<=samples;i++){
  const t=i/samples,u=1-t;
  out.push(new BABYLON.Vector3(u*u*a.x+2*u*t*cp.x+t*t*b.x,u*u*a.y+2*u*t*cp.y+t*t*b.y,u*u*a.z+2*u*t*cp.z+t*t*b.z));
 }
 return out;
}

export class BabylonPseudo3DGraphLab{
 constructor(canvas,labelsLayer,{palette,onSelect,onOpen,onStats}={}){
  this.canvas=canvas;this.labelsLayer=labelsLayer;this.palette=palette;this.callbacks={onSelect,onOpen,onStats};
  this.options={depthScale:.18,glow:.68,pulseSpeed:1,maxLabels:24,maxVisibleNodes:120,autoOrbit:false};
  this.graph={nodes:[],edges:[]};this.focusId='system:NEXO';this.selectedId=null;this.nodeMeshes=new Map();this.edgeMeshes=[];this.pulses=[];this.labels=[];this.running=false;this.lastStats=0;this.lastFrame=performance.now();
  this.engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,antialias:true,adaptToDeviceRatio:true});
  this.scene=new BABYLON.Scene(this.engine);this.scene.clearColor=BABYLON.Color4.FromHexString('#030507ff');
  this.scene.fogMode=BABYLON.Scene.FOGMODE_LINEAR;this.scene.fogColor=color3('#030507');this.scene.fogStart=760;this.scene.fogEnd=1450;
  this.camera=new BABYLON.ArcRotateCamera('atlas-pseudo-camera',-Math.PI/2.18,Math.PI/2.1,780,BABYLON.Vector3.Zero(),this.scene);
  this.camera.fov=0.28;
  this.camera.lowerBetaLimit=1.28;this.camera.upperBetaLimit=1.84;
  this.camera.lowerRadiusLimit=260;this.camera.upperRadiusLimit=1800;this.camera.wheelPrecision=28;this.camera.panningSensibility=1850;this.camera.pinchPrecision=72;this.camera.angularSensibilityX=2600;this.camera.angularSensibilityY=3200;this.camera.inertia=.78;this.camera.attachControl(canvas,true);
  const hemi=new BABYLON.HemisphericLight('pseudo-hemi',new BABYLON.Vector3(0,1,-.2),this.scene);hemi.intensity=.26;hemi.diffuse=color3('#A8B6C5');hemi.groundColor=color3('#090D12');
  const key=new BABYLON.PointLight('pseudo-key',new BABYLON.Vector3(-80,180,-120),this.scene);key.intensity=.72;key.diffuse=color3('#E8C982');
  this.glow=new BABYLON.GlowLayer('pseudo-glow',this.scene,{blurKernelSize:24});this.glow.intensity=this.options.glow;
  this.createStars();this.installPicking();this.engine.onResizeObservable.add(()=>this.updateLabels());
 }
 createStars(){
  const mat=new BABYLON.StandardMaterial('pseudo-star-mat',this.scene);mat.emissiveColor=color3('#B7C1CC').scale(.62);mat.disableLighting=true;
  const proto=BABYLON.MeshBuilder.CreateSphere('pseudo-star-proto',{diameter:.9,segments:4},this.scene);proto.material=mat;proto.isVisible=false;
  for(let i=0;i<150;i++){
   const s=proto.createInstance(`pseudo-star-${i}`),r=760+(i%9)*82,theta=i*2.3999632297,phi=Math.acos(1-2*((i*.6180339887)%1));
   s.position.set(Math.sin(phi)*Math.cos(theta)*r,Math.cos(phi)*r*.42,Math.sin(phi)*Math.sin(theta)*r*.32);s.scaling.scaleInPlace(i%19===0?2.2:i%7===0?1.45:.8);
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
  for(const p of this.pulses)p.mesh.dispose();this.pulses=[];this.clearLabels();
  const positions=layoutNodes(this.graph.nodes,this.focusId,{baseRadius:230,ringGap:105,depthScale:135});
  for(const node of this.graph.nodes){
   const p=positions.get(node.id)||[0,0,0],z=p[2]*this.options.depthScale;
   const mesh=BABYLON.MeshBuilder.CreateSphere(`pseudo-node:${node.id}`,{diameter:radiusFor(node)*2,segments:node.type==='SYSTEM'?22:14},this.scene);
   mesh.position.set(p[0],-p[1],z);mesh.metadata={node};
   const depthBoost=1+clamp(z/520,-.10,.10);mesh.scaling.setAll(depthBoost);
   const hex=this.palette.SYSTEM_COLORS[node.id]||this.palette.SYSTEM_COLORS[`system:${node.system}`]||this.palette.STATUS_COLORS[node.status]||'#B8C4D0';
   const col=color3(hex),mat=new BABYLON.StandardMaterial(`pseudo-mat:${node.id}`,this.scene);mat.diffuseColor=col.scale(.18);mat.emissiveColor=col.scale(node.type==='SYSTEM'?.60:.34);mat.specularColor=color3('#D8E0E8').scale(.25);mat.specularPower=36;mesh.material=mat;
   if(node.id===this.focusId||node.type==='SYSTEM'){
    const halo=BABYLON.MeshBuilder.CreateTorus(`pseudo-ring:${node.id}`,{diameter:radiusFor(node)*(node.id===this.focusId?3.6:2.8),thickness:node.id===this.focusId?.5:.28,tessellation:64},this.scene);halo.parent=mesh;halo.rotation.x=Math.PI/2;halo.scaling.y=.42;
    const hm=new BABYLON.StandardMaterial(`pseudo-ringmat:${node.id}`,this.scene);hm.emissiveColor=col.scale(node.id===this.focusId?.56:.34);hm.alpha=node.id===this.focusId?.48:.22;hm.disableLighting=true;halo.material=hm;
   }
   this.nodeMeshes.set(node.id,mesh);
  }
  for(const edge of this.graph.edges){
   const a=this.nodeMeshes.get(edge.source),b=this.nodeMeshes.get(edge.target);if(!a||!b)continue;
   const path=quadraticShallow(a.position,b.position,edge.kind==='cross-domain'?.25:.17,30,edge.source<edge.target?1:-1);
   const tube=BABYLON.MeshBuilder.CreateTube(`pseudo-edge:${edge.id}`,{path,radius:edge.kind==='cross-domain'?.42:.28,tessellation:5,cap:BABYLON.Mesh.CAP_ALL},this.scene);
   const hex=edge.kind==='cross-domain'?'#788B82':edge.authority==='derived'?'#6D6877':'#556676';const em=color3(hex),mat=new BABYLON.StandardMaterial(`pseudo-edge-mat:${edge.id}`,this.scene);mat.emissiveColor=em.scale(.56);mat.diffuseColor=em.scale(.08);mat.alpha=edge.kind==='cross-domain'?.42:.30;mat.disableLighting=true;tube.material=mat;this.edgeMeshes.push(tube);
   const pulse=BABYLON.MeshBuilder.CreateSphere(`pseudo-pulse:${edge.id}`,{diameter:edge.kind==='cross-domain'?2.45:1.85,segments:7},this.scene),pm=new BABYLON.StandardMaterial(`pseudo-pulse-mat:${edge.id}`,this.scene);pm.emissiveColor=color3('#E8C982').scale(.88);pm.disableLighting=true;pulse.material=pm;this.pulses.push({mesh:pulse,path,phase:(edge.id.length%19)/19,speed:.05+(edge.id.length%7)*.004});
  }
  this.buildLabels();this.fit();
 }
 buildLabels(){
  const ranked=[...this.graph.nodes].sort((a,b)=>semanticPriority(b,this.focusId,this.selectedId)-semanticPriority(a,this.focusId,this.selectedId)).slice(0,this.options.maxLabels);
  for(const node of ranked){const el=document.createElement('div');el.className=`node-label ${node.type==='SYSTEM'?'system':''}`;el.textContent=node.label;el.dataset.id=node.id;this.labelsLayer.appendChild(el);this.labels.push({node,el})}this.updateLabels();
 }
 rebuildLabels(){this.clearLabels();this.buildLabels()}
 clearLabels(){for(const l of this.labels)l.el.remove();this.labels=[]}
 select(id){this.selectedId=id;for(const [nodeId,mesh] of this.nodeMeshes){const z=mesh.position.z,depthBoost=1+clamp(z/520,-.10,.10),selected=nodeId===id?1.13:1;mesh.scaling.setAll(depthBoost*selected)}this.rebuildLabels()}
 zoom(factor){this.camera.radius=clamp(this.camera.radius*factor,this.camera.lowerRadiusLimit,this.camera.upperRadiusLimit)}
 fit(){if(!this.graph.nodes.length)return;this.camera.radius=this.graph.nodes.length>180?1120:this.graph.nodes.length>80?920:760;this.camera.target=BABYLON.Vector3.Zero();this.camera.alpha=-Math.PI/2.18;this.camera.beta=Math.PI/2.1}
 centerSelected(){const mesh=this.nodeMeshes.get(this.selectedId);if(mesh)this.camera.setTarget(new BABYLON.Vector3(mesh.position.x,mesh.position.y,mesh.position.z*.25))}
 updateLabels(){
  if(!this.labels.length)return;const transform=this.scene.getTransformMatrix(),viewport=this.camera.viewport.toGlobal(this.engine.getRenderWidth(),this.engine.getRenderHeight()),scale=this.engine.getHardwareScalingLevel(),rw=this.engine.getRenderWidth()/scale,rh=this.engine.getRenderHeight()/scale;
  for(const item of this.labels){const mesh=this.nodeMeshes.get(item.node.id);if(!mesh){item.el.style.display='none';continue}const p=BABYLON.Vector3.Project(mesh.getAbsolutePosition(),BABYLON.Matrix.Identity(),transform,viewport),visible=p.z>0&&p.z<1&&p.x>=0&&p.x<=rw&&p.y>=0&&p.y<=rh;item.el.style.display=visible?'block':'none';if(visible){item.el.style.left=`${p.x}px`;item.el.style.top=`${p.y-radiusFor(item.node)-10}px`;const fade=clamp(1-Math.abs(mesh.position.z)/260,.62,1);item.el.style.opacity=String(fade)}}
 }
 start(){if(this.running)return;this.running=true;this.engine.runRenderLoop(()=>this.frame())}
 stop(){this.running=false;this.engine.stopRenderLoop()}
 frame(){
  if(!this.running)return;const now=performance.now(),dt=Math.min(80,now-this.lastFrame);this.lastFrame=now;
  if(this.options.autoOrbit&&!reducedMotion())this.camera.alpha+=dt*.00007;
  if(!reducedMotion()&&this.options.pulseSpeed>0){for(const p of this.pulses){p.phase=(p.phase+dt*.001*p.speed*this.options.pulseSpeed)%1;const idx=p.phase*(p.path.length-1),lo=Math.floor(idx),hi=Math.min(p.path.length-1,lo+1),t=idx-lo;p.mesh.position=BABYLON.Vector3.Lerp(p.path[lo],p.path[hi],t)}}
  this.scene.render();this.updateLabels();
  if(now-this.lastStats>250){this.lastStats=now;const fps=this.engine.getFps(),frameMs=fps?1000/fps:0,visible=this.labels.filter(l=>l.el.style.display!=='none').length;this.callbacks.onStats?.({fps,frameMs,nodes:this.graph.nodes.length,edges:this.graph.edges.length,labels:visible})}
 }
}
