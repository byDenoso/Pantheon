import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewModel } from '../src/data/overview-model.ts';

const state={
 counts:{TEST:2203,RESULT:1570,CLAIM:1195,DOMAIN:12},claims:{active:30,blocked:1},domains:{D1:200,D2:279,D3:219},
 projection:{source:'v1',freshness:'LIVE',sourceVersion:'2026-09-09T22:49:27Z'},sources:{neon:{status:'READ_OK'}}
};
const ops={
 truthFlow:['Drive','Neon','Atlas'],counts:{actions:4,runs:21,blocked:2,success:18,readbackVerified:21},
 actions:[
  {id:'a1',label:'Low priority blocker',status:'BLOCKED',domain:'SCIENCE',metadata:{priority:2,blocker_reason:'WAIT'}},
  {id:'a2',label:'High priority blocker',status:'BLOCKED',domain:'SCIENCE',metadata:{priority:1,blocker_reason:'SOURCE'}},
  {id:'a3',label:'Done',status:'COMPLETED',domain:'NEXO',metadata:{priority:1}}
 ],
 events:[
  {id:'e1',label:'Older',status:'SUCCESS',summary:'old',domain:'ENGINEERING',updatedAt:'2026-09-08T10:00:00Z'},
  {id:'e2',label:'Newest',status:'BLOCKED_L3_CREDENTIAL',summary:'credential boundary',domain:'ENGINEERING',updatedAt:'2026-09-10T20:00:00Z'}
 ]
};
const audit={total:92,open:0,resolved:92};
test('overview derives decision metrics only from declared source values',()=>{
 const model=buildOverviewModel({state,ops,audit});
 assert.equal(model.metrics.activeClaims,30);
 assert.equal(model.metrics.blockedActions,2);
 assert.equal(model.metrics.tests,2203);
 assert.equal(model.metrics.readback,'21/21');
 assert.equal(model.science.domains,3);
 assert.equal(model.provenance.openIssues,0);
 assert.deepEqual(model.attention.map(x=>x.label),['High priority blocker','Low priority blocker']);
 assert.equal(model.changes[0].label,'Newest');
 assert.match(model.source.label,/PROJEÇÃO CANÔNICA/);
 assert.doesNotMatch(JSON.stringify(model),/neon/i);
});

test('missing sources become unavailable instead of fabricated zeroes',()=>{
 const model=buildOverviewModel({state:null,ops:null,audit:null});
 assert.equal(model.availability.state,false);
 assert.equal(model.availability.ops,false);
 assert.equal(model.availability.audit,false);
 assert.equal(model.metrics.activeClaims,null);
 assert.equal(model.metrics.blockedActions,null);
 assert.equal(model.metrics.readback,null);
 assert.equal(model.provenance.openIssues,null);
 assert.deepEqual(model.attention,[]);
 assert.deepEqual(model.changes,[]);
});
