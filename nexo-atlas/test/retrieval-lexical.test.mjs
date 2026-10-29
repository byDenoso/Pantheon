import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLexicalView,validateRequest} from '../worker/retrieval/search.mjs';
import {tokens,queryAliases,pureNumber} from '../worker/retrieval/tokenizer.mjs';
import {cmp,instant} from '../worker/retrieval/integrity.mjs';
import {createTrustedLexicalAdapter} from '../worker/retrieval/adapter.mjs';

function fixture() {
 const rows=new Map(),put=(f,k,v)=>rows.set(JSON.stringify([f,String(k)]),v);
 const docs=[{uid:'DATA::DATA-EXACT',title:'Observed dataset',object_id:'DATA-EXACT',path:'data/observed.json',pointer:'/records/0',kind:'DATA',version:'v1',content_hash:'a'.repeat(64),state:'ACTIVE',expires_at:null,entity_timestamp:null,valid_from:null},
 {uid:'PRIOR::PRIOR-EXACT',title:'Model prior',object_id:'PRIOR-EXACT',path:'priors/model.json',pointer:'/prior',kind:'PRIOR',version:'v1',content_hash:'b'.repeat(64),state:'ACTIVE',expires_at:null,entity_timestamp:null,valid_from:null},
 {uid:'DATA::RAW-KEYS',title:'__proto__ constructor',object_id:'RAW-KEYS',path:'data/keys.json',pointer:'',kind:'DATA',version:'v1',content_hash:'c'.repeat(64),state:'ACTIVE',expires_at:null,entity_timestamp:null,valid_from:null}];
 const bodies=['/dataset: OBSERVED; /measurement/H0: 73; /count: 9007199254740993','/prior/H0: 73; this is a model prior, not an observed dataset','/keys: __proto__ constructor'];
 const chunks=docs.map((d,n)=>({uid:d.uid,id:String(n+1).padStart(64,'0'),body:bodies[n],context:{entity:d.uid,title:d.title,question:'',version:d.version},segments:[{json_pointer:d.pointer+(n===0?'/measurement/H0':n===1?'/H0':'/keys'),text_start:0,text_end:bodies[n].length}],representation:'context-fields-1000-v2'}));
 const postings=new Map(),lengths=[];
 chunks.forEach((c,n)=>{const ts=tokens([c.context.entity,c.context.title,c.context.question,'version '+c.context.version,c.body].join('\n'));lengths.push(ts.length);
   const counts=new Map();for(const t of ts)counts.set(t,(counts.get(t)||0)+1);for(const [t,f]of counts){if(!postings.has(t))postings.set(t,[]);postings.get(t).push([n,f]);}
   put('chunk',n,c);put('document',c.uid,docs[n]);for(const key of [docs[n].uid,docs[n].object_id,docs[n].path,'TOWER_V06/'+docs[n].path])put('alias',key,[c.uid]);
 });
 for(const [term,rows]of postings)put('term',term,{df:rows.length,rows});
 put('title','observed dataset',[docs[0].uid]);put('title','model prior',[docs[1].uid]);put('title','__proto__ constructor',[docs[2].uid]);
 put('number','73e0',docs.slice(0,2).map(d=>d.uid));put('number','9007199254740993e0',[docs[0].uid]);
 const meta={chunks,lengths,scope:docs.map(d=>[d.uid,d.content_hash])},manifest={size:chunks.length,average:lengths.reduce((a,b)=>a+b)/chunks.length,
   snapshot:{source_id:'synthetic',revision:'revision',source_sha256:'d'.repeat(64),observed_at:'2026-01-01T00:00:00Z'},authorization_revision:'revision',role:'LEARNER'};
 return {manifest,scope:new Map(meta.scope),async metadata(){return meta;},async getMany(f,keys){return new Map(keys.map(k=>[String(k),rows.get(JSON.stringify([f,String(k)]))??null]));},async get(f,k){return rows.get(JSON.stringify([f,String(k)]))??null;}};
}
test('lexical search keeps original dataset and prior passage provenance for complex PT/EN raw questions',async()=>{
 for(const query of ['Compare DATA-EXACT e PRIOR-EXACT: qual valor de H0 vem do dataset observado, e qual é apenas um prior? Cite o campo original sem tratar o prior como observação.',
   'For DATA-EXACT versus PRIOR-EXACT, distinguish the observed dataset H0 measurement from the model prior; preserve field provenance and do not infer that matching values establish equal evidence.']){
   const result=await searchLexicalView(fixture(),{query,k:5});assert.equal(result.query,query);
   const data=result.hits.find(h=>h.id==='DATA::DATA-EXACT'),prior=result.hits.find(h=>h.id==='PRIOR::PRIOR-EXACT');
   assert.ok(data&&prior);assert.match(data.excerpt,/\/dataset: OBSERVED/);assert.equal(data.segments[0].json_pointer,'/records/0/measurement/H0');
   assert.match(prior.excerpt,/\/prior\/H0/);assert.equal(prior.citation.path,'priors/model.json');assert.equal(prior.segments[0].json_pointer,'/prior/H0');
   assert.equal(data.stage_scores.exact_match,true);assert.equal(prior.stage_scores.exact_match,true);
 }
});
test('number membership is exact, including integers beyond JS safe integer',async()=>{
 const yes=await searchLexicalView(fixture(),{query:'9007199254740993'});assert.deepEqual(yes.hits.map(h=>h.id),['DATA::DATA-EXACT']);
 const no=await searchLexicalView(fixture(),{query:'9007199254740992'});assert.deepEqual(no.hits,[]);
 const both=await searchLexicalView(fixture(),{query:'73'});assert.equal(both.hits.length,2);
 assert.equal(pureNumber(' ９００７１９９２５４７４０９９３ '),'9007199254740993e0');
});
test('prototype-looking query keys are valid data and absent terms are empty',async()=>{
 const indexed=await searchLexicalView(fixture(),{query:'__proto__ constructor'});assert.equal(indexed.hits[0].id,'DATA::RAW-KEYS');
 const absent=await searchLexicalView(fixture(),{query:'hasOwnProperty toString'});assert.deepEqual(absent.hits,[]);
});
test('exact aliases stay raw and case-sensitive; titles use faithful folding',async()=>{
 assert.ok(queryAliases('É DATA-EXACT?').includes('DATA-EXACT'));
 const exact=await searchLexicalView(fixture(),{query:'DATA-EXACT'});assert.equal(exact.hits[0].stage_scores.exact_match,true);assert.ok(exact.hits[0].score>10);
 const lower=await searchLexicalView(fixture(),{query:'data-exact'});assert.equal(lower.hits[0].stage_scores.exact_match,false);
 const title=await searchLexicalView(fixture(),{query:'ÓBSERVED DATASET'});assert.equal(title.hits[0].stage_scores.exact_match,true);
});
test('unsupported semantics and caller authority fail explicitly',()=>{
 for(const key of ['role','source','as_of','filters','index','generation','include_inactive'])assert.throws(()=>validateRequest({query:'x',[key]:'x'}),/UNSUPPORTED_RETRIEVAL_OPTIONS/);
 for(const mode of ['temporal','neural_hybrid'])assert.throws(()=>validateRequest({query:'x',mode}),/UNSUPPORTED_RETRIEVAL_MODE/);
 assert.doesNotThrow(()=>validateRequest({query:'😀'.repeat(4000)}));assert.throws(()=>validateRequest({query:'😀'.repeat(4001)}),/INVALID_QUERY/);
});
test('Python Unicode ordering and microsecond validity boundaries are preserved',()=>{
 assert.equal(cmp('\uE000','😀'),-1);assert.equal(cmp('a','aa'),-1);
 assert.equal(instant('2026-01-01T00:00:00.000001Z')-instant('2026-01-01T00:00:00Z'),1n);
 assert.equal(instant('2026-01-01T01:00:00+01:00'),instant('2026-01-01T00:00:00Z'));
});
test('adapter is disabled without explicit trusted server activation',async()=>{
 await assert.rejects(()=>createTrustedLexicalAdapter({})({query:'x'}),/RETRIEVAL_COMPONENT_DISABLED/);
});
