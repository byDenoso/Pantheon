// Colour identity of the map.
//
// Each Domain owns a hue, and everything orbiting it inherits that hue: its Programs,
// its Campaigns, and the filaments that tie them back to the core. Colour therefore
// answers "which part of the system am I looking at" at a glance, and it never
// encodes state — status lives in the tone dots, badges and the cockpit, so a colour
// can be read the same way whether a branch is healthy or blocked.
//
// Hues are assigned by the Domain's position in the SSOT, so the map keeps the same
// colours between reloads and a new Domain never repaints the existing ones.

export const CORE_HUE='#FFB545';

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
 * Writes `hue` onto every node: the core keeps the star colour, each Domain takes the
 * next hue in the ramp, and deeper levels inherit from the Domain above them.
 * Returns the graph so it can be chained after rowsToGraph.
 */
export function assignIdentityColors(graph){
 const nodes=graph?.nodes||[];
 const byId=new Map(nodes.map(node=>[node.id,node]));
 let index=0;
 for(const node of nodes){
  if(node.id===graph.rootId){node.hue=CORE_HUE;continue}
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

/** The Domains in ring order, with their hue — the legend the map is drawn from. */
export function domainLegend(graph){
 return (graph?.nodes||[])
  .filter(node=>node.hierarchyLevel==='domain')
  .map(node=>({id:node.id,label:node.label,recordId:node.recordId,hue:node.hue,system:node.system}));
}
