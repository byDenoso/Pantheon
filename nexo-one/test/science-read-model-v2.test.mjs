import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScienceReadModelV2} from '../server/compiler/science-read-model-v2.mjs';
import {buildAtlasResearchView,RESEARCH_ROUTES} from '../server/compiler/atlas-research-api.mjs';

const snapshot={
  authority:'GOOGLE_DRIVE',projectionAuthority:'DERIVED_FROM_SSOT',sourceModifiedAt:'2026-09-12T12:00:00Z',generatedAt:'2026-09-12T12:01:00Z',
  sections:{WORK:[
    {work_id:'T-SCI-1',thread_id:'THR::SCIENCE::ROOT',kind:'TEST',question:'Does H0 survive?',status:'DONE',priority:'HIGH',method:'frozen',result_ref:'R1',updated_at:'2026-09-12T10:00:00Z'},
    {work_id:'R-SCI-1',thread_id:'THR::SCIENCE::ROOT',kind:'RESULT',question:'H0 result',status:'VERIFIED',updated_at:'2026-09-12T10:01:00Z'},
    {work_id:'ACT-OLY-1',thread_id:'THR::OLYMPUS::ROOT',kind:'ACTION',question:'private',status:'DONE'}
  ],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]},
  projections:{Science:[
    {record_type:'program',record_id:'PROG-EXP',status:'ACTIVE',title:'Expansion',summary:'Program',domain:'EXPANSION',source_ref:'SRC'},
    {record_type:'campaign',record_id:'CAMP-H0',status:'ACTIVE',title:'H0 / acoustic ruler / anchors',summary:'Campaign',domain:'D1',source_ref:'SRC2'}
  ],Engineering:[],Olympus:[{record_type:'program',record_id:'SECRET',status:'ACTIVE',title:'Private'}]}
};

const SRM_ROUTES=['science-read-model','science-changes','science-observations','science-comparisons','science-syntheses'];

test('compiler emits the SRM V2 structural contract without exposing Olympus',()=>{
  const model=buildScienceReadModelV2(snapshot);
  assert.equal(model.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert(model.structure.programs.some(item=>item.id==='PROG-EXP'));
  assert(model.structure.campaigns.some(item=>item.id==='CAMP-H0'));
  assert(model.structure.facets.some(item=>item.code==='D1'));
  assert.deepEqual(model.investigation.tests.map(item=>item.id),['T-SCI-1']);
  assert.deepEqual(model.investigation.results.map(item=>item.id),['R-SCI-1']);
  assert(!JSON.stringify(model).includes('ACT-OLY-1'));
  assert(!JSON.stringify(model).includes('SECRET'));
});

test('all five SRM read routes are public research routes',()=>{
  for(const route of SRM_ROUTES)assert(RESEARCH_ROUTES.has(route),route);
});

test('science-read-model route returns the same core SRM contract',()=>{
  const expected=buildScienceReadModelV2(snapshot);
  const out=buildAtlasResearchView(snapshot,'science-read-model');
  assert.equal(out.contract,'NEXO_ATLAS_RESEARCH_API_V1');
  assert.equal(out.data.contract,expected.contract);
  assert.equal(out.data.fingerprint,expected.fingerprint);
  assert.deepEqual(out.data.structure,expected.structure);
});

test('collection routes are views over the same SRM snapshot',()=>{
  const model=buildScienceReadModelV2(snapshot);
  assert.deepEqual(buildAtlasResearchView(snapshot,'science-observations').data.items,model.observations);
  assert.deepEqual(buildAtlasResearchView(snapshot,'science-comparisons').data.items,model.comparisons);
  assert.deepEqual(buildAtlasResearchView(snapshot,'science-syntheses').data.items,model.syntheses);
  const changes=buildAtlasResearchView(snapshot,'science-changes');
  assert.equal(changes.data.contract,'NEXO_ACTIVITY_LEDGER_V1');
  assert(Array.isArray(changes.data.items));
});
