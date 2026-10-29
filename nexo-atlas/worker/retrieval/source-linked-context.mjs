import {assert,cmp} from './integrity.mjs';
import {walkGraph} from './graph.mjs';

/** Explicit interpretation/evidence requests supplement the exact identities
 * with direct source assertions. Text ranks visible neighbors but never creates
 * a relation, selects a hidden node, or establishes scientific independence.
 * A shared campaign/hypothesis cannot introduce its other tests at two hops.
 */
export async function sourceLinkedCandidates(view,seeds,eligible,lexicalRrf) {
  const roots=[...seeds].sort(cmp);assert(roots.length>0&&roots.length<=2,'GRAPH_QUERY_REQUIRES_AT_MOST_TWO_ENTITIES');
  const paths=new Map(),visited=new Set(),unresolved=new Set();let truncated=false;
  for(const root of roots)paths.set(root,{seed:root,distance:0,edges:[],provenance:'explicit_canonical_fields_only'});
  const compareEdges=(a,b)=>cmp(a.source,b.source)||cmp(a.target,b.target)||cmp(a.relation,b.relation)||cmp(a.pointer,b.pointer);
  for(const root of roots){
    const graph=await walkGraph(view,root,{depth:1,direction:'both',relation:null,limit:200});
    truncated=truncated||graph.truncated;for(const node of graph.nodes)visited.add(node.id);
    for(const field of graph.unresolved_source_fields)unresolved.add(JSON.stringify([field.source,field.pointer,field.reason]));
    for(const edge of [...graph.edges].sort(compareEdges)){
      const uid=edge.source===root?edge.target:edge.source;
      if(!paths.has(uid))paths.set(uid,{seed:root,distance:1,edges:[edge],provenance:'explicit_canonical_fields_only'});
    }
  }
  const identities=new Set(roots),ordered=[...paths.keys()].filter(uid=>eligible.has(uid))
    .sort((a,b)=>Number(identities.has(b))-Number(identities.has(a))||
      (identities.has(a)&&identities.has(b)?cmp(a,b):(lexicalRrf.get(b)||0)-(lexicalRrf.get(a)||0)||cmp(a,b)));
  const scores=new Map(),selectedPaths=new Map();
  ordered.forEach((uid,i)=>{scores.set(uid,1/(i+1));selectedPaths.set(uid,{...paths.get(uid),structural_rank:i+1});});
  return {scores,paths:selectedPaths,summary:{strategy:'bounded_source_linked_context',truncated,witness_complete:!truncated,
    visited_authorized_nodes:visited.size,result_order:'exact_identities_then_linked_lexical_then_canonical_id',generated_edges:0,
    scientific_independence:'NOT_ESTABLISHED',unresolved_source_field_count:unresolved.size,
    context_scope:'direct_authorized_source_assertions_only',exhaustive_review_context:false,
    context_completeness:truncated||unresolved.size?'BOUNDED_OR_UNRESOLVED':'RESOLVED_DIRECT_AUTHORIZED_LINKS'}};
}
