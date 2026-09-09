export const GOLDEN_ANGLE=2.399963229728653;

export function hash32(value){
 let h=2166136261;
 for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
 return h>>>0;
}

export function unitHash(value){return hash32(value)/0xffffffff}

export function easeInOutCubic(t){
 const x=Math.max(0,Math.min(1,t));
 return x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
}

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>scale(a,1/(Math.hypot(...a)||1));

/** Deterministic spherical shell and perpendicular, outward-facing child petals.
 * Frames describe each node's orbit about its parent. The returned Map retains
 * the position API; .frames supplies the same geometry to filaments and rings.
 * No position depends on the population of another branch.
 */
export function layoutNodes(nodes,focusId,options={}){
 const baseRadius=Number(options.baseRadius||250);
 const ringGap=Number(options.ringGap||118);
 const flat=Boolean(options.flat);
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const children=new Map();
 for(const node of nodes){
  if(node.id===focusId)continue;
  const parentId=node.parentId&&node.parentId!==node.id&&byId.has(node.parentId)?node.parentId:focusId;
  const list=children.get(parentId)||[];
  list.push(node);children.set(parentId,list);
 }
 const out=new Map([[focusId,[0,0,0]]]);
 const frames=new Map([[focusId,{radial:[1,0,0],tangent:[0,1,0],binormal:[0,0,1]}]]);
 Object.defineProperty(out,'frames',{value:frames});
 const place=(parentId,depth)=>{
  const kids=children.get(parentId)||[];
  const parentPos=out.get(parentId),parentFrame=frames.get(parentId);
  const ring=depth===1;
  const radius=ring?baseRadius:ringGap*(.85+Math.min(kids.length,10)*.05);
  const arc=Math.min(Math.PI*.85,Math.max(1.4,.5+kids.length*.24));
  kids.forEach((node,index)=>{
   if(out.has(node.id))return;
   let radial,tangent;
   if(ring){
    const angle=unitHash(parentId)*Math.PI*2+index/kids.length*Math.PI*2;
    // Alternating latitudes preserve azimuth spacing and visibly occupy Z.
    const latitude=flat?0:(index%2?1:-1)*(.48+unitHash(node.id)*.32);
    radial=[Math.cos(angle)*Math.cos(latitude),Math.sin(angle)*Math.cos(latitude),Math.sin(latitude)];
    tangent=[-Math.sin(angle),Math.cos(angle),0];
   }else{
    const angle=kids.length===1?.65:-arc/2+arc*index/(kids.length-1);
    const u=parentFrame.radial;
    const v=flat?parentFrame.tangent:parentFrame.binormal;
    radial=add(scale(u,Math.cos(angle)),scale(v,Math.sin(angle)));
    tangent=add(scale(u,-Math.sin(angle)),scale(v,Math.cos(angle)));
   }
   radial=unit(radial);tangent=unit(tangent);
   frames.set(node.id,{radial,tangent,binormal:unit(cross(radial,tangent))});
   out.set(node.id,add(parentPos,scale(radial,radius)));
   place(node.id,depth+1);
  });
 };
 place(focusId,1);
 // Preserve deterministic handling of disconnected/cyclic input without recursion.
 for(const node of nodes)if(!out.has(node.id)){
  const angle=unitHash(node.id)*Math.PI*2;
  const radial=[Math.cos(angle),Math.sin(angle),0],tangent=[-Math.sin(angle),Math.cos(angle),0];
  out.set(node.id,scale(radial,baseRadius+ringGap*2));
  frames.set(node.id,{radial,tangent,binormal:[0,0,1]});
 }
 return out;
}

export function interpolatePosition(a,b,t){
 const p=easeInOutCubic(t);
 return [a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p,a[2]+(b[2]-a[2])*p];
}

