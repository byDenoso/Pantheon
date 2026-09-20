import test from 'node:test';
import assert from 'node:assert/strict';
import {createHypothesisSurface,validateHypothesisContract} from '../lib/nexo-hypothesis.mjs';

test('hypothesis lifecycle gates only identity fields and reports recommended gaps',()=>{
 const result=validateHypothesisContract({hypothesis_id:'H-1',proposition:'P'});
 assert.equal(result.valid,true);
 assert.deepEqual(result.missing,[]);
 assert.ok(result.recommended_missing.includes('claim_boundary'));
});

test('hypothesis ingest deduplicates before mutation',async()=>{
 let writes=0;
 const gateway={
  async listJsonDirectory(){return [{id:'H-1',hypothesis_id:'H-1',proposition:'Same proposition',status:'OPEN'}];},
  async readEntity(){return null;},
  async submitTowerMutation(){writes++;return {status:'COMPLETE'};}
 };
 const surface=createHypothesisSurface({towerGateway:gateway});
 const result=await surface.ingestHypothesis({proposition:'Same   proposition'});
 assert.equal(result.status,'DUPLICATE');assert.equal(result.hypothesis_id,'H-1');assert.equal(writes,0);
});

test('hypothesis ingest persists through gateway and requires readback',async()=>{
 const store=new Map();
 const gateway={
  async listJsonDirectory(){return [];},
  async submitTowerMutation(request){store.set(request.entity_name,{...request.changes,entity_version:1});return {status:'COMPLETE',receipt:{accepted:true}};},
  async readEntity(kind,id){return store.get(id)||null;}
 };
 const surface=createHypothesisSurface({towerGateway:gateway});
 const result=await surface.ingestHypothesis({proposition:'Novel proposition',domain:'SCIENCE'});
 assert.equal(result.readback,'PASS');assert.match(result.hypothesis_id,/^HYP-USER-/);assert.equal(result.entity.entity_version,1);
});
