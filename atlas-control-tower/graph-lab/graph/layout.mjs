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

/**
 * Orbital layout.
 *
 * The focus sits at the origin and its direct children take a full ring around it.
 * Deeper levels do not get their own global ring: each one opens as a sub-orbit
 * anchored on its parent and fanned outwards, away from the core. That is what keeps
 * an expanded Program from crossing the rest of the map, and what makes the graph
 * read as one system with satellites instead of a cloud of dots.
 *
 * Positions are pure functions of the node ids and sibling order, so the same SSOT
 * always lays out the same way and expanding a branch never moves the rest.
 */
export function layoutNodes(nodes,focusId,options={}){
 const baseRadius=Number(options.baseRadius||250);
 const ringGap=Number(options.ringGap||118);
 const depthScale=Number(options.depthScale||145);
 const flatten=Number(options.flatten??.82);

 const byId=new Map(nodes.map(n=>[n.id,n]));
 const children=new Map();
 for(const node of nodes){
  if(node.id===focusId)continue;
  const parentId=node.parentId&&node.parentId!==node.id&&byId.has(node.parentId)?node.parentId:focusId;
  const list=children.get(parentId)||[];
  list.push(node);
  children.set(parentId,list);
 }

 const out=new Map([[focusId,[0,0,0]]]);
 const place=(parentId,parentPos,parentAngle,depth)=>{
  const kids=children.get(parentId)||[];
  if(!kids.length)return;
  const ring=depth===1;
  // A sub-orbit widens with its population so labels stay apart without a solver.
  const radius=ring?baseRadius:ringGap*(.85+Math.min(kids.length,10)*.05);
  const arc=ring?Math.PI*2:Math.min(Math.PI*1.25,.5+kids.length*.24);
  const step=ring?arc/kids.length:kids.length>1?arc/(kids.length-1):0;
  const start=ring?unitHash(parentId)*Math.PI*2:parentAngle-arc/2;
  kids.forEach((node,index)=>{
   const angle=start+step*index;
   const seed=unitHash(node.id);
   const spread=ring?1:1+(index%2)*.17;
   const x=parentPos[0]+Math.cos(angle)*radius*spread;
   const y=parentPos[1]+Math.sin(angle)*radius*spread*flatten;
   const z=parentPos[2]+Math.sin(angle*1.6+seed*Math.PI*2)*(depthScale/(depth*1.4))+(seed-.5)*24-depth*16;
   out.set(node.id,[x,y,z]);
   place(node.id,[x,y,z],angle,depth+1);
  });
 };
 place(focusId,[0,0,0],0,1);

 for(const node of nodes)if(!out.has(node.id)){
  const seed=unitHash(node.id);
  const angle=seed*Math.PI*2;
  const radius=baseRadius+ringGap*2;
  out.set(node.id,[Math.cos(angle)*radius,Math.sin(angle)*radius*flatten,(seed-.5)*depthScale]);
 }
 return out;
}

export function interpolatePosition(a,b,t){
 const p=easeInOutCubic(t);
 return [a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p,a[2]+(b[2]-a[2])*p];
}
