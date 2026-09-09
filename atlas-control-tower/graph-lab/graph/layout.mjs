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

const length=v=>Math.hypot(v[0],v[1],v[2]);
const normalize=v=>{const n=length(v)||1;return[v[0]/n,v[1]/n,v[2]/n]};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const addScaled=(origin,...parts)=>parts.reduce((out,[axis,scale])=>[out[0]+axis[0]*scale,out[1]+axis[1]*scale,out[2]+axis[2]*scale],[...origin]);

function localFrame(parentPos,parentId){
 const radial=normalize(parentPos);
 const reference=Math.abs(radial[2])<.82?[0,0,1]:[0,1,0];
 let tangent=normalize(cross(reference,radial));
 let bitangent=normalize(cross(radial,tangent));
 const twist=unitHash(parentId)*Math.PI*2;
 const c=Math.cos(twist),s=Math.sin(twist);
 const t=[tangent[0]*c+bitangent[0]*s,tangent[1]*c+bitangent[1]*s,tangent[2]*c+bitangent[2]*s];
 const b=[bitangent[0]*c-tangent[0]*s,bitangent[1]*c-tangent[1]*s,bitangent[2]*c-tangent[2]*s];
 return{radial,tangent:t,bitangent:b};
}

/**
 * Deterministic 3.5D orbital layout.
 *
 * Domains occupy a shallow spherical shell around NEXO instead of one XY disk.
 * Descendants open in a stable local frame attached to their parent and lean
 * outward from the shell, so progressive expansion adds volume without moving
 * anything that was already visible.
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
 const place=(parentId,parentPos,depth)=>{
  const kids=children.get(parentId)||[];
  if(!kids.length)return;
  const shell=depth===1;
  const radius=shell?baseRadius:ringGap*(.85+Math.min(kids.length,10)*.05);

  if(shell){
   const start=unitHash(parentId)*Math.PI*2;
   const shellDepth=Math.max(depthScale,baseRadius*.74);
   kids.forEach((node,index)=>{
    const seed=unitHash(node.id);
    const zNorm=1-2*(index+.5)/kids.length;
    const radialXY=Math.sqrt(Math.max(0,1-zNorm*zNorm));
    const angle=start+index*GOLDEN_ANGLE+(seed-.5)*.08;
    const spread=.96+seed*.08;
    const x=Math.cos(angle)*radialXY*baseRadius*spread;
    const y=Math.sin(angle)*radialXY*baseRadius*flatten*spread;
    const z=zNorm*shellDepth+(seed-.5)*10;
    out.set(node.id,[x,y,z]);
    place(node.id,[x,y,z],depth+1);
   });
   return;
  }

  const {radial,tangent,bitangent}=localFrame(parentPos,parentId);
  const arc=Math.min(Math.PI*1.18,.55+kids.length*.24);
  const step=kids.length>1?arc/(kids.length-1):0;
  const start=-arc/2;
  kids.forEach((node,index)=>{
   const seed=unitHash(node.id);
   const angle=start+step*index;
   const spread=1+(index%2)*.14;
   const outward=.46+seed*.1;
   const planar=Math.sqrt(Math.max(0,1-outward*outward));
   const localT=Math.cos(angle)*planar;
   const localB=Math.sin(angle)*planar;
   const distance=radius*spread;
   const position=addScaled(parentPos,[tangent,localT*distance],[bitangent,localB*distance],[radial,outward*distance]);
   out.set(node.id,position);
   place(node.id,position,depth+1);
  });
 };
 place(focusId,[0,0,0],1);

 for(const node of nodes)if(!out.has(node.id)){
  const seed=unitHash(node.id);
  const angle=seed*Math.PI*2;
  const zNorm=unitHash(`${node.id}:z`)*2-1;
  const radialXY=Math.sqrt(Math.max(0,1-zNorm*zNorm));
  const radius=baseRadius+ringGap*2;
  out.set(node.id,[Math.cos(angle)*radialXY*radius,Math.sin(angle)*radialXY*radius*flatten,zNorm*Math.max(depthScale,radius*.6)]);
 }
 return out;
}

export function interpolatePosition(a,b,t){
 const p=easeInOutCubic(t);
 return [a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p,a[2]+(b[2]-a[2])*p];
}
