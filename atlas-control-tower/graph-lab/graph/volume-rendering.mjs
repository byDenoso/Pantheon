import * as THREE from '../vendor/three.module.min.js';
import {GraphLabRenderer,parseCssColor} from './renderer.mjs';

const RING_NORMALS=[
 new THREE.Vector3(.18,.94,.28).normalize(),
 new THREE.Vector3(-.72,.28,.64).normalize(),
 new THREE.Vector3(.55,.36,.75).normalize(),
 new THREE.Vector3(-.28,.82,-.50).normalize()
];

function stablePerpendicular(axis,radial){
 const normal=axis.clone().cross(radial);
 if(normal.lengthSq()>1e-6)return normal.normalize();
 const unit=axis.clone().normalize();
 const reference=Math.abs(unit.z)<.78?new THREE.Vector3(0,0,1):Math.abs(unit.y)<.78?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
 return axis.clone().cross(reference).normalize();
}

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
