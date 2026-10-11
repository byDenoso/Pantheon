import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateMuralData} from '../src/private-workspace/mural.ts';

const handoff=(event_type,state,created_at,id='HO-SYNTH-1')=>({event_type,state,created_at,handoff_id:id,from_role:'LEARNER',to_role:'EXECUTOR',
  summary_plain:'Run a previously authorized synthetic test',next_action:'Execute the frozen recipe',entity_ref:'TEST-SYNTH-1',thread_id:'THR-SYNTH'});
const base={source_revision:'sha256:'+'a'.repeat(64),generated_at:'2026-10-11T00:00:00Z',read_model:{activity:[],roadmaps:[]},evolution:{board:[]}};

test('mural derives handoff lifecycle from the complete event stream',()=>{
 const data=privateMuralData({...base,read_model:{activity:[
   handoff('HANDOFF_CREATED','PENDING','2026-10-10T08:00:00Z'),
   handoff('HANDOFF_ACK','ACK','2026-10-10T09:00:00Z'),
   handoff('HANDOFF_DONE','DONE','2026-10-10T10:00:00Z')
 ],roadmaps:[]}});
 assert.equal(data.requests.length,1);
 assert.equal(data.requests[0].status,'DONE');
 assert.equal(data.requests[0].to,'EXECUTOR');
 assert.equal(data.requests[0].entity,'TEST-SYNTH-1');
 assert.equal(data.handoffEvents,3);
});

test('missing reply is not fabricated; board reply_to is a visible linked response',()=>{
 const data=privateMuralData({...base,evolution:{board:[
   {id:'BP-SYNTH-1',from:'LEARNER',to:'EXECUTOR',text:'Please run TEST-SYNTH-1',at:'2026-10-10T08:00:00Z'},
   {id:'BP-SYNTH-2',from:'EXECUTOR',to:'LEARNER',text:'Real artifact is recorded',at:'2026-10-10T09:00:00Z',reply_to:'BP-SYNTH-1'},
   {id:'BP-SYNTH-3',from:'LEARNER',to:'EXECUTOR',text:'Still waiting for the other test',at:'2026-10-10T10:00:00Z'}
 ]}});
 assert.equal(data.messages.length,2);
 assert.equal(data.messages.find(p=>p.id==='BP-SYNTH-1').replies.length,1);
 assert.equal(data.messages.find(p=>p.id==='BP-SYNTH-3').replies.length,0);
});

test('only proposed charters produce approval cards, never fictional approvals',()=>{
 const data=privateMuralData({...base,read_model:{activity:[],roadmaps:[
   {roadmap_id:'RM-SYNTH-PROPOSED',title:'Unanswered hypothesis',charter:{status:'PROPOSED',question:'What differs from null?',proposed_by:'LEARNER'}},
   {roadmap_id:'RM-SYNTH-APPROVED',title:'Existing run',charter:{status:'CHARTERED',question:'Already approved'}}
 ]}});
 assert.deepEqual(data.campaigns.map(row=>row.id),['RM-SYNTH-PROPOSED']);
 assert.equal(data.campaigns[0].proposedBy,'LEARNER');
});

test('PEER is excluded from both operational and campaign cards',()=>{
 const data=privateMuralData({...base,read_model:{activity:[
   handoff('HANDOFF_CREATED','PENDING','2026-10-10T08:00:00Z','HO-PEER-1'),
   handoff('HANDOFF_CREATED','PENDING','2026-10-10T08:01:00Z','HO-SYNTH-OK')
 ],roadmaps:[
  {roadmap_id:'RM-PEER-EXCLUDE',charter:{status:'PROPOSED',proposed_by:'LEARNER'}},
  {roadmap_id:'RM-SYNTH-VISIBLE',charter:{status:'PROPOSED',proposed_by:'LEARNER'}}
 ]},evolution:{board:[
  {id:'BP-PEER-EXCLUDE',from:'LEARNER',to:'EXECUTOR',text:'private model PEER',at:'2026-10-10T08:00:00Z'},
  {id:'BP-SYNTH-VISIBLE',from:'LEARNER',to:'EXECUTOR',text:'unrelated permitted request',at:'2026-10-10T09:00:00Z'}
 ]}});
 assert.deepEqual(data.requests.map(row=>row.id),['HO-SYNTH-OK']);
 assert.deepEqual(data.messages.map(row=>row.id),['BP-SYNTH-VISIBLE']);
 assert.deepEqual(data.campaigns.map(row=>row.id),['RM-SYNTH-VISIBLE']);
});
