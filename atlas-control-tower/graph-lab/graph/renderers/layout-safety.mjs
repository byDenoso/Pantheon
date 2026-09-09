import {layoutNodes} from '../layout.mjs';
import {GraphLabRenderer as LegacyCanvasRenderer} from '../legacy-renderer.mjs';
import {GraphLabRenderer as ThreeRenderer} from '../renderer.mjs';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const scaleMap=(source,factor)=>new Map([...source].map(([id,p])=>[id,[p[0]*factor,p[1]*factor,p[2]*factor]]));

function fitLegacy(instance){
 const geometry=instance.targetPositions?.size?instance.targetPositions:instance.positions;
 if(!geometry?.size)return;
 const xs=[...geometry.values()].map(p=>p[0]);
 const ys=[...geometry.values()].map(p=>p[1]);
 const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),300);
 const padding=Math.max(.72,Number(instance.options?.fitPadding||1));
 instance.camera.zoom=clamp(640/(span*padding),.34,1.55);
 instance.camera.panX=0;instance.camera.panY=0;
}

function patchLegacy(){
 const proto=LegacyCanvasRenderer.prototype;if(proto.__atlasLayoutSafetyV6)return;
 proto.__atlasLayoutSafetyV6=true;
 proto.setGraph=function(graph,{focusId=this.focusId,fit=false}={}){
  const previous=new Map(this.positions);
  this.graph=graph;this.focusId=focusId;
  const spacing=Math.max(.55,Number(this.options?.layoutSpacing||1));
  const rawTarget=layoutNodes(graph.nodes,focusId,{baseRadius:245,ringGap:112,depthScale:145});
  const targetPositions=spacing===1?rawTarget:scaleMap(rawTarget,spacing);
  const start=new Map();
  for(const node of graph.nodes){
   if(previous.has(node.id)){start.set(node.id,[...previous.get(node.id)]);continue}
   const anchor=previous.get(node.parentId)||targetPositions.get(node.parentId)||[0,0,-45];
   start.set(node.id,[anchor[0],anchor[1],anchor[2]-22]);
  }
  this.positions=start;
  this.targetPositions=targetPositions;
  this.transition={start,target:targetPositions,at:performance.now(),duration:this.options.transitionMs||780};
  if(this.selectedId&&!graph.nodes.some(node=>node.id===this.selectedId))this.selectedId=null;
  if(fit)fitLegacy(this);
  this.render();
 };
 proto.fit=function(){fitLegacy(this);this.render()};
}

function patchThree(){
 const proto=ThreeRenderer.prototype;if(proto.__atlasLayoutSafetyV6)return;
 proto.__atlasLayoutSafetyV6=true;
 const originalSetGraph=proto.setGraph;
 proto.setGraph=function(source,options={}){
  const result=originalSetGraph.call(this,source,options);
  const spacing=Math.max(.55,Number(this.options?.layoutSpacing||1));
  if(spacing!==1&&this.targetPositions?.size){
   const scaled=scaleMap(this.targetPositions,spacing);
   this.targetPositions=scaled;
   if(this.transition)this.transition.target=scaled;
   this.rebuildScene?.();
   if(options.fit){this.fit();this.orbit.distance*=Math.max(.72,Number(this.options?.fitPadding||1))}
   else this.ensureInFrame?.(scaled);
   this.invalidate?.();
  }else if(options.fit&&this.orbit){
   this.orbit.distance*=Math.max(.72,Number(this.options?.fitPadding||1));
   this.invalidate?.();
  }
  return result;
 };
}

patchLegacy();
patchThree();

export {fitLegacy,scaleMap};
