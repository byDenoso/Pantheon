import test from 'node:test';
import assert from 'node:assert/strict';
import {tokens,queryAliases,queryAliasCandidates} from '../worker/retrieval/tokenizer.mjs';
import {routeQuery,identifyQuery} from '../worker/retrieval/query-router.mjs';
import {searchCurrentView,validateRequest} from '../worker/retrieval/search.mjs';
import {traceView,validateTraceRequest} from '../worker/retrieval/graph.mjs';
import {V13_BINDINGS} from '../worker/retrieval/v13-bindings.mjs';
import {validateManifest} from '../worker/retrieval/integrity.mjs';
import {fixture as stagedFixture} from './helpers/retrieval-import.fixture.mjs';
function fixture(){
 const rows=new Map(),put=(f,k,v)=>rows.set(JSON.stringify([f,String(k)]),v);
 const docs=[['TEST::TEST-A','TEST-A','TEST','Alpha source'],['TEST::TEST-A-','TEST-A-','TEST','Trailing identity'],
 ['DATASET::DATA-ONE','DATA-ONE','DATASET','Observed data'],['RECIPE::RECIPE-ONE','RECIPE-ONE','RECIPE','Recipe'],
 ['TEST::TEST-NOEDGE','TEST-NOEDGE','TEST','Disconnected recipe dataset'],['TEST::TEST-TITLE','TEST-TITLE','TEST','What is the current version of TEST-UNKNOWN?']]
 .map(([uid,object_id,kind,title],n)=>({uid,object_id,kind,title,path:`entities/${n}.json`,pointer:'',version:'v1',content_hash:String(n+1).repeat(64),state:'ACTIVE',expires_at:null,entity_timestamp:null,valid_from:null}));
 const bodies=['/question: Alpha dataset recipe TEST-A; /value: 73','/question: trailing identifier only','/value: 73; /question: Observed data','/method: experiment recipe','/question: TEST-NOEDGE has rich matching dataset recipe words','/question: What is the current version of TEST-UNKNOWN?'];
 const edges=[{source:docs[0].uid,target:docs[2].uid,relation:'uses_dataset',pointer:'/dataset',origin:'explicit_source_field'},
 {source:docs[2].uid,target:docs[3].uid,relation:'uses_recipe',pointer:'/recipe',origin:'explicit_source_field'}];
 const chunks=[],lengths=[],postings=new Map();
 docs.forEach((d,n)=>{
  const c={uid:d.uid,id:String(n+1).padStart(64,'0'),body:bodies[n],context:{entity:d.uid,title:d.title,question:'',version:d.version},segments:[{json_pointer:'/question',text_start:0,text_end:bodies[n].length}],representation:V13_BINDINGS.chunker};chunks.push(c);
  const counts=new Map(),ts=tokens([d.uid,d.title,'','version '+d.version,c.body].join('\n'));lengths.push(ts.length);for(const t of ts)counts.set(t,(counts.get(t)||0)+1);
  for(const [t,f]of counts){if(!postings.has(t))postings.set(t,[]);postings.get(t).push([n,f]);}
  put('document',d.uid,d);put('chunk',n,c);put('title',d.title.toLowerCase(),[d.uid]);
  for(const a of [d.uid,d.object_id,d.path,'TOWER_V06/'+d.path])put('alias',a,[d.uid]);
  put('graph',d.uid,{edges:edges.filter(e=>e.source===d.uid||e.target===d.uid),unresolved_source_fields:[]});
 });
 for(const [term,rows]of postings)put('term',term,{df:rows.length,rows});put('number','73e0',[docs[0].uid,docs[2].uid]);
 const meta={scope:docs.map(d=>[d.uid,d.content_hash]),chunks,lengths},manifest={size:chunks.length,average:lengths.reduce((a,b)=>a+b)/chunks.length,
  edge_count:edges.length,snapshot:{source_id:'synthetic',revision:'revision',source_sha256:'a'.repeat(64),observed_at:'2026-01-01T00:00:00Z'},authorization_revision:'revision',role:'LEARNER'};
 return {put,manifest,scope:new Map(meta.scope),async metadata(){return meta;},async get(f,k){return rows.get(JSON.stringify([f,String(k)]))??null;},async getMany(f,keys){return new Map(await Promise.all(keys.map(async k=>[String(k),await this.get(f,k)])));}};
}
test('auto defaults to measured lexical, exact identity/number, and structural relations',async()=>{
 assert.equal(validateRequest({query:'alpha'}).mode,'auto');
 assert.equal((await searchCurrentView(fixture(),{query:'alpha'})).mode,'lexical');
 const exact=await searchCurrentView(fixture(),{query:'TEST-A'});assert.equal(exact.mode,'exact');assert.deepEqual(exact.hits.map(h=>h.id),['TEST::TEST-A']);assert.equal(exact.hits[0].score,11);
 const number=await searchCurrentView(fixture(),{query:'73'});assert.equal(number.mode,'exact');assert.deepEqual(number.hits.map(h=>h.id),['DATASET::DATA-ONE','TEST::TEST-A']);
});
test('unknown typed canonical identity cannot be replaced by a fuzzy source mention',async()=>{
 for(const query of ['TEST::DOES-NOT-EXIST','DATASET::missing-20261007','HYPOTHESIS::missing']){assert.equal(routeQuery(query,false).mode,'exact');assert.deepEqual((await searchCurrentView(fixture(),{query})).hits,[]);}
});
test('trailing-hyphen identity and punctuation fallback never select neighboring ID',async()=>{
 for(const query of ['TEST-A-','Show TEST-A-.','Qual é a versão vigente de TEST-A-?']){
  const view=fixture(),found=await identifyQuery(view,query,new Set(view.scope.keys()));assert.deepEqual(found.identified,['TEST::TEST-A-']);
 }
 const view=fixture();view.put('alias','TEST-A.', ['TEST::TEST-A-']);
 assert.deepEqual((await identifyQuery(view,'Show TEST-A.',new Set(view.scope.keys()))).identified,['TEST::TEST-A-']);
 assert.deepEqual(queryAliasCandidates('éTEST-A TEST-A-.,:').words,[['A','A'],['TEST-A-.','TEST-A-']]);assert.ok(queryAliases('TEST-A-').includes('TEST-A-'));
});
test('unknown identity abstains and current-version syntax ignores full-question title match',async()=>{
 for(const query of ['TEST-UNKNOWN','Qual é a versão vigente de TEST-UNKNOWN?','What is the current version of TEST-UNKNOWN?']){
  const r=await searchCurrentView(fixture(),{query});assert.equal(r.mode,'exact');assert.deepEqual(r.hits,[]);
 }
 const r=await searchCurrentView(fixture(),{query:'What is the current version of TEST-A?'});assert.equal(r.route.reason,'explicit_current_version_identity');assert.equal(r.hits.length,1);
});
test('literal field passages remain lexical despite incidental authorized IDs',async()=>{
 const r=await searchCurrentView(fixture(),{query:'payload.question: TEST-A observed dataset recipe'});
 assert.equal(r.mode,'lexical');assert.equal(r.route.reason,'literal_field_passage_with_incidental_references');
});
test('auto graph derives typed target and path witness solely from explicit authorized edges',async()=>{
 const one=await searchCurrentView(fixture(),{query:'Which dataset connects TEST-A?'});assert.equal(one.mode,'graph');assert.deepEqual(one.hits.map(h=>h.id),['DATASET::DATA-ONE']);
 assert.equal(one.hits[0].graph_path.edges[0].citation.json_pointer,'/dataset');assert.equal(one.hits[0].stage_scores.lsa_cosine,0);
 assert.equal(one.graph_summary.generated_edges,0);assert.equal(one.graph_summary.witness_complete,true);
 const two=await searchCurrentView(fixture(),{query:'Connect TEST-A to RECIPE-ONE',k:2});
 assert.equal(two.graph_summary.results_truncated,true);assert.equal(two.graph_summary.computed_witness_complete,true);assert.equal(two.graph_summary.witness_complete,false);
 const none=await searchCurrentView(fixture(),{query:'Connect TEST-A and TEST-NOEDGE'});assert.deepEqual(none.hits,[]);assert.equal(none.graph_summary.witness_complete,false);
 await assert.rejects(()=>searchCurrentView(fixture(),{query:'Connect TEST-A DATA-ONE RECIPE-ONE'}),/GRAPH_QUERY_REQUIRES_AT_MOST_TWO_ENTITIES/);
});
test('trace honors bounds/direction and never resolves untrusted or wrong-scope edges',async()=>{
 const r=await traceView(fixture(),{entity:'TEST-A',depth:2});assert.equal(r.nodes.length,3);assert.equal(r.edges.length,2);
 assert.equal((await traceView(fixture(),{entity:'TEST-A',depth:2,direction:'in'})).nodes.length,1);
 const limit=await traceView(fixture(),{entity:'TEST-A',limit:1});assert.equal(limit.truncated,true);assert.equal(limit.nodes.length,1);
 await assert.rejects(()=>traceView(fixture(),{entity:'TEST-UNKNOWN'}),/ENTITY_NOT_FOUND_OR_NOT_AUTHORIZED/);
 const v=fixture();v.put('graph','TEST::TEST-A',{edges:[{source:'TEST::TEST-A',target:'PRIVATE::HIDDEN',relation:'references',pointer:'/ref',origin:'explicit_source_field'}],unresolved_source_fields:[]});
 await assert.rejects(()=>traceView(v,{entity:'TEST-A'}),/GRAPH_SCOPE_INVALID/);
 for(const args of [{entity:'TEST-A',depth:7},{entity:'TEST-A',limit:201},{entity:'TEST-A',relation:'invented'},{entity:'TEST-A',role:'OWNER'}])assert.throws(()=>validateTraceRequest(args));
});
test('historical language/options and unconfigured graph model arms fail explicitly',async()=>{
 for(const query of ['What changed TEST-A?','as of 2026-01-01 TEST-A','O que mudou TEST-UNKNOWN?'])await assert.rejects(()=>searchCurrentView(fixture(),{query}),/HISTORICAL_QUERY_UNSUPPORTED/);
 await assert.rejects(()=>searchCurrentView(fixture(),{query:'no identity',mode:'graph'}),/GRAPH_ENTITY_REQUIRED/);
 for(const arg of [{as_of:'2026-01-01'},{filters:{}},{include_inactive:true},{mode:'temporal'},{mode:'lsa'}])assert.throws(()=>validateRequest({query:'TEST-A',...arg}));
});
test('v1.3 manifest requires its exact reproducible pins, graph contract, and policy',async()=>{
 const f=await stagedFixture();assert.doesNotThrow(()=>validateManifest(f.manifest,f.generation));
 for(const patch of [{engine_version:'nexo-retrieval-1.2.0'},{policy:'reviewed-contextual-lexical-v1'},{schema:'NEXO_PRIVATE_D1_LEXICAL_V1'},{graph_node_count:0},{code_sha256:'a'.repeat(64)}])assert.throws(()=>validateManifest({...f.manifest,...patch},f.generation));
});

test('query echo cleans signed URLs and bearer digits with Python Unicode whitespace',async()=>{
 for(const query of ['Bearer 123456','bEaReR\x1cabc123._~-','Bearer İıſK123','https://example.invalid/path?token=abc123']){
  const r=await searchCurrentView(fixture(),{query,mode:'lexical'});
  assert.equal(r.query,query.startsWith('http')?'https://example.invalid/path?[query-redacted]':'Bearer [redacted]');
 }
});
