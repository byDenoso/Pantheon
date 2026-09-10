import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProjectionBus,PROJECTION_CONTRACT,BUS_ID} from '../server/compiler/projection-bus.mjs';

const NOW=Date.parse('2026-09-09T23:00:00-03:00');
function item(id,{kind='ENTITY',source='nexo',authority='CANONICAL',revision='r1',status}={}){
  return {id,kind,title:id,summary:'x',source,sourceRef:`https://source/${id}`,sourceRevision:revision,authority,contextId:'NEXO',observedAt:'2026-09-09T22:55:00-03:00',freshness:{state:'LIVE',observedAt:'2026-09-09T22:55:00-03:00',expiresAt:'2026-09-10T00:00:00-03:00'},actions:[],...(status?{status}:{})};
}
function readerFor({nexoStatus='AVAILABLE',githubStatus='AVAILABLE',vercelStatus='AVAILABLE',revision='r1'}={}){
  return async id=>{
    const status=id==='nexo'?nexoStatus:id==='github'?githubStatus:vercelStatus;
    const items=id==='nexo'?[item('entity:ssot',{revision}),item('action:A-1',{kind:'ACTION',revision})]:id==='github'?[item('issue:1',{source:'github',authority:'PROVIDER',revision})]:[item('deploy:1',{source:'vercel',authority:'PROVIDER',revision})];
    return {provider:{id,status,checkedAt:new Date(NOW).toISOString(),lastSuccessAt:new Date(NOW-1000).toISOString(),revision,partial:false,count:items.length,message:status==='AVAILABLE'?'ok':'down'},items};
  };
}

test('ProjectionEnvelope carries provenance/freshness and projections are non-authoritative',async()=>{
  const bus=await buildProjectionBus({now:NOW,reader:readerFor()});
  assert.equal(bus.contract,PROJECTION_CONTRACT);
  assert.equal(bus.bus,BUS_ID);
  assert.equal(bus.envelopes.length,4);
  const action=bus.envelopes.find(x=>x.source==='ACTION_REGISTER');
  assert.ok(action);
  for(const key of ['entity_id','domain','authority_class','source_ref','source_revision','fingerprint','freshness','derivation_rule','state'])assert.ok(key in action,key);
  assert.equal(action.projection_role,'NON_AUTHORITATIVE');
  assert.equal(action.entity_id,'action:A-1');
  assert.equal(action.source_revision,'r1');
  assert.equal(action.freshness.state,'LIVE');
});

test('source revision changes envelope and bus fingerprints',async()=>{
  const a=await buildProjectionBus({now:NOW,reader:readerFor({revision:'r1'})});
  const b=await buildProjectionBus({now:NOW,reader:readerFor({revision:'r2'})});
  assert.notEqual(a.fingerprint,b.fingerprint);
  assert.notEqual(a.envelopes[0].fingerprint,b.envelopes[0].fingerprint);
});

test('unavailable source is explicit DEGRADED and never masquerades as LIVE',async()=>{
  const bus=await buildProjectionBus({now:NOW,reader:readerFor({vercelStatus:'UNAVAILABLE'})});
  const vercel=bus.envelopes.find(x=>x.source==='VERCEL');
  assert.ok(vercel);
  assert.equal(vercel.state,'DEGRADED');
  assert.equal(bus.state,'DEGRADED');
  assert.equal(bus.sources.find(x=>x.id==='VERCEL').state,'DEGRADED');
});

test('NEXO SSoT and ACTION_REGISTER are projections of one NEXO read, not duplicate authorities',async()=>{
  let nexoReads=0;
  const base=readerFor();
  const reader=async(id,opts)=>{if(id==='nexo')nexoReads++;return base(id,opts);};
  const bus=await buildProjectionBus({now:NOW,reader});
  assert.equal(nexoReads,1);
  assert.equal(bus.envelopes.filter(x=>x.source==='NEXO_SSOT').length,1);
  assert.equal(bus.envelopes.filter(x=>x.source==='ACTION_REGISTER').length,1);
});
