import {layoutNodes} from '../layout.mjs';
import {filamentControl,filamentStyle} from '../filaments.mjs';
import {placeLabels} from '../labels.mjs';
import {pickNode} from '../picking.mjs';
import {PRESETS,getPalette,colorForNode,levelStyle} from '../palette.mjs';
import './visual-presets.mjs';

const BABYLON_URL='https://esm.sh/@babylonjs/core@9.25.0/Legacy/legacy?bundle';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const parseHex=value=>String(value||'#ffffff').replace('#','');
const cssColor=value=>{const rgba=/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(String(value||''));if(rgba)return'#'+rgba.slice(1,4).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('');return'#'+parseHex(value).padStart(6,'0').slice(-6)};

export class BabylonGraphRenderer{
 constructor(container,{onSelect,onOpen,onStats,onHover}={},options={}){
  this.container=container;this.callbacks={onSelect,onOpen,onStats,onHover};
  this.dimension=options.dimension==='3D'?'3D':'2.5D';this.rendererId=this.dimension==='3D'?'babylon-3d':'babylon-25d';
  this.options={...PRESETS.ORIGINAL};this.palette=getPalette('A');
  this.source={rootId:null,nodes:[],edges:[]};this.focusId=null;this.selectedId=null;this.hoverId=null;
  this.positions=new Map();this.targetPositions=new Map();this.points=[];this.labels=[];
  this.nodeMeshes=new Map();this.edgeMeshes=[];this.running=false;this.destroyed=false;this.lastStatsAt=0;this.frameSamples=[];this.flat=false;
  this.canvas=document.createElement('canvas');this.canvas.className='graph-gl atlas-babylon-canvas';
  this.overlay=document.createElement('canvas');this.overlay.className='graph-overlay atlas-babylon-overlay';this.overlay.tabIndex=0;this.overlay.style.touchAction='none';
  container.replaceChildren(this.canvas,this.overlay);this.ctx=this.overlay.getContext('2d');
  this.eventController=new AbortController();
  this.installEvents();this.ready=this.initBabylon();
  if(typeof ResizeObserver==='function'){this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container)}
 }

 async initBabylon(){
  const BABYLON=await import(BABYLON_URL);if(this.destroyed)return null;this.BABYLON=BABYLON;
  const engine=new BABYLON.Engine(this.canvas,true,{preserveDrawingBuffer:false,stencil:false,antialias:true,powerPreference:'high-performance'},true);this.engine=engine;
  const scene=new BABYLON.Scene(engine);scene.clearColor=new BABYLON.Color4(0.008,0.018,0.032,1);this.scene=scene;
  const camera=new BABYLON.ArcRotateCamera('atlas-camera',-Math.PI/2.25,Math.PI/2.45,this.dimension==='3D'?12:15,new BABYLON.Vector3(0,0,0),scene);this.camera=camera;
  camera.lowerRadiusLimit=3.5;camera.upperRadiusLimit=50;camera.wheelPrecision=75;camera.panningSensibility=0;camera.attachControl(this.overlay,true);
  const hemi=new BABYLON.HemisphericLight('atlas-hemi',new BABYLON.Vector3(.2,1,-.2),scene);hemi.intensity=.55;
  const point=new BABYLON.PointLight('atlas-core-light',new BABYLON.Vector3(0,0,2),scene);point.intensity=.35;this.lights=[hemi,point];
  this.resize();this.rebuildScene();
  if(this.running)this.startRenderLoop();else this.renderOnce();
  return engine;
 }

 scaleMap(raw){const spacing=Math.max(.55,Number(this.options.layoutSpacing||1));const depth=this.flat?0:(this.dimension==='3D'?1:.34);return new Map([...raw].map(([id,p])=>[id,[p[0]*spacing/75,-p[1]*spacing/75,p[2]*spacing*depth/75]]))}
 setGraph(source,{focusId=this.focusId,fit=false}={}){this.source=source||{rootId:null,nodes:[],edges:[]};this.focusId=focusId||this.source.rootId;this.targetPositions=this.scaleMap(layoutNodes(this.source.nodes,this.focusId,{baseRadius:250,ringGap:128,depthScale:145}));this.positions=new Map([...this.targetPositions].map(([id,p])=>[id,[...p]]));if(this.selectedId&&!this.source.nodes.some(n=>n.id===this.selectedId))this.selectedId=null;this.ready?.then(()=>{if(this.destroyed)return;this.rebuildScene();if(fit)this.fit();else this.renderOnce()});this.emitStats()}

 color3(value){return this.BABYLON.Color3.FromHexString(cssColor(value))}
 nodeRadius(node){const style=levelStyle(node);return clamp(style.radius*this.options.nodeRadius/20,.16,node.id===this.source.rootId?1.05:.72)}
 rebuildScene(){
  if(!this.scene||!this.BABYLON)return;
  for(const {mesh,material} of this.nodeMeshes.values()){mesh.dispose();material.dispose()}this.nodeMeshes.clear();
  for(const mesh of this.edgeMeshes)mesh.dispose();this.edgeMeshes=[];
  const byId=new Map(this.source.nodes.map(n=>[n.id,n]));
  for(const node of this.source.nodes){
   const radius=this.nodeRadius(node),mesh=this.BABYLON.MeshBuilder.CreateSphere(`node:${node.id}`,{diameter:radius*2,segments:18},this.scene);const material=new this.BABYLON.StandardMaterial(`mat:${node.id}`,this.scene);const color=this.color3(colorForNode(node,this.palette));material.diffuseColor=color.scale(.08);material.emissiveColor=color;material.specularColor=this.BABYLON.Color3.Black();material.alpha=.88;mesh.material=material;mesh.metadata={nodeId:node.id};const p=this.positions.get(node.id)||[0,0,0];mesh.position.set(...p);this.nodeMeshes.set(node.id,{mesh,material,node,radius});
  }
  for(const edge of this.source.edges){
   const a=this.positions.get(edge.source),b=this.positions.get(edge.target);if(!a||!b)continue;const sa={x:a[0],y:a[1]},sb={x:b[0],y:b[1]},cp=filamentControl(sa,sb,this.options.filamentCurve,edge.source<edge.target?1:-1);const points=[];for(let i=0;i<=18;i++){const t=i/18,u=1-t,x=u*u*a[0]+2*u*t*cp.cx+t*t*b[0],y=u*u*a[1]+2*u*t*cp.cy+t*t*b[1],z=u*a[2]+t*b[2];points.push(new this.BABYLON.Vector3(x,y,z))}const line=this.BABYLON.MeshBuilder.CreateLines(`edge:${edge.id||edge.source+'-'+edge.target}`,{points,updatable:false},this.scene);const style=filamentStyle(edge,this.palette);line.color=this.color3(style.stroke);line.alpha=.42;line.isPickable=false;this.edgeMeshes.push(line);
  }
  this.applySelection();this.renderOnce();
 }
 applySelection(){for(const [id,item] of this.nodeMeshes){const active=id===this.selectedId||id===this.hoverId;item.material.alpha=active?1:.84;item.mesh.scaling.setAll(active?1.22:1)}}

 resize(){const rect=this.container.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);this.dpr=Math.min(devicePixelRatio||1,2);this.overlay.width=Math.round(this.width*this.dpr);this.overlay.height=Math.round(this.height*this.dpr);this.overlay.style.width=`${this.width}px`;this.overlay.style.height=`${this.height}px`;this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.engine?.resize();this.renderOnce()}
 projectPoints(){if(!this.scene||!this.BABYLON||!this.camera)return;const viewport=new this.BABYLON.Viewport(0,0,this.width,this.height);const transform=this.scene.getTransformMatrix();this.points=[];for(const node of this.source.nodes){const p=this.positions.get(node.id);if(!p)continue;const projected=this.BABYLON.Vector3.Project(new this.BABYLON.Vector3(...p),this.BABYLON.Matrix.Identity(),transform,viewport);const item=this.nodeMeshes.get(node.id);this.points.push({x:projected.x,y:projected.y,z:1-projected.z,scale:1,node,r:Math.max(5,(item?.radius||.3)*16/Math.max(.7,this.camera.radius/12))})}}
 reservedBoxes(){return [...document.querySelectorAll('[data-label-reserved]')].map(el=>{const r=el.getBoundingClientRect(),root=this.container.getBoundingClientRect();return{x:r.left-root.left,y:r.top-root.top,w:r.width,h:r.height}}).filter(r=>r.w>0&&r.h>0)}
 drawOverlay(){if(!this.ctx)return;this.ctx.clearRect(0,0,this.width,this.height);this.labels=placeLabels(this.points,{width:this.width,height:this.height,focusId:this.focusId,selectedId:this.selectedId,hoverId:this.hoverId,maxLabels:this.options.maxLabels,reserved:this.reservedBoxes()});const ctx=this.ctx,light=this.palette.id==='LIGHT';for(const label of this.labels){const color=colorForNode(label.point.node,this.palette);ctx.save();ctx.beginPath();ctx.roundRect?.(label.x,label.y,label.w,label.h,6);if(!ctx.roundRect)ctx.rect(label.x,label.y,label.w,label.h);ctx.fillStyle=light?'rgba(247,251,255,.92)':'rgba(7,12,18,.84)';ctx.fill();ctx.strokeStyle=color;ctx.globalAlpha=.72;ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle=light?'#102033':'#eaf3ff';ctx.font='700 11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(label.label,label.x+label.w/2,label.y+14,label.w-10);ctx.fillStyle=light?'#425e78':'#8da7bd';ctx.font='700 7px system-ui,sans-serif';ctx.fillText(String(label.type||''),label.x+label.w/2,label.y+25,label.w-10);ctx.restore()}}
 renderOnce(){if(!this.scene||!this.engine||this.destroyed)return;const started=performance.now();this.scene.render();this.projectPoints();this.drawOverlay();const frameMs=performance.now()-started;this.frameSamples.push(frameMs);if(this.frameSamples.length>40)this.frameSamples.shift();this.emitStats()}
 startRenderLoop(){if(!this.engine||this.looping)return;this.looping=true;this.engine.runRenderLoop(()=>{if(!this.running||this.destroyed)return;if(this.dimension==='3D'&&!reducedMotion()&&this.options.autoOrbit)this.camera.alpha+=.00045;this.renderOnce()})}

 fit(){if(!this.targetPositions.size||!this.camera)return;const reach=Math.max(...[...this.targetPositions.values()].map(p=>Math.hypot(...p)),2.8);const padding=Math.max(.72,Number(this.options.fitPadding||1));this.camera.setTarget(this.BABYLON.Vector3.Zero());this.camera.radius=clamp(reach*2.35*padding,5,42);this.renderOnce()}
 reset(){if(!this.camera)return;this.camera.alpha=-Math.PI/2.25;this.camera.beta=Math.PI/2.45;this.flat=false;this.fit()}
 zoom(factor){if(!this.camera)return;this.camera.radius=clamp(this.camera.radius/factor,this.camera.lowerRadiusLimit||3.5,this.camera.upperRadiusLimit||50);this.renderOnce()}
 toggleFlat(){this.flat=!this.flat;this.targetPositions=this.scaleMap(layoutNodes(this.source.nodes,this.focusId,{baseRadius:250,ringGap:128,depthScale:145}));this.positions=new Map([...this.targetPositions].map(([id,p])=>[id,[...p]]));if(this.camera)this.camera.beta=this.flat?Math.PI/2:Math.PI/2.45;this.rebuildScene();return this.flat}
 setSelected(id){this.selectedId=id;this.applySelection();this.renderOnce()}
 focusNode(id){const p=this.positions.get(id);if(!p||!this.camera)return;this.selectedId=id;this.camera.setTarget(new this.BABYLON.Vector3(p[0]*.55,p[1]*.55,p[2]*.55));this.camera.radius=clamp(Math.max(5,Math.hypot(...p)*2.1),5,28);this.applySelection();this.renderOnce()}
 centerSelected(){this.focusNode(this.selectedId)}
 setPreset(name){this.options={...(PRESETS[name]||PRESETS.ORIGINAL)};this.applyOptionsToScene();return this.options}
 setOptions(partial={}){Object.assign(this.options,partial);this.applyOptionsToScene()}
 setTheme(theme='dark'){this.palette=getPalette(theme==='light'?'LIGHT':'A');if(this.scene)this.scene.clearColor=theme==='light'?new this.BABYLON.Color4(.86,.92,.97,1):new this.BABYLON.Color4(.008,.018,.032,1);this.rebuildScene()}
 applyOptionsToScene(){if(this.scene){this.scene.fogMode=this.BABYLON.Scene.FOGMODE_EXP2;this.scene.fogDensity=.002+Number(this.options.fog||0)*.003;this.scene.fogColor=this.palette.id==='LIGHT'?new this.BABYLON.Color3(.86,.92,.97):new this.BABYLON.Color3(.008,.018,.032)}this.targetPositions=this.scaleMap(layoutNodes(this.source.nodes,this.focusId,{baseRadius:250,ringGap:128,depthScale:145}));this.positions=new Map([...this.targetPositions].map(([id,p])=>[id,[...p]]));this.rebuildScene()}

 installEvents(){const surface=this.overlay;let down=null;const signal=this.eventController.signal;surface.addEventListener('pointerdown',event=>{down={x:event.offsetX,y:event.offsetY,moved:0}},{signal:this.eventController.signal});surface.addEventListener('pointermove',event=>{if(down){down.moved+=Math.abs(event.offsetX-down.x)+Math.abs(event.offsetY-down.y);down.x=event.offsetX;down.y=event.offsetY;return}const hit=pickNode(this.points,event.offsetX,event.offsetY),next=hit?.node.id||null;if(next!==this.hoverId){this.hoverId=next;surface.style.cursor=next?'pointer':'grab';this.callbacks.onHover?.(hit?.node||null);this.applySelection();this.renderOnce()}},{signal:this.eventController.signal});surface.addEventListener('pointerup',event=>{if(down&&down.moved<7){const hit=pickNode(this.points,event.offsetX,event.offsetY);this.selectedId=hit?.node.id||null;this.callbacks.onSelect?.(hit?.node||null);this.applySelection();this.renderOnce()}down=null},{signal:this.eventController.signal});surface.addEventListener('pointercancel',()=>{down=null},{signal:this.eventController.signal});surface.addEventListener('dblclick',event=>{const hit=pickNode(this.points,event.offsetX,event.offsetY);if(hit)this.callbacks.onOpen?.(hit.node)},{signal:this.eventController.signal})}
 emitStats(){const now=performance.now();if(now-this.lastStatsAt<180)return;this.lastStatsAt=now;const avg=this.frameSamples.reduce((a,b)=>a+b,0)/Math.max(1,this.frameSamples.length);this.callbacks.onStats?.({fps:this.running&&avg?Math.min(120,1000/avg):60,frameMs:avg||0,nodes:this.source.nodes.length,edges:this.source.edges.length,labels:this.labels.length,dpr:this.dpr||1})}
 start(){if(this.running)return;this.running=true;this.ready?.then(()=>{if(!this.destroyed)this.startRenderLoop()})}
 stop(){this.running=false;if(this.engine&&this.looping){this.engine.stopRenderLoop();this.looping=false}}
 invalidate(){this.ready?.then(()=>this.renderOnce())}
 destroy(){this.destroyed=true;this.stop();this.eventController?.abort();this.resizeObserver?.disconnect();try{this.camera?.detachControl()}catch{}for(const {mesh,material} of this.nodeMeshes.values()){mesh.dispose();material.dispose()}for(const mesh of this.edgeMeshes)mesh.dispose();this.scene?.dispose();this.engine?.dispose();this.container.replaceChildren()}
}
