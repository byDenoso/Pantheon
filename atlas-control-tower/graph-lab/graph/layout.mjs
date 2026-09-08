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

function semanticDepth(node,byId,focusId){
 if(node.id===focusId)return 0;
 let cur=node,depth=0,guard=0;
 while(cur&&cur.id!==focusId&&guard++<12){
  depth++;
  cur=cur.parentId?byId.get(cur.parentId):null;
 }
 if(cur?.id===focusId)return Math.max(1,depth);
 const fallback={SYSTEM:1,DOMAIN:2,CAMPAIGN:3,CLAIM:4,TEST:4,RESULT:5}[node.type]||4;
 return fallback;
}

const typeLift={SYSTEM:0,DOMAIN:24,CAMPAIGN:52,CLAIM:84,TEST:92,RESULT:122};

export function layoutNodes(nodes,focusId,options={}){
 const baseRadius=Number(options.baseRadius||250);
 const ringGap=Number(options.ringGap||118);
 const depthScale=Number(options.depthScale||145);
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const out=new Map();
 out.set(focusId,[0,0,0]);
 let ordinal=0;
 for(const node of nodes){
  if(node.id===focusId)continue;
  const depth=semanticDepth(node,byId,focusId);
  const seed=unitHash(node.id);
  const parentSeed=unitHash(node.parentId||node.system||'root');
  const angle=ordinal++*GOLDEN_ANGLE+parentSeed*Math.PI*.8+seed*.35;
  const radius=baseRadius+(depth-1)*ringGap+(typeLift[node.type]||70)*.38;
  const flatten=1-Math.min(.28,(depth-1)*.035);
  const x=Math.cos(angle)*radius;
  const y=Math.sin(angle)*radius*flatten;
  const z=Math.sin(angle*1.73+seed*Math.PI*2)*depthScale+(depth-2)*28;
  out.set(node.id,[x,y,z]);
 }
 for(const node of nodes)if(!out.has(node.id))out.set(node.id,[0,0,0]);
 return out;
}

export function interpolatePosition(a,b,t){
 const p=easeInOutCubic(t);
 return [a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p,a[2]+(b[2]-a[2])*p];
}
