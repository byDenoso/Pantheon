/** Source-lineage grouping, never a count of independent experiments.
 * Input must already be the redacted, authorized view chosen by the server.
 * This does not change retrieval scores or write learned/canonical memory.
 */
const FOLLOW = new Set(['derived_from','supported_by','for_test','has_run','has_result']);
const ROOT_KINDS = new Set(['EXPERIMENT','RUN','RESULT','TEST','EMERGENT_TEST']);
const ROOT_OUTGOING = new Set(['has_run','has_result','derived_from']);
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const limit = (condition, message) => {if (!condition) throw new Error(message);};

export function summarizeEvidenceOrigins({documents, edges, selectedIds, snapshot}, {maxDepth=12,maxVisited=4000}={}) {
  limit(Array.isArray(documents)&&documents.length<=12000&&Array.isArray(edges)&&edges.length<=100000&&Array.isArray(selectedIds)&&selectedIds.length<=200,'ORIGIN_INPUT_BOUND');
  limit(Number.isInteger(maxDepth)&&maxDepth>=1&&maxDepth<=24&&Number.isInteger(maxVisited)&&maxVisited>=1&&maxVisited<=12000,'ORIGIN_TRAVERSAL_BOUND');
  limit(snapshot&&typeof snapshot.source_id==='string'&&typeof snapshot.revision==='string','ORIGIN_SNAPSHOT_REQUIRED');
  const docs=new Map(),adj=new Map();
  for(const d of documents){limit(d&&typeof d.uid==='string'&&!docs.has(d.uid)&&typeof d.kind==='string','ORIGIN_DOCUMENT_INVALID');docs.set(d.uid,d);}
  for(const e of edges){
    // No raw unresolved/hidden locator is echoed. Only visible, source-explicit
    // endpoint relations may connect records; title similarity is never used.
    if(e?.origin!=='explicit_source_field'||!FOLLOW.has(e.relation)||!docs.has(e.source)||!docs.has(e.target)||e.source===e.target) continue;
    const a=adj.get(e.source)||[];a.push(e);adj.set(e.source,a);
  }
  for(const a of adj.values())a.sort((a,b)=>cmp(a.target,b.target)||cmp(a.pointer||'',b.pointer||''));
  const groups=new Map(),items=[];let missing=0;
  for(const id of [...new Set(selectedIds)].sort(cmp)){
    if(!docs.has(id)){missing++;continue;}
    const pending=[{id,depth:0,path:[]}],seen=new Set(),queued=new Set([id]),roots=new Map();let truncated=false,cursor=0;
    while(cursor<pending.length){
      const n=pending[cursor++];if(seen.has(n.id))continue;
      if(seen.size>=maxVisited){truncated=true;break;}seen.add(n.id);
      const d=docs.get(n.id),isRoot=ROOT_KINDS.has(d.kind),all=adj.get(n.id)||[];
      // A test's hypothesis/campaign and a paper's generic refs are not origins.
      // Prefer explicit run/result derivation over a coarse test identity.
      const next=isRoot?all.filter(e=>ROOT_OUTGOING.has(e.relation)&&ROOT_KINDS.has(docs.get(e.target).kind)):all;
      if(isRoot&&next.length===0){roots.set(n.id,n.path);continue;}
      if(n.depth>=maxDepth){if(next.length)truncated=true;continue;}
      for(const e of next){if(queued.has(e.target))continue;if(queued.size>=maxVisited){truncated=true;continue;}queued.add(e.target);pending.push({id:e.target,depth:n.depth+1,path:[...n.path,{source:e.source,target:e.target,relation:e.relation,pointer:e.pointer||'',origin:'explicit_source_field'}]});}
    }
    const rootIds=[...roots.keys()].sort(cmp),d=docs.get(id);
    const flags=[]; const stack=[d.data];let fields=0;
    while(stack.length){const value=stack.pop();if(!value||typeof value!=='object')continue;
      for(const [k,v] of Object.entries(value)){limit(++fields<=25000,'ORIGIN_FIELD_BOUND');
        if(k==='not_independent_evidence'&&v===true)flags.push('SOURCE_EXPLICITLY_NOT_INDEPENDENT');
        if(v&&typeof v==='object')stack.push(v);}}
    items.push({id,origin_ids:rootIds,lineage_status:truncated?'INCOMPLETE':rootIds.length?'EXPLICIT_SOURCE_LINEAGE':'UNRESOLVED',
      derivative:rootIds.some(root=>root!==id),scientific_independence:'NOT_ESTABLISHED',qualifiers:[...new Set(flags)],
      witnesses:rootIds.map(root=>({origin_id:root,edges:roots.get(root)}))});
    for(const root of rootIds){const origin=docs.get(root);if(!groups.has(root))groups.set(root,{origin_id:root,kind:origin.kind,version:origin.version??null,
      content_sha256:origin.content_hash??null,source_id:snapshot.source_id,tower_revision:snapshot.revision,path:origin.path??null,json_pointer:origin.pointer??null,
      member_ids:[],scientific_independence:'NOT_ESTABLISHED'});groups.get(root).member_ids.push(id);}
  }
  return {contract:'NEXO_EXPLICIT_EVIDENCE_ORIGINS_V1',authority:'derived_lineage_only',
    items,groups:[...groups.values()].sort((a,b)=>cmp(a.origin_id,b.origin_id)),
    counts:{retrieved_documents:items.length,resolved_source_origins:groups.size,unresolved_documents:items.filter(x=>!x.origin_ids.length).length,
      incomplete_documents:items.filter(x=>x.lineage_status==='INCOMPLETE').length,source_origin_count_is_lower_bound:items.some(x=>x.lineage_status==='INCOMPLETE'),unavailable_requested_documents:missing,independent_experiments:null},
    interpretation:'Multiple documents from one explicit source origin count once as a lineage origin, not as independent experimental confirmations. Distinct origins do not establish independence.'};
}
