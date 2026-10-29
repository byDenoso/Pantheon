/** Only authorized explicit source edges. No model inference or text-made links. */
import {assert,cmp,LIMITS,utf8} from './integrity.mjs';
export const RELATIONS=new Set(['tests_hypothesis','for_test','derived_from','contests','has_contest','uses_recipe','uses_binding','uses_dataset','has_run','has_result','has_artifact','supported_by','for_work','in_campaign','depends_on','supersedes','superseded_by','contradicts','confirms','references']);
export function citation(view,d) {return {canonical_id:d.uid,object_id:d.object_id,path:d.path,json_pointer:d.pointer,
  entity_version:d.version,content_sha256:d.content_hash,source_id:view.manifest.snapshot.source_id,tower_revision:view.manifest.snapshot.revision};}
export async function documents(view,ids) {
  const rows=await view.getMany('document',ids);
  for(const uid of ids){const d=rows.get(uid);assert(d&&d.uid===uid&&view.scope.has(uid)&&d.content_hash===view.scope.get(uid),'DOCUMENT_SCOPE_INVALID');}
  return rows;
}
const edgeId=e=>JSON.stringify([e.source,e.target,e.relation,e.pointer,e.origin]);
export function validateGraphShard(view,uid,data) {
  assert(data&&Array.isArray(data.edges)&&Array.isArray(data.unresolved_source_fields),'GRAPH_SHARD_INVALID');
  assert(data.edges.length<=view.manifest.edge_count&&data.unresolved_source_fields.length<=LIMITS.graphFields,'GRAPH_RESOURCE_BOUND');
  const seen=new Set();
  for(const e of data.edges){
    assert(e&&view.scope.has(e.source)&&view.scope.has(e.target)&&(e.source===uid||e.target===uid)&&
      Object.keys(e).every(k=>['source','target','relation','pointer','origin'].includes(k))&&RELATIONS.has(e.relation)&&e.origin==='explicit_source_field'&&typeof e.pointer==='string'&&e.pointer.startsWith('/'),'GRAPH_SCOPE_INVALID');
    const id=edgeId(e);assert(!seen.has(id),'GRAPH_DUPLICATE_INVALID');seen.add(id);
  }
  for(const f of data.unresolved_source_fields)assert(f&&f.source===uid&&typeof f.pointer==='string'&&f.pointer.startsWith('/')&&
    f.reason==='UNRESOLVED_IN_AUTHORIZED_INDEX'&&Object.keys(f).every(k=>['source','pointer','reason'].includes(k)),'GRAPH_UNRESOLVED_INVALID');
  return data;
}
export function validateTraceRequest(input,operation='trace') {
  assert(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_RETRIEVAL_REQUEST');
  const allowed=operation==='neighbors'?['entity','direction','relation','limit']:['entity','depth','direction','relation','limit'];
  assert(Object.keys(input).every(k=>allowed.includes(k)),'UNSUPPORTED_RETRIEVAL_OPTIONS');
  const {entity,direction='both',relation=null,limit=100}=input,depth=operation==='neighbors'?1:input.depth??4;
  assert(typeof entity==='string'&&entity.length>0&&Array.from(entity).length<=LIMITS.queryCodepoints&&utf8(entity).length<=LIMITS.queryBytes,'INVALID_ENTITY');
  assert(Number.isInteger(depth)&&depth>=0&&depth<=6&&Number.isInteger(limit)&&limit>=1&&limit<=200,'GRAPH_TRAVERSAL_BOUNDS');
  assert(['in','out','both'].includes(direction)&&(relation===null||RELATIONS.has(relation)),'INVALID_GRAPH_OPTIONS');
  return {entity,depth,direction,relation,limit};
}
export async function walkGraph(view,root,{depth,direction,relation,limit}) {
  assert(view.scope.has(root),'ENTITY_NOT_FOUND_OR_NOT_AUTHORIZED');
  const visited=new Map([[root,0]]),queue=[root],used=new Map(),unresolved=[];let truncated=false,edgeVisits=0;
  for(let cursor=0;cursor<queue.length;cursor++){
    const uid=queue[cursor];if(visited.get(uid)===depth)continue;
    const row=validateGraphShard(view,uid,await view.get('graph',uid));
    for(const edge of row.edges){
      if(relation&&edge.relation!==relation)continue;
      const entries=[];
      if(['out','both'].includes(direction)&&edge.source===uid)entries.push(edge.target);
      if(['in','both'].includes(direction)&&edge.target===uid)entries.push(edge.source);
      for(const neighbor of entries){
        assert(++edgeVisits<=LIMITS.graphEdgeVisits,'GRAPH_RESOURCE_BOUND');
        if(!visited.has(neighbor)&&visited.size>=limit){truncated=true;continue;}
        if(!visited.has(neighbor)){visited.set(neighbor,visited.get(uid)+1);queue.push(neighbor);}
        used.set(edgeId(edge),edge);
      }
    }
  }
  // Even depth-boundary nodes contribute unresolved pointers in the Python API.
  const graphRows=await view.getMany('graph',[...visited.keys()]);
  for(const uid of visited.keys())unresolved.push(...validateGraphShard(view,uid,graphRows.get(uid)).unresolved_source_fields);
  const docs=await documents(view,[...visited.keys()]);
  const nodes=[...visited].map(([uid,distance])=>{const d=docs.get(uid);return {id:uid,title:d.title,kind:d.kind,state:d.state,distance,citation:citation(view,d)};});
  const edges=[];let responseBytes=utf8(JSON.stringify(nodes)).length+utf8(JSON.stringify(unresolved)).length;
  for(const e of used.values()){
    const item={...e,citation:{...citation(view,docs.get(e.source)),json_pointer:e.pointer}};
    responseBytes+=utf8(JSON.stringify(item)).length;assert(responseBytes<=LIMITS.responseBytes,'RESPONSE_RESOURCE_BOUND');edges.push(item);
  }
  return {root,nodes,edges,truncated,unresolved_source_fields:unresolved,
    completeness:truncated||unresolved.length?'BOUNDED_OR_UNRESOLVED':'RESOLVED_WITHIN_AUTHORIZED_INDEX',
    semantics:'explicit_source_assertions; not inferred_causality',snapshot:view.manifest.snapshot};
}
export async function structuralCandidates(view,seeds,eligible,route) {
  const roots=[...seeds].sort(cmp);assert(roots.length<=2,'GRAPH_QUERY_REQUIRES_AT_MOST_TWO_ENTITIES');
  const graph=await walkGraph(view,roots[0],{depth:roots.length===2?6:2,direction:'both',relation:null,limit:200});
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),adjacency=new Map();
  const append=(u,v,e)=>{if(!adjacency.has(u))adjacency.set(u,[]);adjacency.get(u).push([v,e]);};
  for(const e of graph.edges){append(e.source,e.target,e);append(e.target,e.source,e);}
  const parents=new Map(),visited=new Set([roots[0]]),queue=[roots[0]];
  for(let i=0;i<queue.length;i++){const u=queue[i];for(const [neighbor,edge]of (adjacency.get(u)??[]).sort((a,b)=>cmp(a[0],b[0])||cmp(a[1].pointer,b[1].pointer))){
    if(!visited.has(neighbor)){visited.add(neighbor);parents.set(neighbor,[u,edge]);queue.push(neighbor);}
  }}
  let selected=new Set(nodes.keys()),complete=!graph.truncated;
  if(roots.length===2){selected=new Set();if(visited.has(roots[1])){let cursor=roots[1];selected.add(cursor);
    while(cursor!==roots[0]){cursor=parents.get(cursor)[0];selected.add(cursor);}}complete=selected.size>0;}
  const kinds=route.target_kinds??[];
  const generic=uid=>{let cursor=uid,count=0;while(cursor!==roots[0]){const [parent,e]=parents.get(cursor);if(['references','in_campaign'].includes(e.relation))count++;cursor=parent;}return count;};
  const ordered=[...selected].filter(u=>eligible.has(u)&&(!kinds.length||kinds.includes(nodes.get(u).kind)))
    .sort((a,b)=>nodes.get(a).distance-nodes.get(b).distance||generic(a)-generic(b)||cmp(a,b));
  const paths=new Map(),scores=new Map();
  ordered.forEach((uid,i)=>{let cursor=uid;const edges=[];while(cursor!==roots[0]){const [parent,e]=parents.get(cursor);edges.push(e);cursor=parent;}
    paths.set(uid,{seed:roots[0],distance:nodes.get(uid).distance,structural_rank:i+1,edges:edges.reverse(),provenance:'explicit_canonical_fields_only'});scores.set(uid,1/(i+1));});
  return {scores,paths,summary:{strategy:'bounded_explicit_graph',truncated:graph.truncated,witness_complete:complete,
    visited_authorized_nodes:nodes.size,result_order:'hop_count_then_typed_edges_then_canonical_id',generated_edges:0}};
}
export async function traceView(view,input,operation='trace') {
  const request=validateTraceRequest(input,operation);await view.metadata();
  const choices=await view.get('alias',request.entity);assert(choices?.length===1&&view.scope.has(choices[0]),'ENTITY_NOT_FOUND_OR_NOT_AUTHORIZED');
  const result=await walkGraph(view,choices[0],request);assert(utf8(JSON.stringify(result)).length<=LIMITS.responseBytes,'RESPONSE_RESOURCE_BOUND');return result;
}
