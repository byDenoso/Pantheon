const edgeKey=edge=>edge?.id||`${edge?.source}->${edge?.target}:${edge?.kind||edge?.type||''}`;
const alternative=edge=>Boolean(edge?.associative||edge?.alternative||String(edge?.kind||edge?.type||'').toLowerCase().startsWith('alternative'));

function buildIndexes(graph){
 const byId=new Map((graph?.nodes||[]).map(node=>[node.id,node]));
 const children=new Map();
 for(const node of graph?.nodes||[])if(node.parentId&&!node.overlayOnly){const list=children.get(node.parentId)||[];list.push(node);children.set(node.parentId,list)}
 return{byId,children};
}

export function focusTunnel(graph,selectedId){
 const nodeIds=new Set();
 const edgeIds=new Set();
 if(!graph||!selectedId)return Object.freeze({active:false,nodeIds,edgeIds,dimAlpha:.14});
 const {byId,children}=buildIndexes(graph);
 const selected=byId.get(selectedId);
 if(!selected)return Object.freeze({active:false,nodeIds,edgeIds,dimAlpha:.14});
 nodeIds.add(selectedId);
 let cur=selected;let guard=0;
 while(cur&&guard++<32){nodeIds.add(cur.id);cur=cur.parentId?byId.get(cur.parentId):null}
 for(const child of children.get(selectedId)||[])nodeIds.add(child.id);
 for(const edge of graph.edges||[]){
  const incident=edge.source===selectedId||edge.target===selectedId;
  if(!incident)continue;
  edgeIds.add(edgeKey(edge));
  nodeIds.add(edge.source);nodeIds.add(edge.target);
  if(alternative(edge)){
   const source=byId.get(edge.source),target=byId.get(edge.target);
   if(source?.overlayOnly)nodeIds.add(source.id);
   if(target?.overlayOnly)nodeIds.add(target.id);
  }
 }
 for(const edge of graph.edges||[]){
  if(nodeIds.has(edge.source)&&nodeIds.has(edge.target))edgeIds.add(edgeKey(edge));
 }
 return Object.freeze({active:true,nodeIds,edgeIds,dimAlpha:.14,selectedId});
}

export function focusAlphaForNode(tunnel,nodeId){
 if(!tunnel?.active)return 1;
 return tunnel.nodeIds.has(nodeId)?1:tunnel.dimAlpha;
}

export function focusAlphaForEdge(tunnel,edge){
 if(!tunnel?.active)return 1;
 return tunnel.edgeIds.has(edgeKey(edge))?1:tunnel.dimAlpha;
}

export {edgeKey as focusEdgeKey};
