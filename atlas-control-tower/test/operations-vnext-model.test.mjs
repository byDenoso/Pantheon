import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsModel } from '../src/data/operations-vnext-model.ts';

const ops={counts:{actions:4,runs:21,events:66,blocked:2,success:18,readbackVerified:21},actions:[
 {id:'a1',label:'Acquire source',status:'BLOCKED',domain:'SCIENCE',summary:'waiting',updatedAt:'2026-09-08T12:00:00Z',metadata:{priority:1,blocker_reason:'SOURCE_PENDING'}},
 {id:'a2',label:'Repair runtime',status:'COMPLETED',domain:'ENGINEERING',updatedAt:'2026-09-08T10:00:00Z',metadata:{priority:2}}
],events:[{id:'e1',label:'Atlas CI',status:'BLOCKED_L3_CREDENTIAL',domain:'ENGINEERING',summary:'credential boundary',updatedAt:'2026-09-08T17:00:00Z',metadata:{event_type:'DEPLOYMENT_CREDENTIAL_BOUNDARY'}}]};
const runs=[
 {id:'r1',label:'SCIENCE · BLOCKED',status:'BLOCKED',domain:'SCIENCE',summary:'source pending',updatedAt:'2026-09-08T12:30:00Z',metadata:{loop:'Scientific Core',checkpoint:'TERMINAL',readback_verified:true,expected_outcome:'source available',observed_outcome:'still blocked'}},
 {id:'r2',label:'NEXO · SUCCESS',status:'SUCCESS',domain:'NEXO',summary:'Scheduled runtime reached Durable Neon Bridge V1',updatedAt:'2026-09-08T10:00:00Z',metadata:{loop:'Continuity',checkpoint:'TERMINAL',readback_verified:true}}
];
const health={ok:true,contract:'v1',dataSource:{freshness:'LIVE',usedFallback:false,v1Transport:'VERCEL_OIDC_NEON_DATA_API'},semanticIndex:{available:true,count:5485,indexVersion:'v2'}};
test('operations model exposes execution, readback, blockers and integrity without provider details',()=>{
 const model=buildOperationsModel({ops,runs,health});
 assert.equal(model.available,true);
 assert.deepEqual(model.metrics,{runs:21,blocked:2,success:18,readback:'21/21'});
 assert.equal(model.blockers[0].label,'Acquire source');
 assert.equal(model.recentRuns[0].id,'r1');
 assert.equal(model.automations.length,2);
 assert.equal(model.integrity.health,'PASS');
 assert.equal(model.integrity.freshness,'LIVE');
 assert.equal(model.integrity.semanticIndex,5485);
 assert.doesNotMatch(JSON.stringify(model),/neon|oidc/i);
});

test('operations model keeps unavailable sources explicit instead of inventing zeros',()=>{
 const model=buildOperationsModel({ops:null,runs:null,health:null});
 assert.equal(model.available,false);
 assert.equal(model.metrics.runs,null);
 assert.equal(model.metrics.blocked,null);
 assert.equal(model.metrics.readback,null);
 assert.deepEqual(model.recentRuns,[]);
 assert.deepEqual(model.blockers,[]);
 assert.equal(model.integrity.health,'UNAVAILABLE');
});
