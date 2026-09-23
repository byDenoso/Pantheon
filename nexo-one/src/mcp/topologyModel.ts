import type {AtlasCrossLink,AtlasMetroModel,AtlasMetroNode} from '../atlas3d/atlasAdapter.ts';

export type NodeKind='ROOT'|'LAYER'|'TRANSPORT'|'TOOL'|'FAMILY'|'CAPABILITY'|'BACKEND'|'ROLE';
export type TopologyNode={
  id:string;label:string;kind:NodeKind;group:string;status:string;summary?:string;
  meta?:Record<string,unknown>;
};
export type TopologyLink={id:string;source:string|TopologyNode;target:string|TopologyNode;kind:string;weight:number};
export type Topology={
  contract:string;generated_at:string;
  source:{authority:string;repository:string;commit:string;manifest:string;mcp_server:string;remote_mcp:string;source_storage?:string;source_snapshot_id?:string;source_state_fingerprint?:string;source_promoted_at?:string;projection_fingerprint?:string};
  stats:{tools:number;remote_tools:number;internal_tools:number;capabilities:number;backends:number;roles:number;families:number;status_counts:Record<string,number>;backend_counts:Record<string,number>};
  nodes:TopologyNode[];links:TopologyLink[];
};
export type TopologyViewMode='all'|'tools'|'capabilities'|'runtime'|'roles';

export const idOf=(value:string|TopologyNode)=>typeof value==='string'?value:value.id;

export function kindLabel(kind:NodeKind){
  return ({ROOT:'MCP',LAYER:'Camada',TRANSPORT:'Transporte',TOOL:'Tool',FAMILY:'Família',CAPABILITY:'Capability',BACKEND:'Runtime',ROLE:'Papel'} as Record<NodeKind,string>)[kind];
}

const modeKinds:Record<TopologyViewMode,NodeKind[]>={
  all:['ROOT','LAYER','TRANSPORT','TOOL','FAMILY','CAPABILITY','BACKEND','ROLE'],
  tools:['ROOT','LAYER','TRANSPORT','TOOL'],
  capabilities:['ROOT','LAYER','FAMILY','CAPABILITY','BACKEND','ROLE'],
  runtime:['ROOT','LAYER','CAPABILITY','BACKEND'],
  roles:['ROOT','LAYER','FAMILY','CAPABILITY','ROLE'],
};

export function allowedInMode(node:TopologyNode,mode:TopologyViewMode){
  return modeKinds[mode].includes(node.kind);
}
export function nodeMatches(node:TopologyNode,query:string){
  if(!query)return true;
  const haystack=[node.label,node.id,node.kind,node.group,node.status,node.summary||'']
    .join(' ').toLowerCase();
  return haystack.includes(query);
}
export function matchRank(node:TopologyNode,query:string){
  const label=node.label.toLowerCase();
  const id=node.id.toLowerCase();
  if(label===query)return 0;
  if(id===query)return 1;
  if(label.startsWith(query))return 2;
  if(id.startsWith(query))return 3;
  return 4;
}
function topologySignature(topology:Topology){
  return topology.source.projection_fingerprint
    ||[topology.source.commit,topology.generated_at,topology.nodes.length,topology.links.length].join('|');
}
function systemDepth(kind:NodeKind):number{
  return ({ROOT:0,LAYER:1,TRANSPORT:1,TOOL:1,FAMILY:2,CAPABILITY:2,BACKEND:3,ROLE:4} as Record<NodeKind,number>)[kind]??1;
}
function systemEntityType(kind:NodeKind):AtlasMetroNode['entityType']{
  return kind==='BACKEND'?'RUNTIME':kind;
}

export function systemGraphModel(topology:Topology,mode:TopologyViewMode='all',search=''):AtlasMetroModel{
  const query=search.trim().toLowerCase();
  const allowed=topology.nodes.filter(node=>allowedInMode(node,mode));
  const allowedIds=new Set(allowed.map(node=>node.id));
  let included=new Set(allowedIds);
  if(query){
    const matched=new Set(allowed.filter(node=>nodeMatches(node,query)).map(node=>node.id));
    included=new Set(matched);
    for(const link of topology.links){
      const source=idOf(link.source),target=idOf(link.target);
      if(!allowedIds.has(source)||!allowedIds.has(target))continue;
      if(matched.has(source)||matched.has(target)){included.add(source);included.add(target);}
    }
  }
  const rootId='nexo.system.root';
  const visible=allowed.filter(node=>included.has(node.id));
  const relationCounts=new Map<string,number>();
  const links=topology.links.filter(link=>included.has(idOf(link.source))&&included.has(idOf(link.target)));
  for(const link of links){
    relationCounts.set(idOf(link.source),(relationCounts.get(idOf(link.source))||0)+1);
    relationCounts.set(idOf(link.target),(relationCounts.get(idOf(link.target))||0)+1);
  }
  const root:AtlasMetroNode={
    id:rootId,sourceId:null,name:'Sistema',domain:'NEXO',parentId:null,entityType:'ROOT',status:'LIVE',
    summary:'Topologia MCP publicada.',depth:0,childCount:visible.length,descendantCount:visible.length,
    relationCount:visible.length,mix:50,updatedAt:topology.generated_at,sourceRevision:topology.source.commit||null,
    fingerprint:topology.source.projection_fingerprint||null,authorityClass:topology.source.authority||null,
    sourceRef:null,sourceLinks:[],temporal:[],synthetic:true,
  };
  const nodes:AtlasMetroNode[]=[root,...visible.map(node=>({
    id:node.id,sourceId:node.id,name:node.label,domain:'NEXO' as const,parentId:rootId,entityType:systemEntityType(node.kind),
    status:node.status,summary:node.summary||kindLabel(node.kind),depth:systemDepth(node.kind),childCount:0,descendantCount:0,
    relationCount:relationCounts.get(node.id)||0,mix:50,updatedAt:topology.generated_at,sourceRevision:topology.source.commit||null,
    fingerprint:topology.source.projection_fingerprint||null,authorityClass:topology.source.authority||null,
    sourceRef:null,sourceLinks:[],temporal:[],synthetic:false,
  }))];
  const nodeMap=new Map(nodes.map(node=>[node.id,node]));
  const childrenMap=new Map<string,string[]>([[rootId,visible.map(node=>node.id)]]);
  for(const node of visible)childrenMap.set(node.id,[]);
  const crossLinks:AtlasCrossLink[]=links.map(link=>({
    id:link.id,source:idOf(link.source),target:idOf(link.target),label:link.kind,kind:link.kind,weight:Number(link.weight||1),
    aggregated:false,isLearning:false,learningScope:null,learningRef:null,learningKind:null,learningGroup:null,learningTheme:null,
    learningBasis:null,sourceAnchor:null,targetAnchor:null,bundleIndex:0,bundleCount:1,
  }));
  return {
    revision:[topologySignature(topology),mode,query].join('|'),generatedAt:topology.generated_at,roots:[rootId],nodes,nodeMap,
    childrenMap,crossLinks,sourceNodeIds:new Set(nodes.map(node=>node.id)),
  };
}
