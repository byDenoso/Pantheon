import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtlasResearchView, RESEARCH_ROUTES} from '../server/compiler/atlas-research-api.mjs';

const snapshot={
  authority:'GOOGLE_DRIVE', projectionAuthority:'DERIVED_FROM_SSOT', sourceModifiedAt:'2026-09-12T12:00:00Z', generatedAt:'2026-09-12T12:01:00Z',
  sections:{WORK:[{work_id:'T-SCI-1',thread_id:'THR::SCIENCE::ROOT',kind:'TEST',question:'Does H0 survive?',status:'DONE',priority:'HIGH',method:'frozen',result_ref:'R1',updated_at:'2026-09-12T10:00:00Z'},{work_id:'ACT-OLY-1',thread_id:'THR::OLYMPUS::ROOT',kind:'ACTION',question:'private',status:'DONE'}],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]},
  projections:{Science:[{record_type:'program',record_id:'PROG-EXP',status:'ACTIVE',title:'Expansion',summary:'Program',domain:'EXPANSION',source_ref:'SRC'},{record_type:'campaign',record_id:'CAMP-H0',status:'ACTIVE',title:'H0 / acoustic ruler / anchors',summary:'Campaign',domain:'D1',source_ref:'SRC2'}],Engineering:[{record_type:'program',record_id:'PROG-ENG',status:'ACTIVE',title:'Atlas Control Tower',summary:'Engineering'}],Olympus:[{record_type:'program',record_id:'SECRET',status:'ACTIVE',title:'Private'}]}
};

test('exports the complete stable route set',()=>{assert(RESEARCH_ROUTES.has('atlas-graph'));assert(RESEARCH_ROUTES.has('observatory-summary'));assert(RESEARCH_ROUTES.has('lab-tests'));assert(RESEARCH_ROUTES.has('universe-snapshot'));});
test('all views use a shared public sanitized envelope',()=>{const out=buildAtlasResearchView(snapshot,'observatory-summary');assert.equal(out.contract,'NEXO_ATLAS_RESEARCH_API_V1');assert.equal(out.authority,'GOOGLE_DRIVE');assert.equal(out.access,'PUBLIC_SANITIZED');assert.equal(out.privacyGate,'OLYMPUS_EXCLUDED');assert.equal(out.freshness,'SNAPSHOT');});
test('graph contains public Science and Engineering structures but excludes Olympus',()=>{const out=buildAtlasResearchView(snapshot,'atlas-graph'),ids=out.data.nodes.map(x=>x.id);assert(ids.includes('system:NEXO'));assert(ids.includes('PROG-EXP'));assert(ids.includes('CAMP-H0'));assert(ids.includes('PROG-ENG'));assert(!ids.includes('SECRET'));assert(!JSON.stringify(out).includes('Private'));});
test('lab tests are derived only from explicit Science TEST work rows',()=>{const out=buildAtlasResearchView(snapshot,'lab-tests');assert.equal(out.status,'OK');assert.deepEqual(out.data.items.map(x=>x.id),['T-SCI-1']);assert.equal(out.data.items[0].status,'DONE');assert(!JSON.stringify(out).includes('ACT-OLY-1'));});
test('observatory parameter products stay empty without structured canonical values',()=>{const out=buildAtlasResearchView(snapshot,'observatory-parameters');assert.equal(out.status,'EMPTY');assert.deepEqual(out.data.items,[]);assert.match(out.data.reason,/structured/i);});
test('universe snapshot exposes structural coverage, not invented cosmology',()=>{const out=buildAtlasResearchView(snapshot,'universe-snapshot');assert.equal(out.data.coverage.programs,2);assert.equal(out.data.coverage.campaigns,1);assert.deepEqual(out.data.parameters,[]);});
