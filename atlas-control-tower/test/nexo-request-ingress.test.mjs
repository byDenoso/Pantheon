import test from 'node:test';import assert from 'node:assert/strict';import {createRequestIngressSurface,_internal} from '../lib/nexo-request-ingress.mjs';

function gateway(){
 const store=new Map(),writes=[];
 return {
  store,writes,
  async readControl(){return {mode:'ACTIVE'};},
  async readEntity(kind,id){return store.get(id)||null;},
  async readActiveWorkIndex(){return {work:[...store.values()]};},
  async submitTowerMutation(request){writes.push(request);const current=store.get(request.entity_name)||{id:request.entity_name,entity_version:0};store.set(request.entity_name,{...current,...request.changes,id:request.entity_name,entity_version:Number(current.entity_version||0)+1});return {status:'COMPLETE',receipt:{accepted:true}};}
 };
}
test('request fingerprint is deterministic under whitespace/case',()=>{
 const a=_internal.requestFingerprint({action:'Do',subject:'  Thing ',scope:'X',domain:'engineering',target_work_id:null});
 const b=_internal.requestFingerprint({action:'do',subject:'thing',scope:'x',domain:'ENGINEERING',target_work_id:null});
 assert.equal(a,b);
});
test('ingest request creates one deterministic canonical WORK and reads it back',async()=>{
 const g=gateway(),surface=createRequestIngressSurface({towerGateway:g});
 const out=await surface.ingestRequest({thread_id:'THR::ENG',action:'IMPLEMENT',subject:'Move state',domain:'ENGINEERING',owner_role:'EXECUTOR'});
 assert.equal(out.outcome,'CREATED');assert.equal(out.readback,'PASS');assert.match(out.work_id,/^WORK::REQ::/);assert.equal(g.writes.length,1);
});
test('repeated request merges into existing WORK instead of creating duplicate',async()=>{
 const g=gateway(),surface=createRequestIngressSurface({towerGateway:g}),payload={thread_id:'THR::ENG',action:'IMPLEMENT',subject:'Move state',domain:'ENGINEERING',owner_role:'EXECUTOR'};
 const first=await surface.ingestRequest(payload),second=await surface.ingestRequest(payload);
 assert.equal(first.work_id,second.work_id);assert.equal(second.outcome,'MERGED');assert.equal(g.writes.length,2);assert.equal(second.entity.request_count,2);
});
test('objective delegates to canonical request ingress',async()=>{
 const g=gateway(),surface=createRequestIngressSurface({towerGateway:g});
 const out=await surface.ingestObjective({goal:'Finish migration',domain:'ENGINEERING'});
 assert.equal(out.outcome,'CREATED');assert.equal(out.entity.thread_id,'THR::ENGINEERING::OBJECTIVE');
});
