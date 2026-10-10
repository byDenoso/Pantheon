import test from 'node:test';
import assert from 'node:assert/strict';
import {createRetrievalService,RETRIEVAL_TOOL_NAMES} from '../server/mcp/retrieval-tools.mjs';
const revision='sha256:'+'a'.repeat(64);
const tower={contract:'NEXO_TOWER_LIVE_V1',stable_file_id:'tower-test',storage:'GOOGLE_DRIVE_PRIVATE',revision,state_fingerprint:revision,files:{
  'entities/test/T-OPEN.json':{encoding:'json',value:{kind:'TEST',id:'T-OPEN',title:'Open test',status:'READY',hypothesis_id:'HYP-OPEN',parameter:67.4}},
  'entities/hypothesis/HYP-OPEN.json':{encoding:'json',value:{kind:'HYPOTHESIS',id:'HYP-OPEN',title:'Hubble test family',status:'ACTIVE'}},
  'entities/test/T-PRIVATE.json':{encoding:'json',value:{kind:'TEST',id:'T-PRIVATE',title:'Secret client test',status:'READY',visibility:'PRIVATE'}},
  'entities/test/T-ROLE.json':{encoding:'json',value:{kind:'TEST',id:'T-ROLE',title:'Role bound test',status:'READY',allowed_roles:['CIENTISTA']}},
  'entities/test/CLIENT-SECRET.json':{encoding:'json',value:{kind:'TEST',id:'CLIENT-SECRET',title:'Client secret',status:'READY'}}
}};
const principal={authenticated:true,id:'b'.repeat(64),roles:['CIENTISTA']};
const service=createRetrievalService({readTower:async()=>({tower,observedAt:'2026-10-06T12:00:00Z'})});

test('authenticated exact search returns provenance and excludes private records',async()=>{
  const found=await service.call('nexo_search',{query:'T-OPEN',role:'CIENTISTA'},principal);
  assert.equal(found.hits[0].citation.object_id,'T-OPEN');
  assert.equal(found.hits[0].citation.tower_revision,revision);
  assert.equal((await service.call('nexo_search',{query:'T-PRIVATE',role:'CIENTISTA'},principal)).hits.length,0);
  assert.equal((await service.call('nexo_search',{query:'CLIENT-SECRET',role:'CIENTISTA'},principal)).hits.length,0);
});
test('role ACL and relation trace are enforced before graph traversal',async()=>{
  const found=await service.call('nexo_search',{query:'T-ROLE',role:'CIENTISTA'},principal);assert.equal(found.hits[0].citation.object_id,'T-ROLE');
  const trace=await service.call('nexo_trace',{entity:'T-OPEN',role:'CIENTISTA',depth:2},principal);
  assert.ok(trace.nodes.some(x=>x.id.includes('HYP-OPEN')));
  await assert.rejects(()=>service.call('nexo_search',{query:'T-OPEN',role:'EXECUTOR'},principal),/ROLE_FORBIDDEN/);
});
test('as_of fails explicitly until a deployed history reader exists',async()=>{
  await assert.rejects(()=>service.call('nexo_search',{query:'T-OPEN',role:'CIENTISTA',as_of:'2026-09-01T00:00:00Z'},principal),/HISTORY_RUNTIME_NOT_DEPLOYED/);
  const caps=await service.call('nexo_retrieval_capabilities',{role:'CIENTISTA'},principal);
  assert.equal(caps.history.status,'NOT_DEPLOYED');assert.equal(caps.other_runtimes_authorized,false);
  assert.deepEqual(caps.tools,RETRIEVAL_TOOL_NAMES.filter(x=>x!=='nexo_retrieval_capabilities'));
});
test('negative query abstains and evidence is bounded',async()=>{
  assert.equal((await service.call('nexo_search',{query:'NEXO_NONEXISTENT_TOKEN_928374',role:'CIENTISTA'},principal)).hits.length,0);
  const evidence=await service.call('nexo_evidence',{query:'Hubble test family',role:'CIENTISTA',budget_chars:1200},principal);
  assert.ok(evidence.context_chars<=1200);assert.match(evidence.context,/Tower\/CONTROL/);
});
