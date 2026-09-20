import test from 'node:test';
import assert from 'node:assert/strict';
import {createScientificIntakeV2,scientificIdsV2} from '../lib/nexo-scientific-intake-v2.mjs';

function gateway(){
 const entities=new Map(),dispatches=[];
 const key=(kind,id)=>kind+':'+id;
 return {
  entities,dispatches,
  async readControl(){return {mode:'ACTIVE'};},
  async readEntity(kind,id){return entities.get(key(kind,id))||null;},
  async readActiveWorkIndex(){return {work:[...entities.entries()].filter(([k])=>k.startsWith('work:')).map(([,v])=>v)};},
  async readCapabilityManifest(){return {capabilities:{'scientific.generic_contract_executor_v1':{status:'ACTIVE',backend:'nexo_runtime'}}};},
  async submitTowerMutation(request){const current=entities.get(key(request.entity_kind,request.entity_name))||{id:request.entity_name,entity_version:0};entities.set(key(request.entity_kind,request.entity_name),{...current,...request.changes,id:request.entity_name,entity_version:Number(current.entity_version||0)+1});return {status:'COMPLETE',receipt:{accepted:true,readback:'PASS'}};},
  async dispatchRuntime(input){dispatches.push(input);return {status:'ACCEPTED',dispatch_mode:'TEST'};}
 };
}
const spec={question:'Teste físico',dataset_and_selection:'D',null:'N',rival:'R',priors:'P',likelihood:'L',covariance:'C',observable:'O',cuts:'X',parameterization:'PAR',method:'M',decision_rule:'RULE',claim_boundary:'B',success_criteria:['S'],kill_criteria:['K']};

test('structured v2 intake creates T-SCI and matching WORK identity with exact readback',async()=>{
 const g=gateway(),intake=createScientificIntakeV2({towerGateway:g});
 const result=await intake.submit({correlation_id:'CORR-1',tests:[spec],execute:false});
 const ids=scientificIdsV2(spec),row=result.tests[0];
 assert.equal(row.test_id,ids.testId);assert.equal(row.work_id,ids.workId);assert.equal(row.fingerprint_version,2);assert.equal(row.state,'PREPARED');
 assert.equal(g.entities.get('test:'+ids.testId).scientific_fingerprint,ids.fingerprint);
 assert.equal(g.entities.get('work:'+ids.workId).test_id,ids.testId);
});

test('generic ACTIVE capability is selected and executable',async()=>{
 const g=gateway(),intake=createScientificIntakeV2({towerGateway:g});
 const result=await intake.submit({correlation_id:'CORR-2',tests:[spec],execute:true});
 assert.equal(result.tests[0].state,'DISPATCHED');assert.equal(g.dispatches.length,1);assert.equal(g.dispatches[0].capability_id,'scientific.generic_contract_executor_v1');
});

test('replay attaches to existing work and does not duplicate canonical entities',async()=>{
 const g=gateway(),intake=createScientificIntakeV2({towerGateway:g});
 await intake.submit({correlation_id:'CORR-3',tests:[spec],execute:false});
 const before=g.entities.size;
 const replay=await intake.submit({correlation_id:'CORR-4',tests:[spec],execute:false});
 assert.equal(g.entities.size,before);assert.equal(replay.tests[0].state,'ATTACH_EXISTING');
});

test('material change in priors changes v2 TEST identity',()=>{
 const a=scientificIdsV2(spec),b=scientificIdsV2({...spec,priors:'P2'});
 assert.notEqual(a.testId,b.testId);
});
