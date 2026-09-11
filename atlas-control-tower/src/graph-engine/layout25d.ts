import type {GraphNode,GraphProjection} from './types';
import type {GraphCluster25D,GraphLayout25D,GraphNode25D,GraphOrbit25D} from './types25d';

const TAU=Math.PI*2;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const hash=(value:string)=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0)/4294967295};
const typeKey=(node:GraphNode)=>String(node.type||'').toUpperCase();

const semanticSize=(node:GraphNode,isFocus:boolean)=>{
  if(isFocus)return 88;
  const type=typeKey(node);
  if(type==='ROOT'||type==='SYSTEM')return 54;
  if(type==='DOMAIN')return 48;
  if(type==='SUBGRAPH'||type==='CAMPAIGN')return 34;
  if(type==='TEST'||type==='RESULT'||type==='CLAIM'||type==='HYPOTHESIS')return 23;
  return 18;
};

const semanticPriority=(node:GraphNode,isFocus:boolean)=>{
  if(isFocus)return 100;
  const type=typeKey(node);
  if(type==='ROOT'||type==='SYSTEM')return 88;
  if(type==='DOMAIN')return 82;
  if(type==='SUBGRAPH'||type==='CAMPAIGN')return 68;
  if(type==='TEST'||type==='RESULT'||type==='CLAIM'||type==='HYPOTHESIS')return 52;
  return 34;
};

const structuralParentMap=(projection:GraphProjection,focusId:string)=>{
  const ids=new Set(projection.nodes.map(node=>node.id));
  const parent=new Map<string,string>();
  for(const node of projection.nodes){if(node.parentId&&ids.has(node.parentId)&&node.id!==focusId)parent.set(node.id,node.parentId)}
  for(const edge of projection.edges){
    if(!ids.has(edge.source)||!ids.has(edge.target)||edge.source===edge.target||edge.target===focusId||parent.has(edge.target))continue;
    const type=String(edge.type||'').toUpperCase();
    if(type.includes('LEARNING'))continue;
    parent.set(edge.target,edge.source);
  }
  return parent;
};

const depthOf=(id:string,focusId:string,parent:Map<string,string>)=>{
  if(id===focusId)return 0;
  let current=id;let depth=0;const seen=new Set<string>();
  while(parent.has(current)&&depth<8){
    if(seen.has(current))break;seen.add(current);current=parent.get(current)!;depth++;
    if(current===focusId)return depth;
  }
  return Math.max(1,depth||2);
};

const clusterRootOf=(id:string,focusId:string,parent:Map<string,string>)=>{
  if(id===focusId)return focusId;
  let current=id;let previous=id;const seen=new Set<string>();
  while(parent.has(current)){
    if(seen.has(current))break;seen.add(current);previous=current;current=parent.get(current)!;
    if(current===focusId)return previous;
  }
  return previous;
};

const siblingsFor=(parentId:string,parent:Map<string,string>,nodes:GraphNode[])=>nodes.filter(node=>parent.get(node.id)===parentId).sort((a,b)=>a.id.localeCompare(b.id));

export function buildLayout25D(projection:GraphProjection):GraphLayout25D{
  const focusId=projection.focusId&&projection.nodes.some(node=>node.id===projection.focusId)?projection.focusId:(projection.nodes[0]?.id||'');
  const parent=structuralParentMap(projection,focusId);
  const nodeById=new Map(projection.nodes.map(node=>[node.id,node]));
  const direct=siblingsFor(focusId,parent,projection.nodes);
  const directIndex=new Map(direct.map((node,index)=>[node.id,index]));
  const directPosition=new Map<string,{x:number;y:number;z:number}>();

  direct.forEach((node,index)=>{
    const count=Math.max(1,direct.length);const angle=-Math.PI/2+(index/count)*TAU;
    const jitter=(hash(node.id)-.5)*.18;
    directPosition.set(node.id,{x:50+Math.cos(angle+jitter)*29,y:50+Math.sin(angle+jitter)*24,z:48+(hash(`${node.id}:z`)-.5)*34});
  });

  const laid:GraphNode25D[]=projection.nodes.map((node,index)=>{
    const isFocus=node.id===focusId;const depth=depthOf(node.id,focusId,parent);const clusterId=clusterRootOf(node.id,focusId,parent);
    if(isFocus)return{...node,x:50,y:50,z:100,size:semanticSize(node,true),priority:semanticPriority(node,true),depth:0,clusterId:focusId,isFocus:true};

    if(directIndex.has(node.id)){
      const p=directPosition.get(node.id)!;
      return{...node,x:clamp(p.x,8,92),y:clamp(p.y,10,90),z:p.z,size:semanticSize(node,false),priority:semanticPriority(node,false),depth,clusterId,isFocus:false};
    }

    const rootId=clusterId;const rootPos=directPosition.get(rootId)||{x:50+(hash(`${rootId}:x`)-.5)*58,y:50+(hash(`${rootId}:y`)-.5)*44,z:12};
    const parentId=parent.get(node.id)||rootId;const siblings=siblingsFor(parentId,parent,projection.nodes);const siblingIndex=Math.max(0,siblings.findIndex(candidate=>candidate.id===node.id));const count=Math.max(1,siblings.length);
    const angle=(siblingIndex/count)*TAU+hash(parentId)*1.9+depth*.43;
    const radiusX=8+Math.min(14,depth*3.2);const radiusY=6+Math.min(10,depth*2.4);
    const center=nodeById.has(parentId)&&parentId!==rootId?undefined:rootPos;
    let cx=center?.x??rootPos.x;let cy=center?.y??rootPos.y;
    const parentPlaced=laid.find(candidate=>candidate.id===parentId);
    if(parentPlaced){cx=parentPlaced.x;cy=parentPlaced.y}
    const x=clamp(cx+Math.cos(angle)*radiusX,5,95);const y=clamp(cy+Math.sin(angle)*radiusY,8,92);
    const z=28-depth*20+(hash(`${node.id}:depth`)-.5)*18;
    return{...node,x,y,z,size:semanticSize(node,false),priority:semanticPriority(node,false),depth,clusterId,isFocus:false};
  });

  const clusters:GraphCluster25D[]=direct.map((node,index)=>{
    const members=laid.filter(candidate=>candidate.clusterId===node.id||candidate.id===node.id);const x=members.reduce((sum,item)=>sum+item.x,0)/Math.max(1,members.length);const y=members.reduce((sum,item)=>sum+item.y,0)/Math.max(1,members.length);
    return{id:`cluster:${node.id}`,label:node.label,x:clamp(x,10,90),y:clamp(y,12,88),z:18+(index%3)*9,width:Math.min(30,16+members.length*1.4),height:Math.min(19,10+members.length*.9)};
  });
  if(clusters.length<2&&focusId)clusters.unshift({id:`cluster:${focusId}`,label:nodeById.get(focusId)?.label||'Foco',x:50,y:50,z:55,width:22,height:13});

  const orbits:GraphOrbit25D[]=[{id:'orbit:focus:near',x:50,y:50,width:31,height:13,z:54,rotate:-14},{id:'orbit:focus:far',x:50,y:50,width:43,height:17,z:30,rotate:17}];
  for(const node of direct.slice(0,6)){
    const p=directPosition.get(node.id)!;orbits.push({id:`orbit:${node.id}`,x:p.x,y:p.y,width:15,height:7,z:p.z-5,rotate:-22+hash(node.id)*44});
  }

  return{focusId,nodes:laid,orbits,clusters};
}
