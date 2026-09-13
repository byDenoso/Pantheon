import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGithubCanonical} from '../lib/github-canonical-projection.mjs';

const state={
  authority:{
    contract:'NEXO_CANONICAL_GITHUB_V1',authority:'GITHUB',repository:'byDenoso/Pantheon',ref:'main',
    projection:{transportPath:'atlas-control-tower/data/nexo-drive-projection.json'}
  },
  payload:{
    meta:{authority:'GOOGLE_DRIVE',schemaVersion:'drive-ssot-v1',sourceModifiedAt:'2026-09-11T16:13:27.114Z',generatedAt:'2026-09-11T19:26:00.000Z'},
    science:[{record_type:'CAMPAIGN',record_id:'CAMP-CMB-ANOMALIES',status:'ACTIVE',title:'CMB anomalies & systematics',summary:'',domain:'D7',source_ref:'Test Registry'}],
    engineering:[],olympus:[],learning:[],crossDomain:[],integrity:[],actions:[]
  },
  fingerprint:'sha256:test'
};

test('projection freshness reflects snapshot age instead of GitHub transport availability',()=>{
  const graph=projectGithubCanonical(state,'graph',{focus:'system:SCIENCE'});
  assert.equal(graph.freshness,'SNAPSHOT');
  assert.equal(graph.sourceVersion,'2026-09-11T16:13:27.114Z');
  assert.equal(graph.schemaVersion,'drive-ssot-v1');
});

test('science domain has a human semantic label without replacing canonical id',()=>{
  const graph=projectGithubCanonical(state,'graph',{focus:'system:SCIENCE'});
  const domain=graph.nodes.find(node=>node.id==='domain:D7');
  assert.equal(domain.domain,'D7');
  assert.match(domain.domainLabel,/CMB/i);
  assert.match(domain.label,/CMB/i);
});

test('entity inspector contract makes absence and provenance explicit',()=>{
  const response=projectGithubCanonical(state,'entity',{id:'CAMP-CMB-ANOMALIES'});
  const entity=response.entity;
  assert.equal(response.contract,'nexo-entity-v2');
  assert.equal(entity.id,'CAMP-CMB-ANOMALIES');
  assert.equal(entity.canonicalId,'CAMP-CMB-ANOMALIES');
  assert.equal(entity.type,'CAMPAIGN');
  assert.equal(entity.status,'ACTIVE');
  assert.equal(entity.domain,'D7');
  assert.match(entity.domainLabel,/CMB/i);
  assert.equal(entity.what,null);
  assert.equal(entity.how,null);
  assert.equal(entity.why,null);
  assert.equal(entity.summary,null);
  assert.equal(entity.authority,'GITHUB');
  assert.equal(entity.evidenceClass,'PROJECTION');
  assert.equal(entity.freshness,'SNAPSHOT');
  assert.ok(Array.isArray(entity.provenance) && entity.provenance.length>0);
  assert.equal(entity.availability.summary,'ABSENT');
});

test('universe absence is not silently converted into INCONCLUSIVE',()=>{
  const universe=projectGithubCanonical(state,'universe');
  assert.equal(universe.contract,'nexo-universe-v2');
  assert.equal(universe.synthesis.availability,'UNAVAILABLE');
  assert.equal(universe.synthesis.conclusion,null);
  assert.equal(universe.synthesis.summary,null);
  assert.notEqual(universe.synthesis.status,'INCONCLUSIVE');
});
