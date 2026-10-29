/** Reviewed 1.3 routing plus the explicit source-linked-context policy. */
import {fold,pythonStrip,pythonPattern,isTechnicalIdentifier,technicalIdentifiers,queryAliasCandidates} from './tokenizer.mjs';
import {assert,cmp,LIMITS} from './integrity.mjs';
const numeric=pythonPattern('^[+-]?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$');
const version=pythonPattern("^(?:qual(?: e)? a versao (?:vigente|atual) de|what(?: is|'s) the current version of)\\s+(\\S+?)\\??$");
// The one negated whitespace class must be Python's, too.
const literal=pythonPattern('\\b(?:[a-z_]\\w*\\.)+[a-z_]\\w*:\\s|\\b(?:question|statement|method|payload|source|writer_role|evidence_kind|notes):\\s');
// Whole folded words avoid turning "preview", "evidential" or text inside an
// already-resolved identifier into a request for review context.
const contextCue=pythonPattern('\\b(?:correcao|correcoes|corrige|corrigem|corrigir|correction|corrections|corrected|revisao|revisoes|review|reviews|reviewed|interpretacao|interpretacoes|interpretation|interpretations|interpretar|interpret)\\b');
const evidenceCue=pythonPattern('\\b(?:evidencia|evidencias|evidence)\\b');
const explicitTraversal=pythonPattern('\\b(?:trace\\w*|tracing|chain\\w*|cadeia\\w*|connect\\w*|conect\\w*|conexao|conexoes)\\b');
const independenceWords=pythonPattern('\\b(?:independent|independently|independence|independente|independentes|independencia)\\b','gu');
const portugueseRelation=pythonPattern('\\b(?:relacao|relacoes)\\b');
export const SEARCH_POLICY='reviewed-source-linked-context-v1';
export const dateQuery=pythonPattern('\\b(?:as of|em|on)\\s+(\\d{4}-\\d{2}-\\d{2})\\b');
export const temporalCues=['o que mudou','what changed','mudancas entre','compare revisions'];
export function routeQuery(query,hasId) {
  const q=fold(query),target=version.exec(pythonStrip(q));
  if(target&&(isTechnicalIdentifier(target[1])||hasId&&target[1]==='[entity]'))
    return {mode:'exact',reason:'explicit_current_version_identity'};
  if(hasId&&temporalCues.some(c=>q.includes(c)))return {mode:'temporal',reason:'identifier_with_revision_comparison',operation:'observed_diff'};
  const unknown=/^(?:TEST|HYPOTHESIS|HYP|RUN|RESULT|WORK|DATASET|DATA|RECIPE|CONTRACT)::[A-Za-z0-9_.:/-]+$/.test(pythonStrip(query))||technicalIdentifiers(query).some(x=>/^(?:(?:TEST|HYPOTHESIS|HYP|RUN|RESULT|WORK|DATASET|DATA|RECIPE|CONTRACT)::[A-Za-z0-9_.:/-]+|(?:TEST|HYP|RUN|RESULT|WORK|DATA|RECIPE|CONTRACT|T)-[A-Z0-9_-]+)$/.test(x));
  if(hasId&&['o que sabemos','what do we know','o que aprendemos','what have we learned'].some(s=>q.includes(s)))
    return {mode:'graph',reason:'explicit_entity_broad_evidence',target_kinds:[],strategy:'bounded_explicit_graph'};
  if(literal.test(q))return {mode:'lexical',reason:'literal_field_passage_with_incidental_references'};
  if(hasId&&contextCue.test(q)&&!explicitTraversal.test(q))return {mode:'graph',reason:'identifier_with_source_linked_context_request',target_kinds:[],strategy:'bounded_source_linked_context'};
  // In evidence questions, "independent" is not a dependency request. Keep
  // unrelated legacy routing stable; this only disambiguates the new channel.
  const graphQuery=evidenceCue.test(q)?q.replace(independenceWords,''):q;
  const graph=portugueseRelation.test(q)||explicitTraversal.test(q)||['relacion','connect','conecta','cadeia','chain','trace','dataset','binding','conjunto de dados','receita','recipe','depende','depend','resultado de','result of','associad','associated','quais testes','which tests'].some(s=>graphQuery.includes(s));
  if(hasId&&graph){let target_kinds=[];
    if(q.includes('receita')||q.includes('recipe'))target_kinds=['RECIPE'];
    else if(q.includes('quais testes')||q.includes('which tests'))target_kinds=['TEST'];
    else if(['dataset','binding','conjunto de dados','conjuntos de dados'].some(s=>q.includes(s)))target_kinds=['DATA_BINDING','DATASET'];
    return {mode:'graph',reason:'identifier_with_relation_request',target_kinds,strategy:'bounded_explicit_graph'};
  }
  if(hasId&&evidenceCue.test(q))return {mode:'graph',reason:'identifier_with_source_linked_context_request',target_kinds:[],strategy:'bounded_source_linked_context'};
  if(hasId||unknown||numeric.test(pythonStrip(query)))return {mode:'exact',reason:'exact_identifier_numeric_or_filters'};
  if(['aprendemos','learned','familias','families','evidencias converg','evidence converg'].some(s=>q.includes(s)))
    return {mode:'lexical',reason:'broad_evidence_lexical_first; graph_tools_available_for_explicit_traces'};
  return {mode:'lexical',reason:'measured_lexical_default; hybrid_remains_opt_in'};
}
export async function identifyQuery(view,query,authorized) {
  const c=queryAliasCandidates(query),keys=[...new Set([c.whole,...c.words.flat(),...c.underscored])];
  assert(keys.length<=LIMITS.aliases,'QUERY_RESOURCE_BOUND');
  const rows=await view.getMany('alias',keys),found=new Set();
  const add=ids=>{for(const uid of ids??[]){assert(authorized.has(uid),'EXACT_SCOPE_INVALID');found.add(uid);}};
  add(rows.get(c.whole));for(const [raw,stripped]of c.words){const direct=rows.get(raw);add(direct?.length?direct:rows.get(stripped));}
  for(const raw of c.underscored)add(rows.get(raw));
  const identified=[...found].sort(cmp),docs=await view.getMany('document',identified),aliases=new Set();
  for(const uid of identified){const d=docs.get(uid);assert(d&&d.uid===uid&&d.content_hash===view.scope.get(uid),'DOCUMENT_SCOPE_INVALID');
    for(const a of [d.uid,d.object_id,d.path,'TOWER_V06/'+d.path])aliases.add(a);}
  let routing=query;
  // Equal-length replacements cannot overlap except identically; deterministic tie order.
  for(const alias of [...aliases].sort((a,b)=>Array.from(b).length-Array.from(a).length||cmp(a,b)))routing=routing.split(alias).join('[entity]');
  return {identified,route:routeQuery(routing,identified.length>0)};
}
