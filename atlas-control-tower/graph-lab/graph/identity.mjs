// Colour identity of the map.
//
// Each canonical Domain owns a hue and descendants inherit it. Associative-memory
// nodes are transverse overlays, not descendants, so they receive their own stable
// learning hues without consuming a Domain slot or pretending to be a fourth lane.

export const CORE_HUE='#FFB545';
export const SEMANTIC_MEMORY_HUE='#AF8DFF';
export const PROCEDURAL_MEMORY_HUE='#66D6FF';
export const ASSOCIATIVE_REFERENCE_HUE='#70859A';

export const DOMAIN_HUES=[
 '#4DA3FF', // azure
 '#A78BFA', // violet
 '#FB7185', // rose
 '#22D3EE', // cyan
 '#818CF8', // indigo
 '#FBBF24', // amber
 '#34D399', // emerald
 '#F472B6', // pink
 '#5EEAD4', // aqua
 '#C084FC'  // purple
];

export const hueForIndex=index=>DOMAIN_HUES[((index%DOMAIN_HUES.length)+DOMAIN_HUES.length)%DOMAIN_HUES.length];

/**
 * Writes `hue` onto every node. Canonical hierarchy hue semantics remain unchanged;
 * overlay memory uses a separate visual vocabulary and never changes Domain order.
 */
export function assignIdentityColors(graph){
 const nodes=graph?.nodes||[];
 const byId=new Map(nodes.map(node=>[node.id,node]));
 let index=0;
 for(const node of nodes){
  if(node.id===graph.rootId){node.hue=CORE_HUE;continue}
  if(node.overlayOnly){
   node.hue=node.kind==='SEMANTIC_MEMORY'?SEMANTIC_MEMORY_HUE:node.kind==='PROCEDURAL_MEMORY'?PROCEDURAL_MEMORY_HUE:ASSOCIATIVE_REFERENCE_HUE;
   continue;
  }
  if(node.hierarchyLevel==='domain')node.hue=hueForIndex(index++);
 }
 for(const node of nodes){
  if(node.hue)continue;
  let ancestor=byId.get(node.parentId);
  let guard=0;
  while(ancestor&&!ancestor.hue&&guard++<16)ancestor=byId.get(ancestor.parentId);
  node.hue=ancestor?.hue||CORE_HUE;
 }
 return graph;
}

/** The canonical Domains in ring order; overlay memory never enters the Domain legend. */
export function domainLegend(graph){
 return (graph?.nodes||[])
  .filter(node=>node.hierarchyLevel==='domain'&&!node.overlayOnly)
  .map(node=>({id:node.id,label:node.label,recordId:node.recordId,hue:node.hue,system:node.system}));
}
