import test from 'node:test';
import assert from 'node:assert/strict';
import {contextFixture} from './helpers/retrieval-context.fixture.mjs';
import {searchCurrentView} from '../worker/retrieval/search.mjs';
import {sourceLinkedCandidates} from '../worker/retrieval/source-linked-context.mjs';
const ids=r=>r.hits.map(h=>h.id);
const cues=['correção','CORREÇÕES','corrigem','corrigir','correction','corrections','corrected','revisão','revisões','review','reviews','reviewed','interpretação','interpretações','interpretation','interpretations','interpretar','interpret','evidência','evidências','evidence'];
test('PT/EN correction, review, interpretation and evidence select bounded source context',async()=>{
 const view=await contextFixture();
 for(const cue of cues){const r=await searchCurrentView(view,{query:`${cue}: TEST-A QSO Planck`,k:8});
  assert.equal(r.route.strategy,'bounded_source_linked_context',cue);assert.equal(r.hits[0].id,'TEST::TEST-A');assert(ids(r).includes('BOARD_POST::REVIEW-A'));
  assert.equal(r.models&&Object.keys(r.models).length,0);assert.equal(r.graph_summary.generated_edges,0);assert.equal(r.graph_summary.scientific_independence,'NOT_ESTABLISHED');
  for(const h of r.hits){assert.equal(h.authority,'evidence_only');assert.equal(h.stage_scores.lsa_cosine,0);assert(h.graph_path.distance<=1);}
 }
});
test('bare IDs/version lookup and cue substrings retain exact semantics, literal fields stay lexical',async()=>{
 const view=await contextFixture();
 for(const query of ['TEST-A','TEST-A-','TEST-REVIEW','Show TEST-A.','What is the current version of TEST-A?','Qual é a versão vigente de TEST-A?','preview TEST-A','reviewer TEST-A','evidential TEST-A']){
  const r=await searchCurrentView(view,{query});assert.equal(r.mode,'exact',query);assert.equal(r.hits.length,1);}
 for(const query of ['TEST-UNKNOWN correction','review TEST-UNKNOWN'])assert.deepEqual(ids(await searchCurrentView(view,{query})),[]);
 assert.equal((await searchCurrentView(view,{query:'payload.question: TEST-A correction evidence'})).mode,'lexical');
 assert.equal((await searchCurrentView(view,{query:'Review TEST-A',mode:'exact'})).hits.length,1);
});
test('Portuguese relação/relações match structural intent, including accent and case variants',async()=>{
 const view=await contextFixture();
 for(const query of ['Qual relação liga TEST-A?','Quais RELAÇÕES ligam TEST-A?','Quais relacoes ligam TEST-A?']){
  const r=await searchCurrentView(view,{query});assert.equal(r.route.strategy,'bounded_explicit_graph');assert(ids(r).includes('BOARD_POST::REVIEW-A'));}
 const r=await searchCurrentView(view,{query:'Quais evidências e relações corrigem a interpretação de TEST-A?'});assert.equal(r.route.strategy,'bounded_source_linked_context');
});
test('source links admit the review and contest but never prose-only or same-campaign siblings',async()=>{
 const view=await contextFixture(),r=await searchCurrentView(view,{query:'TEST-A correção Planck QSO',k:50});
 assert.deepEqual(new Set(ids(r)),new Set(['TEST::TEST-A','BOARD_POST::REVIEW-A','TEST::TEST-CONTEST','ROADMAP::CAMPAIGN-A','DATASET::DATA-A']));
 const h=r.hits.find(h=>h.id==='BOARD_POST::REVIEW-A');assert.match(h.excerpt,/QSO_z0=\+2,560/);assert.match(h.excerpt,/prior\/CMB-dominada/);
 const edge=h.graph_path.edges[0];assert.equal(edge.source,h.id);assert.equal(edge.target,'TEST::TEST-A');assert.equal(edge.origin,'explicit_source_field');assert.equal(edge.citation.json_pointer,'/posts/0/refs/0');
 assert.equal(edge.citation.tower_revision,h.citation.tower_revision);assert.equal(edge.citation.content_sha256,h.citation.content_sha256);
 assert.equal(h.citation.json_pointer,'/posts/0');assert.equal(r.hits[0].state,'REJECTED');
 for(const forbidden of ['HIDDEN-CANARY','EXPIRED-CANARY','INACTIVE-CANARY','TWO-HOP-CANARY','TEST-MENTION'])assert(!JSON.stringify(r).includes(forbidden));
});
test('two disconnected identities retain both roots rather than inventing a path, >2 fail closed',async()=>{
 const view=await contextFixture(),r=await searchCurrentView(view,{query:'Review TEST-A TEST-REVIEW',k:50});
 assert.deepEqual(ids(r).slice(0,2),['TEST::TEST-A','TEST::TEST-REVIEW']);
 assert(r.hits.slice(0,2).every(h=>h.graph_path.distance===0&&h.graph_path.edges.length===0));
 await assert.rejects(()=>searchCurrentView(view,{query:'Review TEST-A TEST-B TEST-REVIEW'}),/GRAPH_QUERY_REQUIRES_AT_MOST_TWO_ENTITIES/);
});
test('top-k truncation is explicit and never overrides raw exact identity priority',async()=>{
 const view=await contextFixture(),r=await searchCurrentView(view,{query:'Review TEST-A QSO',k:1});
 assert.deepEqual(ids(r),['TEST::TEST-A']);assert.equal(r.graph_summary.results_truncated,true);assert.equal(r.graph_summary.witness_complete,false);assert.equal(r.graph_summary.computed_witness_complete,true);
});
test('invalid hidden, synthetic-origin or malformed edges fail rather than silently bridging scope',async()=>{
 for(const patch of [{target:'PRIVATE::HIDDEN'},{origin:'inferred_text'},{pointer:'bad'}]){
  const view=await contextFixture(),g=await view.get('graph','TEST::TEST-A');view.put('graph','TEST::TEST-A',{...g,edges:[{...g.edges[0],...patch}]});
  await assert.rejects(()=>searchCurrentView(view,{query:'Review TEST-A'}),/GRAPH_SCOPE_INVALID/);
 }
});
test('context edge choice is deterministic and eligibility cannot widen authorized results',async()=>{
 const view=await contextFixture();await view.metadata();const root='TEST::TEST-A';
 const result=await sourceLinkedCandidates(view,[root],new Set([root]),new Map());assert.deepEqual([...result.scores.keys()],[root]);
});
test('context remains current-only; historical cues/options still fail explicitly',async()=>{
 const view=await contextFixture();
 for(const query of ['Review TEST-A as of 2026-01-01','What changed TEST-A correction?'])await assert.rejects(()=>searchCurrentView(view,{query}),/HISTORICAL_QUERY_UNSUPPORTED/);
 await assert.rejects(()=>searchCurrentView(view,{query:'Review TEST-A',role:'ENGINEER'}),/UNSUPPORTED_RETRIEVAL_OPTIONS/);
});
test('explicit evidence chains retain multi-hop structural semantics',async()=>{
 const view=await contextFixture();
 for(const query of ['Evidence chain for TEST-A','Cadeia de evidências de TEST-A','Trace TEST-A'])assert.equal((await searchCurrentView(view,{query})).route.strategy,'bounded_explicit_graph');
});
test('one-hop node bound is visible rather than silently implying all context was returned',async()=>{
 const posts=Array.from({length:205},(_,n)=>({id:`REVIEW-${String(n).padStart(3,'0')}`,refs:['TEST-A'],text:'Scientific review'}));
 const r=await searchCurrentView(await contextFixture({'evolution/board.json':{posts}}),{query:'Review TEST-A',k:50});
 assert.equal(r.hits[0].id,'TEST::TEST-A');assert.equal(r.graph_summary.visited_authorized_nodes,200);
 assert.equal(r.graph_summary.traversal_truncated,true);assert.equal(r.graph_summary.witness_complete,false);assert.equal(r.hits.length,50);
});
test('mixed correction/review and explicit chain/trace keep the requested structural witness',async()=>{
 const view=await contextFixture();
 for(const query of ['Trace the corrections for TEST-A','Review the chain connecting TEST-A and TEST-B','Review the connection between TEST-A and TEST-B','Which review traces TEST-A to TEST-B?','Review the connections between TEST-A and TEST-B','Revisão da conexão de TEST-A com TEST-B','Rastrear cadeia de correções de TEST-A']){
  const r=await searchCurrentView(view,{query,k:50});assert.equal(r.route.strategy,'bounded_explicit_graph');
  if(query.includes('TEST-B')){const second=r.hits.find(h=>h.id==='TEST::TEST-B');assert(second);assert.equal(second.graph_path.seed,'TEST::TEST-A');assert.equal(second.graph_path.distance,2);assert.equal(second.graph_path.edges.length,2);}
 }
});
test('independent evidence questions do not confuse independence with dependency traversal',async()=>{
 const view=await contextFixture();
 for(const query of ['What independent evidence supports TEST-A?','Quais evidências independentes sustentam TEST-A?','Evidence of independence for TEST-A']){
  const r=await searchCurrentView(view,{query,k:50});assert.equal(r.route.strategy,'bounded_source_linked_context');assert(!ids(r).includes('TEST::TEST-B'));assert.equal(r.graph_summary.scientific_independence,'NOT_ESTABLISHED');
 }
 assert.equal((await searchCurrentView(view,{query:'Trace independent evidence for TEST-A'})).route.strategy,'bounded_explicit_graph');
 assert.equal((await searchCurrentView(view,{query:'Which dataset provides independent evidence for TEST-A?'})).route.strategy,'bounded_explicit_graph');
});
test('unresolved source pointers disclose bounded context without exposing a missing target',async()=>{
 const view=await contextFixture({'entities/test/TEST-A.json':{id:'TEST-A',refs:['UNRESOLVED-TARGET-CANARY'],state:'REJECTED'}});
 const r=await searchCurrentView(view,{query:'Review TEST-A',k:50});
 assert(r.graph_summary.unresolved_source_field_count>0);assert.equal(r.graph_summary.context_completeness,'BOUNDED_OR_UNRESOLVED');
 assert.equal(r.graph_summary.exhaustive_review_context,false);assert.equal(r.graph_summary.context_scope,'direct_authorized_source_assertions_only');
 assert(!JSON.stringify(r.graph_summary).includes('UNRESOLVED-TARGET-CANARY'));
 const cut=await searchCurrentView(await contextFixture(),{query:'Review TEST-A',k:1});assert.equal(cut.graph_summary.context_completeness,'BOUNDED_OR_UNRESOLVED');
});
test('capabilities and search disclose the same query policy without changing index/grant pins',async()=>{
 const {database,fixture,stage}=await import('./helpers/retrieval-import.fixture.mjs');
 const {verifyGeneration,publishGeneration}=await import('../worker/retrieval/import.mjs');
 const {createTrustedRetrievalAdapter}=await import('../worker/retrieval/adapter.mjs');
 const {POLICY}=await import('../worker/retrieval/integrity.mjs');
 const {SEARCH_POLICY}=await import('../worker/retrieval/query-router.mjs');
 const {db,sqlite}=database(),f=await fixture('context-capabilities');let sourceChecks=0,authChecks=0;
 try{
  await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  const opts={db,enabled:true,allowSyntheticFixtures:true,authorize:async()=>{authChecks++;return{authorized:true,pin_valid:true,owner:true,subject:'owner',session_id:'synthetic',session_epoch:'1',role:'LEARNER',policy:POLICY,now:'2026-10-06T14:24:24Z'};},checkSource:async()=>{sourceChecks++;}};
  const caps=await createTrustedRetrievalAdapter({...opts,operation:'capabilities'})({}),search=await createTrustedRetrievalAdapter(opts)({query:'hello'});
  assert.equal(caps.search_policy,SEARCH_POLICY);assert.equal(search.search_policy,caps.search_policy);assert.equal(caps.policy,POLICY);assert.equal(caps.engine_version,f.manifest.engine_version);
  assert.equal(caps.writes_enabled,false);assert.equal(authChecks,4);assert.equal(sourceChecks,4);
 }finally{sqlite.close();}
});
