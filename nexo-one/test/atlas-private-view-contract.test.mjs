import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import {assertPrivateRuntimeProposal,PRIVATE_VIEW_REQUIREMENTS} from './helpers/private-view-contract.mjs';
import {buildLab} from '../src/features/lab/model.ts';
import {buildAtlasMetroModel} from '../src/atlas3d/atlasAdapter.ts';
import {globalSummary,humanActions} from '../src/viewmodels/system.ts';

// These validate shape/view-model preservation only, not the missing UI mount.
test('synthetic private proposal preserves atomic SystemState/world/topology/publication/galaxy',()=>{
  const fixture=makePrivateRuntimeFixture();
  const runtime=assertPrivateRuntimeProposal(fixture);
  assert.deepEqual(Object.keys(runtime).filter(key=>['system','world','topology','publication','galaxy'].includes(key)),['system','world','topology','publication','galaxy']);
  assert.equal(runtime.world.items[0].contextId,'OLYMPUS');
  assert.equal(runtime.world.contexts[0].itemIds[0],runtime.world.items[0].id);
  assert.equal(runtime.galaxy.entities[0].domain,'OLYMPUS');
});

test('existing laboratory model retains explicitly private Olympus evidence and roadmap',()=>{
  const {system}=assertPrivateRuntimeProposal(makePrivateRuntimeFixture());
  const lab=buildLab(system);
  const entity=lab.tests.get('TEST-01');
  assert.ok(entity);
  assert.equal(entity.domain,'OLYMPUS');
  assert.equal(entity.name,'Synthetic private test');
  assert.equal(entity.method,'Synthetic method');
  assert.equal(entity.result,'Synthetic result');
  assert.equal(entity.review,'PENDING_REVIEW');
  assert.equal(entity.prereg.metric,'Synthetic metric');
  assert.deepEqual(entity.prereg.success,['Synthetic success']);
  assert.deepEqual(lab.roadmaps.get('ROADMAP-01').tests,['TEST-01']);
  assert.equal(system.read_model.tests['TEST-01'].private,true);
});

test('existing interactive graph and operations models accept private Olympus records',()=>{
  const {system}=assertPrivateRuntimeProposal(makePrivateRuntimeFixture());
  const model=buildAtlasMetroModel(system,Date.parse(system.generated_at));
  assert.ok(model.nodes.some(node=>node.domain==='OLYMPUS'&&node.sourceId==='test:TEST-01'));
  assert.ok(model.crossLinks.some(link=>link.isLearning),'learning relationship retained');
  assert.ok(humanActions(system).some(action=>action.lane==='OLYMPUS'));
  assert.ok(globalSummary(system).domains.some(lane=>lane.domain==='OLYMPUS'));
});

test('private proposal rejects public labels, wrong generations and incomplete galaxy counts',()=>{
  for(const mutate of [
    data=>{data.access='PUBLIC';},
    data=>{data.world.access='PUBLIC';},
    data=>{data.publication.contract='NEXO_PUBLIC_PROJECTION_PUBLICATION_V1';},
    data=>{data.topology.source.projection_fingerprint='sha256:'+'d'.repeat(64);},
    data=>{data.publication.build_meta.projection_fingerprint='sha256:'+'d'.repeat(64);},
    data=>{data.galaxy.provenance.source_fingerprint='sha256:'+'d'.repeat(64);},
    data=>{data.galaxy.entities[0].observation={access:'PUBLIC_PROJECTION'};},
    data=>{data.galaxy.stats.entities=99;},
  ]){
    const fixture=makePrivateRuntimeFixture();mutate(fixture.data);
    assert.throws(()=>assertPrivateRuntimeProposal(fixture));
  }
});

test('proposal maps all retained surface families to an authenticated route and regression suites',()=>{
  assert.equal(PRIVATE_VIEW_REQUIREMENTS.length,8);
  assert.ok(PRIVATE_VIEW_REQUIREMENTS.every(row=>row.privateRoute.startsWith('#/privado/')&&row.component&&row.fields.length&&row.suites.length));
});

test('production source boundary validates full private runtime without stripping view fields',async()=>{
 const {validatePrivateRuntime}=await import('../server/atlas/private-runtime.mjs');
 const fixture=makePrivateRuntimeFixture();assert.deepEqual(validatePrivateRuntime(fixture.data),fixture.data);
 for(const mutate of [data=>{delete data.system;},data=>{delete data.world;},data=>{delete data.topology;},data=>{delete data.publication;},data=>{delete data.galaxy;},data=>{data.world.access='PUBLIC';},data=>{data.topology.source.projection_fingerprint='sha256:'+'d'.repeat(64);},data=>{data.galaxy.tower_revision='different-source';}]){const bad=makePrivateRuntimeFixture().data;mutate(bad);assert.throws(()=>validatePrivateRuntime(bad),/PRIVATE_RUNTIME_INVALID/);}
});
