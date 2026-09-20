import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoadmapSurface,scientificFingerprintV2} from '../lib/nexo-roadmap.mjs';

const frozen={
 roadmap_id:'RM-1',title:'Roadmap',domain:'SCIENCE',state:'ACTIVE',execution_policy:'AUTO',claim_boundary:'bounded',
 tests:[
  {roadmap_test_id:'R1',sequence:1,question:'Q1',dataset_and_selection:'D',null:'N',rival:'R',priors:'P',likelihood:'L',covariance:'C',observable:'O',cuts:'X',parameterization:'PAR',method:'M',decision_rule:'RULE',success_criteria:['S'],kill_criteria:['K'],claim_boundary:'B'},
  {roadmap_test_id:'R2',sequence:2,depends_on:['R1'],question:'Q2',dataset_and_selection:'D',null:'N',rival:'R',priors:'P',likelihood:'L',covariance:'C',observable:'O',cuts:'X',parameterization:'PAR',method:'M',decision_rule:'RULE',success_criteria:['S'],kill_criteria:['K'],claim_boundary:'B'}
 ]
};
function gateway(work={}){
 return {
  async readControl(){return {scientific_roadmap_index:'TOWER_V06/indexes/active-roadmaps.json'};},
  async readJson(path){
   if(path==='indexes/active-roadmaps.json')return {contract:'SCIENTIFIC_ROADMAP_INDEX_V1',items:[{roadmap_id:'RM-1',state:'ACTIVE',priority:'HIGH',canonical_path:'TOWER_V06/roadmaps/RM-1.json'}]};
   if(path==='roadmaps/RM-1.json')return frozen;
   return null;
  },
  async readEntity(kind,id){return work[id]||null;},
  async readActiveWorkIndex(){return {work:Object.values(work)};}
 };
}
test('v2 fingerprint is accent/case stable and changes with priors',()=>{
 const a=scientificFingerprintV2({question:'Órbita X',priors:'A',success_criteria:['Z']});
 const b=scientificFingerprintV2({question:'orbita   x',priors:'a',success_criteria:['z']});
 const c=scientificFingerprintV2({question:'orbita x',priors:'b',success_criteria:['z']});
 assert.equal(a,b);assert.notEqual(a,c);
});
test('roadmap frontier exposes first materializable test from canonical Drive/Git gateway',async()=>{
 const surface=createRoadmapSurface({towerGateway:gateway()});
 const next=await surface.getNextRoadmapTest();
 assert.equal(next.state,'READY_TO_MATERIALIZE');
 assert.equal(next.roadmap_id,'RM-1');assert.equal(next.roadmap_test_id,'R1');
 assert.match(next.canonical_test_id,/^T-SCI-[0-9A-F]{20}$/);
});
test('roadmap frontier advances dependency after terminal work',async()=>{
 const fp=scientificFingerprintV2({...frozen.tests[0],title:'Q1',roadmap_id:'RM-1',roadmap_test_id:'R1'});
 const first='WORK::T-SCI-'+fp.slice(7,27).toUpperCase();
 const surface=createRoadmapSurface({towerGateway:gateway({[first]:{id:first,status:'RESULT',entity_version:1}})});
 const next=await surface.getNextRoadmapTest('RM-1');
 assert.equal(next.state,'READY_TO_MATERIALIZE');assert.equal(next.roadmap_test_id,'R2');
});
