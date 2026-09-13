import type {AtlasEdge,AtlasGraph,AtlasNode} from '../scene/types';
import type {GraphContext,GraphEdge,GraphLevel,GraphNavigationKind,GraphNode,GraphProjection} from './types';

const HIERARCHY=new Set(['CONTAINS','PARENT_OF','HAS_CHILD','TESTS','PRODUCES','EXECUTED_AS','DERIVED_FROM','IMPLEMENTS','REPORTS_ON']);
const text=(value:unknown,fallback='')=>String(value??fallback);
const edgeType=(edge:AtlasEdge)=>text(edge.type,'RELATED').toUpperCase();
const levelFor=(focusId:string,pathLength:number):GraphLevel=>focusId==='system:NEXO'?'atlas':pathLength<=2?'domain':pathLength===3?'subgraph':pathLength===4?'entity':'detail';

function graphNode(node:AtlasNode):GraphNode{
 return {
  ...node,
  id:text(node.id),label:text(node.label,node.id),type:text(node.type,'ENTITY'),domain:node.domain?text(node.domain):null,
  status:node.status==null?null:text(node.status),summary:node.summary==null?null:text(node.summary),
  parentId:typeof node.parentId==='string'?node.parentId:null,
  importance:typeof node.importance==='number'?node.importance:typeof node.priority==='number'?node.priority:null,
  confidence:typeof node.confidence==='number'?node.confidence:null,
  freshness:node.freshness==null?null:text(node.freshness),updatedAt:node.updatedAt==null?null:text(node.updatedAt),
  capabilities:Array.isArray(node.capabilities)?node.capabilities.map(String):undefined
 };
}

function graphEdge(edge:AtlasEdge,index:number):GraphEdge{
 return {
  id:text(edge.id,`${edge.source}:${edgeType(edge)}:${edge.target}:${index}`),source:text(edge.source),target:text(edge.target),type:edgeType(edge),declared:true,
  direction:edge.direction==='backward'||edge.direction==='bidirectional'?'bidirectional':'forward',
  strength:typeof edge.strength==='number'?edge.strength:null,
  metadata:{authority:edge.authority??null}
 };
}

export function buildLiveProjection({graph,focusId,path,pins=[],compare=[]}:{graph:AtlasGraph;focusId:string;path:Array<{id:string;label?:string}>;pins?:string[];compare?:string[]}):GraphProjection{
 const byId=new Map(graph.nodes.map(node=>[node.id,node]));
 const edges=graph.edges.map(graphEdge);
 const hierarchyChildren=new Set<string>();
 const portalIds=new Set<string>();
 for(const edge of graph.edges){
  const type=edgeType(edge);const touches=edge.source===focusId||edge.target===focusId;if(!touches)continue;
  const other=edge.source===focusId?edge.target:edge.source;
  if(HIERARCHY.has(type)&&edge.source===focusId)hierarchyChildren.add(other);
  else if(!HIERARCHY.has(type))portalIds.add(other);
 }
 const ancestorIds=new Set(path.slice(0,-1).map(item=>item.id));
 const seen=new Set<string>();
 const nodes:GraphNode[]=[];
 for(const raw of graph.nodes){
  const node=graphNode(raw);seen.add(node.id);
  if(node.id===focusId)nodes.push({...node,contextRole:'current',navigationKind:'drill-down',z:0});
  else if(ancestorIds.has(node.id))nodes.push({...node,contextRole:'ancestor',navigationKind:'restore',z:-120});
  else if(portalIds.has(node.id))nodes.push({...node,contextRole:'portal',navigationKind:'cross-domain',z:60});
  else if(pins.includes(node.id))nodes.push({...node,contextRole:'pinned',navigationKind:'drill-down',z:30});
  else if(hierarchyChildren.has(node.id))nodes.push({...node,contextRole:'primary',navigationKind:'drill-down',z:20});
  else nodes.push({...node,contextRole:'secondary',navigationKind:'drill-down',z:40});
 }
 path.slice(0,-1).forEach((item,index)=>{
  if(seen.has(item.id))return;
  nodes.push({id:item.id,label:item.label||item.id,type:'ANCESTOR',contextRole:'ancestor',navigationKind:'restore',syntheticContext:true,z:-140-(path.length-index)*24});
 });
 const breadcrumbs:GraphContext[]=path.map((item,index)=>({id:item.id,label:item.label||item.id,path:`/${path.slice(0,index+1).map(part=>encodeURIComponent(part.id)).join('/')}`}));
 const selectedCompare=new Set(compare);
 for(const node of nodes)if(selectedCompare.has(node.id))node.metrics={...(node.metrics||{}),compare:true};
 const focus=byId.get(focusId);
 const freshness=focus?.freshness==null?null:text(focus.freshness);
 const navigationKind:GraphNavigationKind=portalIds.has(focusId)?'cross-domain':'drill-down';
 return {
  id:`live:${focusId}`,version:'spatial-v2',level:levelFor(focusId,path.length),focusId,nodes,edges,breadcrumbs,
  capabilities:{drillDown:true,learning:false,provenance:true,search:true,compare:true,pin:true,relations:true},freshness,navigationKind
 };
}
