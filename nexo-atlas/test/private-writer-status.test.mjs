import test from 'node:test';import assert from 'node:assert/strict';
import {privateWriterOperations} from '../server/atlas/private-writer-status.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {createHash} from 'node:crypto';
const fixture=()=>{const tower=makePrivateTowerFixture();
 for(const [id,time,outcome] of [['R1','2026-10-06T00:00:00Z','DEFERRED_DEPENDENCY'],['R2','2026-10-07T00:00:00Z','APPLIED']])tower.files[`operations/receipts/${id}.json`]={encoding:'json',value:{contract:'OPERATION_RECEIPT_V1',receipt_id:id,intent_id:'PRIVATE-CANARY',effect_id:'envelope-test',stage:'APPLIED',outcome,observed_at:time,result_revision:tower.revision,visibility:'PRIVATE'}};
 tower.file_count=Object.keys(tower.files).length;return tower;};
test('private canonical receipt status uses the latest outcome, without claiming entity or science verification',()=>{
 const tower=fixture(),view=privateWriterOperations(tower).body;assert.equal(view.access,'PRIVATE');assert.equal(view.items.length,1);assert.equal(view.items[0].outcome,'APPLIED');assert.equal(view.items[0].receipt_id,'R2');assert.equal(view.items[0].scientific_execution,'NOT_ESTABLISHED_BY_RECEIPT');assert.equal(view.items[0].entity_readback,'REQUIRED_SEPARATELY');
});
test('stale revision, invalid filters and wrong Tower identity fail closed',()=>{
 const tower=fixture();assert.equal(privateWriterOperations(tower,{expected_revision:'sha256:'+'f'.repeat(64)}).status,409);
 for(const input of [{intent_id:[]},{limit:101},{limit:0}])assert.equal(privateWriterOperations(tower,input).status,400);
 assert.throws(()=>privateWriterOperations({...tower,stable_file_id:'OTHER'}));
});
test('unobserved intent remains unknown; no fabricated pending acknowledgement',()=>{
 const view=privateWriterOperations(fixture(),{intent_id:'MISSING'}).body;assert.equal(view.stage,'UNOBSERVED');assert.deepEqual(view.items,[]);
});
test('result links require a canonical inbox reference or the exact existing single-post mutation identity',()=>{
 const tower=fixture(),post={id:'PRIVATE-POST',from:'CHATGPT',text:'private canary',private:true};
 const suffix=createHash('sha256').update(JSON.stringify({post_ids:[post.id],resolve:[]})).digest('hex').slice(0,16).toUpperCase();
 tower.files['evolution/board.json']={encoding:'json',value:{posts:[post]}};
 tower.files['operations/receipts/EFFECT.json']={encoding:'json',value:{contract:'OPERATION_RECEIPT_V1',intent_id:'PRIVATE-CANARY',effect_id:`REQ-BOARD-${post.from}-${suffix}`,outcome:'APPLIED',receipt_id:'EFFECT'}};
 tower.file_count=Object.keys(tower.files).length;
 const view=privateWriterOperations(tower).body;assert.equal(view.items[0].result_records[0].id,post.id);assert.equal(view.items[0].entity_readback,'OBSERVED_IN_CURRENT_TOWER');
 tower.files['operations/receipts/EFFECT.json'].value.effect_id='UNRELATED';assert.deepEqual(privateWriterOperations(tower).body.items[0].result_records,[]);
});
