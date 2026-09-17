import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraphMode,GRAPH_MODES} from '../src/viewmodels/graph-modes.ts';

const fresh={state:'LIVE',observed_at:'2026-09-16T20:00:00Z',ttl_seconds:900};
const action={action_id:'ACT-1',lane:'NEXO',title:'Sync source',status:'APPLIED',required_operation:'WRITE',capability_id:'CAP-1',runtime:'NEXO_KERNEL',effect_key:'EFF-1',input_fingerprint:'fp-action',readback:{status:'CONFIRMED',provider:'nexo',observed_fingerprint:'fp-rb',checked_at:'2026-09-16T20:01:00Z',explanation:'verified'},receipt_ref:'receipt:1',blocker:null,next_action:'none',risk:'LOW',reversible:true,eligibility:'ok',human_gate:null,source_ref:'src:action',fingerprint:'fp-action',checked_at:'2026-09-16T20:01:00Z',freshness:fresh,updated_at:'2026-09-16T20:01:00Z'};
const capability={capability_id:'CAP-1',label:'Write NEXO',domain:'NEXO',runtime:'NEXO_KERNEL',operation:'WRITE',status:'PASS',risk:'LOW',provider:'nexo',last_verified_at:'2026-09-16T20:00:00Z',evidence_ref:'evidence:cap',explanation:'pass'};
const filament={id:'FIL-1',label:'Readback improves route',domain:'NEXO',kind:'PROCEDURAL',weight:.8,support:4,contradiction:1,status:'ESTABLISHED',evidence:['receipt:1'],source_ref:'src:filament',boundary:'Only same provider',from_label:'ACTION',to_label:'READBACK'};
const generalNodes=[
 {id:'domain:nexo',type:'DOMAIN',label:'NEXO',domain:'NEXO',state:'LIVE',authority_class:'TRUTH_OWNER',source_ref:'src:nexo',source_revision:'1',fingerprint:'d1',freshness:fresh,checked_at:'2026-09-16T20:00:00Z',summary:'root'},
 {id:'claim:1',type:'CLAIM',label:'Claim 1',domain:'SCIENCE',state:'LIVE',authority_class:'DERIVED',source_ref:'src:c',source_revision:'1',fingerprint:'c1',freshness:fresh,checked_at:'2026-09-16T20:00:00Z',summary:'claim'},
 {id:'test:1',type:'TEST',label:'Test 1',domain:'SCIENCE',state:'LIVE',authority_class:'DERIVED',source_ref:'src:t',source_revision:'1',fingerprint:'t1',freshness:fresh,checked_at:'2026-09-16T20:00:00Z',summary:'test'}
];
const state={contract_version:'1',generated_at:'2026-09-16T20:02:00Z',actions:[action],runs:[],capabilities:[capability],filaments:[filament],providers:[{id:'github',label:'GitHub',expected_for:['ENGINEERING'],state:'LIVE',capabilities:[],last_success_at:'2026-09-16T20:00:00Z',checked_at:'2026-09-16T20:00:00Z',explanation:'ok'}],findings:[],graph:{nodes:generalNodes,edges:[{id:'e1',from:'claim:1',to:'test:1',kind:'VERIFIES',weight:1,explanation:'test verifies claim'}]}};

test('all requested graph modes are available',()=>{
 assert.deepEqual(GRAPH_MODES.map(x=>x.id),['general','operations','truth','capabilities','learning','nexo']);
});

test('operational graph expresses action capability runtime effect and readback',()=>{
 const graph=buildGraphMode(state,'operations','PUBLIC');
 for(const id of ['action:ACT-1','capability:CAP-1','runtime:NEXO_KERNEL','effect:EFF-1','readback:ACT-1'])assert.ok(graph.nodes.some(n=>n.id===id),id);
 assert.ok(graph.edges.some(e=>e.from==='action:ACT-1'&&e.to==='capability:CAP-1'));
 assert.ok(graph.edges.some(e=>e.from==='effect:EFF-1'&&e.to==='readback:ACT-1'));
});

test('truth graph preserves verification relations from canonical graph',()=>{
 const graph=buildGraphMode(state,'truth','PUBLIC');
 assert.ok(graph.nodes.some(n=>n.id==='claim:1'));
 assert.ok(graph.nodes.some(n=>n.id==='test:1'));
 assert.ok(graph.edges.some(e=>e.kind==='VERIFIES'));
});

test('capability graph shows capability provider runtime and evidence projection',()=>{
 const graph=buildGraphMode(state,'capabilities','PUBLIC');
 for(const id of ['capability:CAP-1','provider:nexo','runtime:NEXO_KERNEL','evidence:CAP-1'])assert.ok(graph.nodes.some(n=>n.id===id),id);
});

test('learning graph preserves filament support contradiction and boundary in summary',()=>{
 const graph=buildGraphMode(state,'learning','PUBLIC');
 const node=graph.nodes.find(n=>n.id==='filament:FIL-1');
 assert.ok(node);
 assert.match(node.summary,/4 support/);
 assert.match(node.summary,/1 contradiction/);
 assert.match(node.summary,/Only same provider/);
});

test('nexo graph public mode does not materialize private provider payloads',()=>{
 const privateish={...state,providers:[...state.providers,{id:'gmail',label:'Gmail',expected_for:['NEXO'],state:'BLOCKED',capabilities:[],last_success_at:null,checked_at:'2026-09-16T20:00:00Z',explanation:'AUTH_REQUIRED private-message-body'}]};
 const graph=buildGraphMode(privateish,'nexo','PUBLIC');
 const gmail=graph.nodes.find(n=>n.id==='provider:gmail');
 assert.ok(gmail);
 assert.equal(gmail.summary.includes('private-message-body'),false);
 assert.match(gmail.summary,/AUTH_REQUIRED/);
});
