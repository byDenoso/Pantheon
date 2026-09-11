const clamp=(value,min=4,max=96)=>Math.max(min,Math.min(max,value));
export const CLUSTER_RADIUS=14;
const hash=value=>{let h=2166136261;for(let i=0;i<String(value).length;i++){h^=String(value).charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
export const clusterAngle=(anchorId,index,total)=>((index/Math.max(total,1))*Math.PI*2)+((hash(anchorId)%360)*Math.PI/180)*.08;
export const collisionPush=(x,y,occupied,minGap=8)=>{
 let px=x,py=y;
 for(let pass=0;pass<5;pass++){
  const hit=occupied.find(point=>Math.hypot(point.x-px,point.y-py)<minGap);
  if(!hit)break;
  const dx=px-hit.x||1,dy=py-hit.y||.35,len=Math.max(1,Math.hypot(dx,dy));
  px=clamp(px+dx/len*(minGap*.72));py=clamp(py+dy/len*(minGap*.72));
 }
 return{x:px,y:py};
};

/**
 * Merge one focused child branch into the current graph.
 * Children are packed into a reserved local bubble around the clicked anchor,
 * preventing the old "everything collapses into the same coordinates" failure.
 */
export function graftProjection(parent,anchorId,child){
 const anchor=parent?.nodes?.find?.(node=>node.id===anchorId);
 if(!anchor||!child?.nodes?.length)return parent;
 const childRootId=child.focusId||child.nodes[0]?.id||null;
 const incoming=child.nodes.filter(node=>node.id!==childRootId&&!parent.nodes.some(existing=>existing.id===node.id));
 const existing=new Set(parent.nodes.map(node=>node.id));
 const occupied=parent.nodes.map(node=>({x:node.x??50,y:node.y??50}));
 const anchorX=anchor.x??50,anchorY=anchor.y??50;
 const appended=[];
 const baseRadius=child.level==='detail'?CLUSTER_RADIUS:CLUSTER_RADIUS+4;
 const perRing=Math.max(6,Math.ceil(Math.sqrt(Math.max(1,incoming.length))*3));
 for(let i=0;i<incoming.length;i++){
  const node=incoming[i],ring=Math.floor(i/perRing),local=i%perRing,count=Math.min(perRing,incoming.length-ring*perRing);
  const angle=clusterAngle(`${anchorId}:${ring}`,local,count),radius=baseRadius+ring*6;
  const rawX=clamp(anchorX+Math.cos(angle)*radius),rawY=clamp(anchorY+Math.sin(angle)*radius*.7);
  const placed=collisionPush(rawX,rawY,occupied,child.level==='detail'?7:9);
  appended.push({...node,parentId:node.parentId===childRootId||!node.parentId?anchorId:node.parentId,x:placed.x,y:placed.y,z:(node.z??0)+ring*.08});
  occupied.push(placed);existing.add(node.id);
 }
 const edgeIds=new Set(parent.edges.map(edge=>edge.id));
 const nodeIds=new Set([...parent.nodes,...appended].map(node=>node.id));
 const edges=[...parent.edges];
 for(const edge of child.edges||[]){
  const source=edge.source===childRootId?anchorId:edge.source;
  const target=edge.target===childRootId?anchorId:edge.target;
  if(source===target||!nodeIds.has(source)||!nodeIds.has(target))continue;
  const baseId=`branch:${anchorId}:${edge.id}`;let id=baseId,index=2;while(edgeIds.has(id))id=`${baseId}:${index++}`;
  edgeIds.add(id);edges.push({...edge,id,source,target,declared:true});
 }
 return {...parent,nodes:[...parent.nodes,...appended],edges};
}
