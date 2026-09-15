import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonalModel,proposePersonalActions,classifyPersonalProposal,reconcilePersonalFollowUps} from '../server/personal/loop.mjs';

const now=Date.parse('2026-09-15T16:30:00Z');
const live=at=>({state:'LIVE',observedAt:at,expiresAt:'2026-09-15T18:00:00Z'});
const baseWorld={version:'1',fingerprint:'WORLD-TEST',generatedAt:'2026-09-15T16:30:00Z',access:'PRIVATE'};

const world={...baseWorld,items:[
  {id:'gmail:m1',kind:'MESSAGE',title:'Status do projeto',summary:'alice@example.com',source:'gmail',sourceRef:'https://mail.google.com/mail/u/0/#inbox/m1',authority:'PROVIDER',freshness:live('2026-09-15T16:00:00Z'),contextId:'PERSONAL',attention:'NOTICE',actions:[],observedAt:'2026-09-15T16:00:00Z'},
  {id:'calendar:e1',kind:'EVENT',title:'Reunião A',source:'calendar',sourceRef:'https://calendar.google.com/calendar/event?eid=e1',authority:'PROVIDER',freshness:live('2026-09-15T16:10:00Z'),contextId:'PERSONAL',attention:'NOTICE',dueAt:'2026-09-16T14:00:00Z',endAt:'2026-09-16T15:00:00Z',actions:[],observedAt:'2026-09-15T16:10:00Z'},
  {id:'calendar:e2',kind:'EVENT',title:'Reunião B',source:'calendar',sourceRef:'https://calendar.google.com/calendar/event?eid=e2',authority:'PROVIDER',freshness:live('2026-09-15T16:10:00Z'),contextId:'PERSONAL',attention:'NOTICE',dueAt:'2026-09-16T14:30:00Z',endAt:'2026-09-16T15:30:00Z',actions:[],observedAt:'2026-09-15T16:10:00Z'},
  {id:'nexo:task:t1',kind:'ENTITY',title:'Entregar relatório',summary:'compromisso explícito',source:'nexo',sourceRef:'https://docs.google.com/spreadsheets/d/x/edit',authority:'CANONICAL',freshness:live('2026-09-15T16:20:00Z'),contextId:'PERSONAL',attention:'ACT',status:'NEEDS_ME',dueAt:'2026-09-16T18:00:00Z',actions:[],observedAt:'2026-09-15T16:20:00Z',personalType:'Task'}
]};

test('personal model creates stable provider-independent entities and observation events with provenance',()=>{
  const a=buildPersonalModel(world,{now});
  const b=buildPersonalModel({...world,generatedAt:'2026-09-15T16:31:00Z'},{now:now+60000});
  assert.equal(a.version,'1');
  assert.equal(a.fingerprint,b.fingerprint);
  assert.deepEqual(a.entities.map(x=>x.kind),['Event','Event','Message','Task']);
  const task=a.entities.find(x=>x.kind==='Task');
  assert.equal(task.source.provider,'nexo');
  assert.equal(task.source.source_id,'nexo:task:t1');
  assert.equal(task.status,'NEEDS_ME');
  assert.match(task.correlation_id,/^PCR-/);
  const event=a.events.find(x=>x.entity_id===task.id);
  assert.equal(event.type,'TASK_OBSERVED');
  assert.equal(event.provenance.source_ref,task.source.source_ref);
  assert.equal(event.confidence,1);
});

test('proposal engine reports provable calendar conflicts and explicit personal attention only',()=>{
  const model=buildPersonalModel(world,{now});
  const proposals=proposePersonalActions(model,{now});
  const conflict=proposals.find(x=>x.kind==='REVIEW_CALENDAR_CONFLICT');
  assert.ok(conflict);
  assert.deepEqual(conflict.entity_ids.sort(),model.entities.filter(x=>x.kind==='Event').map(x=>x.id).sort());
  assert.equal(conflict.evidence.length,2);
  const task=proposals.find(x=>x.kind==='TRACK_PERSONAL_ITEM');
  assert.ok(task);
  assert.equal(task.entity_ids.length,1);
  assert.equal(proposals.some(x=>x.kind==='REPLY_EMAIL'),false);
});

test('existing L0-L5 policy maps observation, inference, proposal, internal reversible writes, approved external writes and denied V1 writes',()=>{
  assert.deepEqual(classifyPersonalProposal({kind:'OBSERVE'}),{level:'L0',policy:'AUTO'});
  assert.deepEqual(classifyPersonalProposal({kind:'INFER'}),{level:'L1',policy:'AUTO'});
  assert.deepEqual(classifyPersonalProposal({kind:'REVIEW_CALENDAR_CONFLICT'}),{level:'L2',policy:'AUTO'});
  assert.deepEqual(classifyPersonalProposal({kind:'UPSERT_NEXO_TASK'}),{level:'L3',policy:'AUTO'});
  assert.deepEqual(classifyPersonalProposal({kind:'CREATE_GMAIL_DRAFT'}),{level:'L4',policy:'APPROVAL_REQUIRED'});
  assert.deepEqual(classifyPersonalProposal({kind:'CREATE_CALENDAR_EVENT'}),{level:'L4',policy:'APPROVAL_REQUIRED'});
  assert.deepEqual(classifyPersonalProposal({kind:'SEND_GMAIL'}),{level:'L5',policy:'DENY'});
  assert.deepEqual(classifyPersonalProposal({kind:'MUTATE_DRIVE'}),{level:'L5',policy:'DENY'});
});

test('task and commitment follow-ups remain open until canonical state or verified closing receipt closes them',()=>{
  const model=buildPersonalModel(world,{now});
  const task=model.entities.find(x=>x.kind==='Task');
  const open=reconcilePersonalFollowUps(model,[],{now});
  assert.equal(open.find(x=>x.entity_id===task.id)?.state,'OPEN');

  const verified=reconcilePersonalFollowUps(model,[{entity_id:task.id,verified:true,closes_follow_up:true,checked_at:'2026-09-15T16:25:00Z'}],{now});
  assert.equal(verified.find(x=>x.entity_id===task.id)?.state,'CLOSED');

  const doneModel={...model,entities:model.entities.map(x=>x.id===task.id?{...x,status:'DONE'}:x)};
  assert.equal(reconcilePersonalFollowUps(doneModel,[],{now}).find(x=>x.entity_id===task.id)?.state,'CLOSED');
});
