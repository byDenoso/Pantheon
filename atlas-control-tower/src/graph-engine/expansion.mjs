const clamp=(value,min=4,max=96)=>Math.max(min,Math.min(max,value));

/**
 * Merge a child graph into the current graph without replacing the renderer.
 * The child's focus/root is folded into the clicked anchor so the new nodes
 * appear as ramifications of the node the user touched.
 */
export function graftProjection(parent,anchorId,child){
  const anchor=parent?.nodes?.find?.(node=>node.id===anchorId);
  if(!anchor||!child?.nodes?.length)return parent;

  const childRootId=child.focusId||child.nodes[0]?.id||null;
  const childRoot=child.nodes.find(node=>node.id===childRootId)||null;
  const originX=childRoot?.x??50;
  const originY=childRoot?.y??50;
  const anchorX=anchor.x??50;
  const anchorY=anchor.y??50;
  const scale=child.level==='detail'?0.62:0.72;
  const existing=new Set(parent.nodes.map(node=>node.id));
  const appended=[];

  for(const node of child.nodes){
    if(node.id===childRootId||existing.has(node.id))continue;
    const x=clamp(anchorX+((node.x??50)-originX)*scale);
    const y=clamp(anchorY+((node.y??50)-originY)*scale);
    appended.push({...node,parentId:node.parentId===childRootId||!node.parentId?anchorId:node.parentId,x,y});
    existing.add(node.id);
  }

  const edgeIds=new Set(parent.edges.map(edge=>edge.id));
  const nodeIds=new Set([...parent.nodes,...appended].map(node=>node.id));
  const edges=[...parent.edges];
  for(const edge of child.edges||[]){
    const source=edge.source===childRootId?anchorId:edge.source;
    const target=edge.target===childRootId?anchorId:edge.target;
    if(source===target||!nodeIds.has(source)||!nodeIds.has(target))continue;
    const baseId=`branch:${anchorId}:${edge.id}`;
    let id=baseId,index=2;
    while(edgeIds.has(id))id=`${baseId}:${index++}`;
    edgeIds.add(id);
    edges.push({...edge,id,source,target,declared:true});
  }

  return {...parent,nodes:[...parent.nodes,...appended],edges};
}
