export function pointerParallaxTarget(x,y,width,height){
  const w=Math.max(1,width),h=Math.max(1,height);
  const nx=Math.max(-1,Math.min(1,(x/w-.5)*2));
  const ny=Math.max(-1,Math.min(1,(y/h-.5)*2));
  return {yaw:Number((nx*.16).toFixed(3)),pitch:Number((ny*.11).toFixed(3))};
}

export function isNavigableNode(node,graph,focusId){
  if(!node?.id||node.id===focusId)return false;
  return (graph?.edges||[]).some(edge=>edge.source===node.id||edge.target===node.id);
}
