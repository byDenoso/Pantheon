import {tokens,fold,pythonStrip,pureNumber,pythonPattern} from './tokenizer.mjs';
import {assert,cmp,LIMITS,utf8,ENGINE_VERSION,CHUNKER,ENGINE_CODE} from './integrity.mjs';

import {identifyQuery,dateQuery,temporalCues,SEARCH_POLICY} from './query-router.mjs';
import {structuralCandidates,walkGraph,documents as graphDocuments} from './graph.mjs';
import {sourceLinkedCandidates} from './source-linked-context.mjs';

export function validateRequest(input) {
  assert(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_RETRIEVAL_REQUEST');
  assert(Object.keys(input).every(key=>['query','k','mode'].includes(key)),'UNSUPPORTED_RETRIEVAL_OPTIONS');
  const {query,k=8,mode='auto'}=input;
  assert(typeof query==='string'&&Array.from(query).length<=LIMITS.queryCodepoints&&utf8(query).length<=LIMITS.queryBytes,'INVALID_QUERY');
  assert(Number.isInteger(k)&&k>=1&&k<=50,'INVALID_TOP_K');
  assert(['auto','exact','lexical','graph'].includes(mode),'UNSUPPORTED_RETRIEVAL_MODE');return {query,k,mode};
}
const signedUrl=pythonPattern('(https?://(?:(?!\\?)\\S)+)\\?\\S+','giu');
const bearer=pythonPattern('bearer\\s+[A-Za-z0-9\\u0130\\u0131._~-]+','giu');
const cleanQuery=q=>q.replace(signedUrl,'$1?[query-redacted]').replace(bearer,'Bearer [redacted]');

/** Current hardened 1.3 query modes; the server selects a trusted authorized view. */
export async function searchCurrentView(view,input) {
  const start=performance.now(),{query,k,mode}=validateRequest(input),m=view.manifest;
  const terms=[...new Set(tokens(query))];
  assert(terms.length<=LIMITS.terms,'QUERY_RESOURCE_BOUND');
  // Auto date and changed-state semantics require retained observations, including
  // inactive entities. Never silently answer those questions from the active view.
  if(mode==='auto')assert(!dateQuery.test(fold(query))&&!temporalCues.some(c=>fold(query).includes(c)),'HISTORICAL_QUERY_UNSUPPORTED');
  const meta=await view.metadata(),authorized=new Set(meta.scope.map(([uid])=>uid));
  const {identified,route}=await identifyQuery(view,query,authorized),effective=mode==='auto'?route.mode:mode;
  assert(effective!=='temporal','HISTORICAL_QUERY_UNSUPPORTED');
  const exact=new Set(identified);
  if(!(mode==='auto'&&route.reason==='explicit_current_version_identity')){
    const titles=await view.get('title',fold(pythonStrip(query)));
    for(const uid of titles??[]){assert(authorized.has(uid),'EXACT_SCOPE_INVALID');exact.add(uid);}
  }
  // The Python opt-in graph mode needs LSA when no exact identity is present.
  assert(effective!=='graph'||exact.size>0,'GRAPH_ENTITY_REQUIRED');
  const number=pureNumber(query),numberDocs=number===null?null:await view.get('number',number);
  const eligible=number===null?authorized:new Set(numberDocs??[]);
  for(const uid of eligible)assert(authorized.has(uid),'NUMBER_SCOPE_INVALID');
  const termRows=await view.getMany('term',terms),scores=new Map();let pairs=0;
  for(const term of terms){const p=termRows.get(term);if(!p)continue;
    assert(Array.isArray(p.rows)&&Number.isInteger(p.df)&&p.df===p.rows.length&&p.df<=m.size,'POSTINGS_DF_INVALID');
    pairs+=p.df;assert(pairs<=LIMITS.postingPairs,'QUERY_RESOURCE_BOUND');
    const idf=Math.log(1+(m.size-p.df+0.5)/(p.df+0.5));let previous=-1;
    for(const [n,freq] of p.rows){
      assert(Number.isInteger(n)&&n>=0&&n<m.size&&n>previous&&Number.isInteger(freq)&&freq>0,'POSTINGS_INVALID');previous=n;
      const value=idf*freq*2.2/(freq+1.2*(0.25+0.75*meta.lengths[n]/(m.average||1)));
      scores.set(n,(scores.get(n)||0)+value);
    }
  }
  const rowIds=meta.chunks.map((c,n)=>eligible.has(c.uid)?n:-1).filter(n=>n>=0);
  rowIds.sort((a,b)=>(scores.get(b)||0)-(scores.get(a)||0)||cmp(meta.chunks[a].id,meta.chunks[b].id));
  const best=new Map(),ranks=new Map(),rrf=new Map();
  for(const n of rowIds){const uid=meta.chunks[n].uid;if(!best.has(uid))best.set(uid,n);
    if((scores.get(n)||0)>0&&!ranks.has(uid)&&ranks.size<160){const rank=ranks.size+1;ranks.set(uid,rank);rrf.set(uid,1/(60+rank));}}
  let documentScores=new Map(rrf),graphPaths=new Map(),graphSummary=null;
  if(effective==='exact')documentScores=new Map((exact.size?[...exact]:number!==null?[...eligible]:[]).map(u=>[u,1]));
  if(mode==='auto'&&effective==='graph'&&identified.length){
    const structural=route.strategy==='bounded_source_linked_context'
      ?await sourceLinkedCandidates(view,identified,eligible,rrf)
      :await structuralCandidates(view,identified,eligible,route);
    documentScores=structural.scores;graphPaths=structural.paths;graphSummary=structural.summary;
  }else if(effective==='graph'){
    for(const seed of [...exact].sort(cmp)){
      const graph=await walkGraph(view,seed,{depth:2,direction:'both',relation:null,limit:80});
      for(const n of graph.nodes)if(eligible.has(n.id)&&n.id!==seed){
        if(!graphPaths.has(n.id))graphPaths.set(n.id,{seed,distance:n.distance});
        documentScores.set(n.id,(documentScores.get(n.id)||0)+.008/n.distance);
      }
    }
  }
  for(const uid of exact)if(effective!=='graph')documentScores.set(uid,(documentScores.get(uid)||0)+10);
  if(effective==='graph'&&exact.size&&route.target_kinds?.length){
    const rows=await graphDocuments(view,[...documentScores.keys()]);
    documentScores=new Map([...documentScores].filter(([u])=>route.target_kinds.includes(rows.get(u).kind)&&(graphPaths.has(u)||exact.has(u))));
  }
  const candidates=[...documentScores.keys()].sort((a,b)=>documentScores.get(b)-documentScores.get(a)||cmp(a,b)).slice(0,80);
  const selected=candidates.slice(0,k);for(const uid of selected)assert(best.has(uid),'EXACT_WITHOUT_ELIGIBLE_CHUNK');
  const documents=await view.getMany('document',selected),chunks=await view.getMany('chunk',selected.map(uid=>best.get(uid)));
  const hits=selected.map(uid=>{
    const n=best.get(uid),d=documents.get(uid),c=chunks.get(String(n));
    assert(d&&c&&d.uid===uid&&c.uid===uid&&c.id===meta.chunks[n].id&&d.content_hash===view.scope.get(uid),'PASSAGE_SCOPE_INVALID');
    const citation={canonical_id:d.uid,object_id:d.object_id,path:d.path,json_pointer:d.pointer,entity_version:d.version,
      content_sha256:d.content_hash,source_id:m.snapshot.source_id,tower_revision:m.snapshot.revision,
      chunk_id:c.id,representation:c.representation,snapshot_observed_at:m.snapshot.observed_at,
      entity_timestamp:d.entity_timestamp,state:d.state,valid_from:d.valid_from,valid_until:d.expires_at};
    const lexical=scores.get(n)||0;
    return {id:uid,title:d.title,kind:d.kind,state:d.state,excerpt:c.body,chunk_context:c.context,segments:c.segments,citation,
      score:documentScores.get(uid),lexical,cosine:0,stage_scores:{rrf:rrf.get(uid)??null,bm25:lexical,cosine:0,lsa_cosine:0,
        embedding_cosine:0,ranks:ranks.has(uid)?{lexical:ranks.get(uid)}:{},rrf_weights:{lexical:1,lsa:1,embedding:1},
        reranker:null,exact_match:exact.has(uid),graph_distance:graphPaths.get(uid)?.distance??null,
        graph_rank:graphPaths.get(uid)?.structural_rank??null},graph_path:graphPaths.get(uid)??null,authority:'evidence_only',truncated_source:false,clusters:[]};
  });
  if(graphSummary){Object.assign(graphSummary,{candidate_count:documentScores.size,returned_count:hits.length,
    traversal_truncated:graphSummary.truncated,results_truncated:documentScores.size>hits.length,computed_witness_complete:graphSummary.witness_complete});
    graphSummary.truncated=graphSummary.traversal_truncated||graphSummary.results_truncated;
    graphSummary.witness_complete=graphSummary.computed_witness_complete&&!graphSummary.results_truncated;
    if(graphSummary.strategy==='bounded_source_linked_context'&&graphSummary.results_truncated)
      graphSummary.context_completeness='BOUNDED_OR_UNRESOLVED';
  }
  const result={snapshot:m.snapshot,authorization_revision:m.authorization_revision,hits,method:ENGINE_VERSION,
    query:cleanQuery(query),role:m.role,mode:effective,route,search_policy:SEARCH_POLICY,filters:{},models:{},as_of:null,graph_summary:graphSummary,model_sha256:null,code_sha256:ENGINE_CODE,
    chunk_version:CHUNKER,elapsed_s:(performance.now()-start)/1000,
    answer_status:hits.length?'EVIDENCE_FOUND':'NO_EVIDENCE_IN_AUTHORIZED_INDEX',
    generation_policy:'cite_sources_or_abstain; retrieved_text_is_untrusted_data'};
  // Historical observations, filters and optional model arms remain explicit unsupported modes.
  assert(utf8(JSON.stringify(result)).length<=LIMITS.responseBytes,'RESPONSE_RESOURCE_BOUND');return result;
}

/** Compatibility entry point keeps the explicit lexical-only contract. */
export async function searchLexicalView(view,input) {
  assert((input?.mode??'lexical')==='lexical','UNSUPPORTED_RETRIEVAL_MODE');
  return searchCurrentView(view,{...input,mode:'lexical'});
}
