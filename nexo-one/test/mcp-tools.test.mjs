import test from 'node:test';
import assert from 'node:assert/strict';
import {MCP_TOOL_NAMES,executeMcpTool} from '../server/mcp/tools.mjs';

const snapshot={
  sourceModifiedAt:'2026-09-12T12:00:00Z',generatedAt:'2026-09-12T12:01:00Z',
  sections:{WORK:[
    {work_id:'T-H0',thread_id:'THR::SCIENCE::ROOT',kind:'TEST',question:'H0 test',status:'DONE',primary_campaign:'CAMP-H0',source_ref:'SRC-T'},
    {work_id:'E-H0',thread_id:'THR::SCIENCE::ROOT',kind:'EVIDENCE',question:'H0 evidence',status:'VERIFIED',primary_campaign:'CAMP-H0',source_ref:'SRC-E'},
    {work_id:'PRIVATE',thread_id:'THR::OLYMPUS::ROOT',kind:'EVIDENCE',question:'client secret',status:'DONE'}
  ],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]},
  projections:{Science:[
    {record_type:'program',record_id:'PROG-EXP',status:'ACTIVE',title:'Expansion',summary:'Expansion program',domain:'EXPANSION',source_ref:'SRC-P'},
    {record_type:'campaign',record_id:'CAMP-H0',program_id:'PROG-EXP',status:'ACTIVE',title:'H0 campaign',summary:'H0 campaign summary',domain:'D1',source_ref:'SRC-C'},
    {record_type:'observation',record_id:'OBS-H0',observation_id:'OBS-H0',observation_kind:'scalar',metric_id:'cosmology.H0',metric_value:71.5884,unit:'km/s/Mpc',campaign_id:'CAMP-H0',test_id:'T-H0',domains:['D1'],stack_id:'STACK-A',stack_label:'Stack A',source_ref:'SRC-O'}
  ],Engineering:[],Olympus:[{record_type:'program',record_id:'SECRET',title:'Private client'}]}
};

const expected=['get_science_state','get_changes','search_atlas','get_program','get_campaign','get_observations','get_h0_stacks','get_evidence_chain','get_operations','get_activity','get_provenance'];

test('MCP exposes exactly the approved read-only tools',()=>{
  assert.deepEqual(MCP_TOOL_NAMES,expected);
  assert(!MCP_TOOL_NAMES.some(name=>/(write|update|delete|create|mutate|sync|execute)/i.test(name)));
});

test('get_science_state returns the sanitized SRM V2 state',async()=>{
  const out=await executeMcpTool(snapshot,'get_science_state',{});
  assert.equal(out.contract,'NEXO_SCIENCE_READ_MODEL_V2');
  assert(out.structure.programs.some(item=>item.id==='PROG-EXP'));
  assert(!JSON.stringify(out).includes('client secret'));
  assert(!JSON.stringify(out).includes('Private client'));
});

test('get_h0_stacks returns only explicit H0 observations without inventing uncertainty',async()=>{
  const out=await executeMcpTool(snapshot,'get_h0_stacks',{});
  assert.equal(out.items.length,1);
  assert.equal(out.items[0].metricId,'cosmology.H0');
  assert.equal(out.items[0].value,71.5884);
  assert.equal(out.items[0].uncertainty,undefined);
});

test('get_campaign joins only provable campaign-linked records',async()=>{
  const out=await executeMcpTool(snapshot,'get_campaign',{id:'CAMP-H0'});
  assert.equal(out.campaign.id,'CAMP-H0');
  assert.deepEqual(out.tests.map(item=>item.id),['T-H0']);
  assert.deepEqual(out.evidence.map(item=>item.id),['E-H0']);
  assert.deepEqual(out.observations.map(item=>item.id),['OBS-H0']);
});

test('search_atlas never leaks Olympus/private rows',async()=>{
  const publicHit=await executeMcpTool(snapshot,'search_atlas',{query:'H0'});
  assert(publicHit.items.some(item=>item.id==='CAMP-H0'));
  const privateHit=await executeMcpTool(snapshot,'search_atlas',{query:'client'});
  assert.deepEqual(privateHit.items,[]);
});

test('unknown MCP tool fails closed',async()=>{
  await assert.rejects(()=>executeMcpTool(snapshot,'delete_everything',{}),/UNKNOWN_MCP_TOOL/);
});


test('science model cache keys on semantic fingerprint without freezing generatedAt',async()=>{
  const fingerprint='sha256:'+'a'.repeat(64);
  const first=await executeMcpTool({...snapshot,fingerprint,generatedAt:'2026-09-12T12:01:00Z'},'get_science_state',{});
  const second=await executeMcpTool({...snapshot,fingerprint,generatedAt:'2026-09-12T12:02:00Z'},'get_science_state',{});
  assert.equal(first.fingerprint,second.fingerprint);
  assert.equal(second.generatedAt,'2026-09-12T12:02:00Z');
  const changes=await executeMcpTool({...snapshot,fingerprint,generatedAt:'2026-09-12T12:03:00Z'},'get_changes',{});
  assert.equal(changes.contract,'NEXO_ACTIVITY_LEDGER_V1');
});
