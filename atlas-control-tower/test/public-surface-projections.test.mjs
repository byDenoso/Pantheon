import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicSurfaces} from '../lib/public-surface-projections.mjs';

const fixture=()=>({
 sourceVersion:'v1',
 scienceIndex:{
  domains:[{id:'domain:D1',code:'D1',label:'Hubble',question:'Qual H0?',scientificState:'ACTIVE'}],
  campaigns:[{id:'C1',label:'H0 stacks',domain:'D1',question:'Comparar stacks',status:'ACTIVE',testCount:1}]
 },
 scienceShards:{D1:{tests:[{id:'T1',label:'Stack A',status:'SUPPORTED',summary:'resultado publicado',keyMetrics:'H0=71.5884',lastVerified:'2026-09-14T10:00:00Z',primaryCampaign:'C1',domains:['D1'],email:'person@example.com',privateDriveId:'secret'}]}},
 drive:{
  learning:[{id:'L1',status:'CANDIDATE',title:'Null audit',domains:'SCIENCE|ENGINEERING',summary:'pattern',support:1,contradict:0,confidence:.7,provenance:'public-ref',privateDriveId:'secret'}],
  crossDomain:[],
  integrity:[{id:'I1',scope:'SCIENCE',type:'INTEGRITY',status:'PASS',severity:'LOW',observed:'ok',readbackRef:'public-readback',checkedAt:'2026-09-14T10:00:00Z',email:'person@example.com'}],
  actions:[{id:'A1',status:'BLOCKED',title:'Resolve source',summary:'SCIENCE | blocked',updatedAt:'2026-09-14T10:05:00Z',privateDriveId:'secret'}],
  olympus:[{id:'PERSON-1',title:'Private person',email:'person@example.com'}]
 }
});

test('dedicated surfaces expose investigative records without polluting structural graph data',()=>{
 const result=buildPublicSurfaces(fixture());
 assert.equal(result.laboratory.payload.items.some(x=>x.type==='TEST'),true);
 assert.equal(result.laboratory.payload.items.some(x=>x.type==='RESULT'),true);
 assert.equal(result.observatory.payload.h0Stacks.length,1);
 assert.equal(result.observatory.payload.h0Stacks[0].h0,71.5884);
 assert.equal(result.activity.payload.items[0].stage,'ACTION_STATE');
});

test('surface projection is allowlist-first and excludes personal/private source fields',()=>{
 const result=buildPublicSurfaces(fixture());
 const body=JSON.stringify(result);
 assert.equal(body.includes('person@example.com'),false);
 assert.equal(body.includes('privateDriveId'),false);
 assert.equal(body.includes('PERSON-1'),false);
 assert.equal(body.includes('secret'),false);
});

test('learning, operations, activity, audit and search are independent public surfaces',()=>{
 const result=buildPublicSurfaces(fixture());
 for(const key of ['learning','operations','activity','audit','search'])assert.equal(result[key].descriptor.state,'READY');
 assert.equal(result.learning.payload.items[0].id,'L1');
 assert.equal(result.operations.payload.actions[0].id,'A1');
 assert.equal(result.audit.payload.items[0].id,'I1');
 assert.ok(result.search.payload.items.some(x=>x.id==='T1'&&x.route==='/laboratorio'));
});
