import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryDocuments,browseMemory,prepareMemoryProposal,memoryRoute,cleanMemory,ANNOTATION_SCOPE} from '../worker/memory.mjs';
const at='2026-10-06T00:00:00Z';

const edit=(tower,extra={})=>{const target=memoryDocuments(tower).find(v=>v.object_id==='T-1');return {target_id:target.canonical_id,expected_revision:tower.revision,expected_content_sha256:target.citation.content_sha256,annotation_type:'CORRECTION',text:'Interpret cautiously',reason:'Sample is small',...extra};};
test('owner browse keeps canonical citations, source status and honest cache boundaries',()=>{
 const tower=memoryFixture(),before=JSON.stringify(tower),page=browseMemory(tower,{query:'expansion',kind:'TEST'});
 assert.equal(page.access,'PRIVATE');assert.equal(page.total,1);assert.equal(page.items[0].citation.tower_revision,tower.revision);assert.equal(page.items[0].citation.entity_version,'4');assert.equal(page.items[0].provisional,true);
 assert.equal(page.writer.can_apply,false);assert.equal(page.derived_cache.status,'NOT_CONNECTED');assert.equal(page.search,'LEXICAL_SOURCE_BROWSE');assert.equal(JSON.stringify(tower),before);
 for(const forbidden of ['NEVER_MEMORY_PEER','Synthetic private task','Synthetic private test','NEVER_CROSS_DOMAIN'])assert.equal(JSON.stringify(browseMemory(tower)).includes(forbidden),false,forbidden);
});
test('hypothesis, related test, provisional, feedback filters and pagination',()=>{
 const tower=memoryFixture();assert.equal(browseMemory(tower,{kind:'HYPOTHESIS'}).items[0].object_id,'H-1');
 assert.equal(browseMemory(tower,{status:'feedback'}).items[0].object_id,'FB-1');assert.ok(browseMemory(tower,{related_id:'T-1'}).total>=2);
 assert.ok(browseMemory(tower,{status:'provisional'}).items.every(v=>v.provisional));
 const first=browseMemory(tower,{limit:1}),next=browseMemory(tower,{offset:first.next_offset,limit:1,expected_revision:tower.revision});assert.notEqual(first.items[0].canonical_id,next.items[0].canonical_id);
 assert.throws(()=>browseMemory(tower,{expected_revision:'stale'}),/MEMORY_REVISION_CONFLICT/);
 for(const body of [{query:'x'.repeat(257)},{limit:51},{offset:-1},{status:'unknown'},{file_id:'other'}])assert.throws(()=>browseMemory(tower,body),/MEMORY_QUERY_INVALID/);
});
test('proposals are append-only drafts with Writer CAS/readback requirements and no false applied receipt',()=>{
 const tower=memoryFixture(),before=JSON.stringify(tower),result=prepareMemoryProposal(tower,edit(tower),at);
 assert.equal(result.persisted,false);assert.equal(result.applied,false);assert.equal(result.state,'DRAFT');assert.equal(result.proposal.kind,'LEARNING_SIGNAL');assert.equal(result.proposal.source,'ATLAS_OWNER');assert.equal(result.proposal.payload.scope,ANNOTATION_SCOPE);assert.equal(result.proposal.payload.scientific_authority,false);assert.equal(result.changes_historical_evidence,false);assert.ok(result.requires.includes('TOWER_REVISION_CAS'));assert.equal(JSON.stringify(tower),before);
 assert.equal(result.proposal.stable_id,prepareMemoryProposal(tower,edit(tower),at).proposal.stable_id);
 for(const patch of [{expected_revision:'stale'},{expected_content_sha256:'wrong'},{target_id:'not-found'},{result:'replace'},{annotation_type:'SCIENCE_APPROVAL'},{text:''},{reason:''},{text:'x'.repeat(6001)}])assert.throws(()=>prepareMemoryProposal(tower,edit(tower,patch)));
});
test('annotations retain supersession history and reject a stale annotation head',()=>{
 const tower=memoryFixture(),first=prepareMemoryProposal(tower,edit(tower),at).proposal;
 tower.files['entities/artifact/NOTE-1.json']={encoding:'json',value:{id:'NOTE-1',kind:'LEARNING_SIGNAL',created_at:at,payload:first.payload}};tower.file_count++;
 let page=browseMemory(tower,{kind:'TEST',query:'expansion'});assert.equal(page.items[0].history.length,1);assert.equal(page.items[0].history[0].annotation_text,'Interpret cautiously');
 const prior=page.items[0].history[0].canonical_id,next=prepareMemoryProposal(tower,edit(tower,{supersedes:prior,text:'Updated interpretation'}));
 assert.equal(next.proposal.payload.supersedes,prior);
 tower.files['entities/artifact/NOTE-2.json']={encoding:'json',value:{id:'NOTE-2',kind:'LEARNING_SIGNAL',created_at:at,payload:next.proposal.payload}};tower.file_count++;
 assert.throws(()=>prepareMemoryProposal(tower,edit(tower,{supersedes:prior})),/MEMORY_ANNOTATION_CONFLICT/);
 page=browseMemory(tower,{kind:'TEST',query:'expansion'});assert.equal(page.items[0].history_total,2);assert.equal(page.items[0].state,'PROVISIONAL');
});
test('duplicate identities are quarantined and cannot be edited',()=>{
 const tower=memoryFixture();tower.files['entities/test/duplicate.json']={encoding:'json',value:{...tower.files['entities/test/T-1.json'].value,result:'different'}};tower.file_count++;
 const docs=memoryDocuments(tower).filter(v=>v.object_id==='T-1');assert.equal(docs.length,2);assert.ok(docs.every(v=>v.ambiguous_identity));assert.throws(()=>prepareMemoryProposal(tower,edit(tower)),/MEMORY_TARGET_UNAVAILABLE/);
});
test('byte-identical duplicate identity keeps first sorted path, matching Python retrieval lineage',()=>{
 const tower=memoryFixture();tower.files['entities/test/duplicate.json']={encoding:'json',value:structuredClone(tower.files['entities/test/T-1.json'].value)};tower.file_count++;
 const rows=memoryDocuments(tower).filter(row=>row.object_id==='T-1');assert.equal(rows.length,1);assert.equal(rows[0].citation.path,'entities/test/T-1.json');assert.equal(rows[0].ambiguous_identity,undefined);
});
test('credentials and signed URLs are removed from visible source excerpts',()=>{
 const clean=cleanMemory({apiKey:'never',password:'never',nested:{client_secret:'never'},text:'Bearer synthetic-secret https://source.invalid/a?token=secret'});
 assert.equal(JSON.stringify(clean).includes('never'),false);assert.equal(JSON.stringify(clean).includes('token=secret'),false);assert.equal(clean.text,'Bearer [redacted] https://source.invalid/a?[query-redacted]');
});
test('nested array and semantic topic private domains are excluded before source browsing',()=>{
 const tower=memoryFixture();
 for(const [id,value] of [['NESTED',{payload:{items:[{domain:'PEER'}]}}],['TOPIC',{semantic:{topic_id:'olympus.private'}}]]){tower.files[`entities/artifact/${id}.json`]={encoding:'json',value:{id,kind:'ARTIFACT',title:'NEVER_NESTED_PRIVATE',...value}};tower.file_count++;}
 assert.equal(JSON.stringify(browseMemory(tower)).includes('NEVER_NESTED_PRIVATE'),false);
});
test('apply fails closed without contacting a source or fabricating Writer success',async()=>{
 let reads=0;const result=await memoryRoute('/api/atlas-memory/apply',{},async()=>{reads++;throw Error('must not call');});
 assert.equal(result.status,503);assert.equal(result.body.error,'EXISTING_WRITER_ROUTE_REQUIRED');assert.equal(result.body.applied,false);assert.equal(reads,0);
 const conflict=await memoryRoute('/api/atlas-memory/propose',{expected_revision:'stale'},async()=>memoryFixture());assert.equal(conflict.status,409);
});
