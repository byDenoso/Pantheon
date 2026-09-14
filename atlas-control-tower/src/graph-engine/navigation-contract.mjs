const HIERARCHICAL_TYPES=new Set(['CONTAINS','PARENT_OF','HAS_CHILD']);

const nonNegativeCount=value=>{
 const number=Number(value);
 return Number.isFinite(number)&&number>=0?Math.floor(number):null;
};

export function deriveGraphNavigation(nodes=[],edges=[]){
 const counts=new Map(nodes.map(node=>[String(node.id),0]));
 for(const edge of edges){
  if(!HIERARCHICAL_TYPES.has(String(edge?.type||'').toUpperCase()))continue;
  const source=String(edge?.source||'');
  if(counts.has(source))counts.set(source,(counts.get(source)||0)+1);
 }
 return new Map(nodes.map(node=>{
  const explicit=nonNegativeCount(node?.childCount??node?.metadata?.childCount);
  const childCount=explicit??(counts.get(String(node.id))||0);
  return [String(node.id),{childCount,expandable:childCount>0}];
 }));
}

export function graphNodeNavigation(node,navigation){
 const derived=navigation?.get?.(String(node?.id||''));
 const childCount=nonNegativeCount(node?.childCount)??derived?.childCount??0;
 return {childCount,expandable:node?.expandable===true||childCount>0};
}
