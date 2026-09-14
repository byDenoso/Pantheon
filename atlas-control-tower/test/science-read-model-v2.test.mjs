import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScienceReadModelV2} from '../lib/science-read-model-v2.mjs';

const scienceIndex={
  sourceVersion:'drive-v1',
  generatedAt:'2026-09-14T15:00:00-03:00',
  programs:[{id:'P1',title:'Expansion',domain:'EXPANSION',status:'ACTIVE',summary:'program'}],
  campaigns:[{id:'C1',title:'H0 / anchors',primaryProgram:'P1',domain:'D1',status:'ACTIVE',summary:'Pergunta: qual H0 sobrevive? Mecanismo: stacks.',testCount:1}]
};
const testRow={id:'T1',label:'PEER + SH0ES',primaryCampaign:'C1',domains:['D1'],status:'SUPPORTED',summary:'published result',keyMetrics:'H0=71.5884',evidenceClass:'VALIDATED',lastVerified:'2026-09-14T14:00:00-03:00',sourceRef:'Drive/T1'};
const scienceShards={D1:{sourceVersion:'drive-v1',tests:[testRow]}};
const shardCatalog=[{id:'D1',path:'science-drive-projection/D1.json',sha256:'sha256:abc',declaredCount:1,includedCount:1,truncated:false,state:'READY'}];
const ledger=[{entityId:'T1',entityType:'TEST',firstSeenAt:'2026-09-14T15:00:00-03:00',lastSeenAt:'2026-09-14T15:00:00-03:00',firstHash:'sha256:t1',currentHash:'sha256:t1',revision:1,campaignId:'C1',domains:['D1'],state:'PUBLISHED'}];

test('builds canonical SYSTEM -> PROGRAM -> CAMPAIGN structure while D domains remain facets',()=>{
  const model=buildScienceReadModelV2({scienceIndex,scienceShards,shardCatalog,projectionLedger:ledger,activity:[],generatedAt:'2026-09-14T15:01:00-03:00'});
  assert.equal(model.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert.deepEqual(model.structure.programs.map(x=>x.id),['P1']);
  assert.equal(model.structure.campaigns[0].programId,'P1');
  assert.deepEqual(model.structure.campaigns[0].facets,['D1']);
  assert.deepEqual(model.structure.facets[0].campaignIds,['C1']);
  assert.ok(!model.structure.nodes.some(x=>x.type==='TEST'||x.type==='RESULT'));
});

test('keeps investigation records separate and emits H0 as a generic observation',()=>{
  const model=buildScienceReadModelV2({scienceIndex,scienceShards,shardCatalog,projectionLedger:ledger,activity:[],generatedAt:'2026-09-14T15:01:00-03:00'});
  assert.equal(model.investigation.tests.length,1);
  assert.equal(model.investigation.results.length,1);
  const h0=model.observations.find(x=>x.metricId==='cosmology.H0');
  assert.ok(h0);
  assert.equal(h0.kind,'interval');
  assert.equal(h0.value,71.5884);
  assert.equal(h0.unit,'km/s/Mpc');
  assert.equal(h0.stackLabel,'PEER + SH0ES');
  assert.equal(h0.uncertainty,undefined);
  assert.equal(h0.testId,'T1');
});

test('ambiguous H0 does not become an observation but source investigation record remains',()=>{
  const ambiguous={...testRow,id:'T2',keyMetrics:'H0=70.1 and H0=72.3'};
  const model=buildScienceReadModelV2({scienceIndex,scienceShards:{D1:{tests:[ambiguous]}},shardCatalog,projectionLedger:[],activity:[],generatedAt:'2026-09-14T15:01:00-03:00'});
  assert.equal(model.investigation.tests.length,1);
  assert.equal(model.observations.length,0);
  assert.equal(model.diagnostics.rejectedObservations,1);
});

test('surface state becomes PARTIAL when any declared shard is partial or unavailable',()=>{
  const model=buildScienceReadModelV2({scienceIndex,scienceShards,shardCatalog:[{...shardCatalog[0],state:'PARTIAL',truncated:true}],projectionLedger:ledger,activity:[],generatedAt:'2026-09-14T15:01:00-03:00'});
  assert.equal(model.state,'PARTIAL');
  assert.equal(model.freshness,'DEGRADED');
});

test('semantic fingerprint is stable across generation timestamps',()=>{
  const a=buildScienceReadModelV2({scienceIndex,scienceShards,shardCatalog,projectionLedger:ledger,activity:[],generatedAt:'2026-09-14T15:01:00-03:00'});
  const b=buildScienceReadModelV2({scienceIndex,scienceShards,shardCatalog,projectionLedger:ledger,activity:[],generatedAt:'2026-09-14T16:01:00-03:00'});
  assert.equal(a.fingerprint,b.fingerprint);
});
