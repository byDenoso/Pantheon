import test from 'node:test';
import assert from 'node:assert/strict';
import {buildControlTowerModel, loadControlTower} from '../ui/control-tower.mjs';

const health = {
 ok:true,
 dataSource:{effective:'v1',freshness:'LIVE',v1Health:{ok:true,version:'science_v1'}},
 semanticIndex:{available:true,count:5219,indexVersion:'atlas-cockpit-pt-v1-20260907'}
};
const ops = {
 counts:{actions:4,runs:16,events:58,blocked:2,success:14,readbackVerified:16},
 actions:[
  {id:'action:a',label:'Acquire DESI source',status:'BLOCKED',domain:'SCIENCE',summary:'waiting public release',updatedAt:'2026-09-07T18:00:00Z'},
  {id:'action:b',label:'Resolve pNGB entrypoint',status:'BLOCKED',domain:'SCIENCE',summary:'missing exact orchestration',updatedAt:'2026-09-07T17:00:00Z'},
  {id:'action:c',label:'Lean engine',status:'COMPLETED',domain:'ENGINEERING',summary:'',updatedAt:'2026-09-07T16:00:00Z'}
 ],
 events:[
  {id:'event:new',label:'Runtime remediation',status:'PASS',summary:'self-disable repaired',updatedAt:'2026-09-07T19:02:30Z',metadata:{event_type:'RUNTIME_BOTTLENECK_REMEDIATION'}},
  {id:'event:old',label:'Migration',status:'PASS',summary:'old event',updatedAt:'2026-09-06T17:37:41Z',metadata:{event_type:'MIGRATION'}}
 ]
};
const learning = {
 total:126,
 emergent:[
  {id:'promoted',items:[
   {id:'pattern:PAT-NEXO-POINTER-FIRST-RESOLUTION',relationType:'Pointer-first resource resolution',status:'VALIDATED'},
   {id:'policy:POL-NEXO-EXECUTION-CORE-V2',relationType:'Execution core',status:'ACTIVE'}
  ]}
 ]
};
const summary = {total:5058,counts:{TEST:2188,RESULT:1565,CLAIM:1195},projection:{sourceVersion:'2026-09-07T12:33:00Z'}};

test('model surfaces health, blockers, readback, recent changes and corpus state', () => {
 const model = buildControlTowerModel({
  health, ops, learning, summary,
  lastSeenAt:'2026-09-07T18:30:00Z',
  now:'2026-09-07T19:10:00Z'
 });

 assert.equal(model.health.find(x => x.id === 'science').state, 'good');
 assert.equal(model.health.find(x => x.id === 'semantic').state, 'good');
 assert.equal(model.health.find(x => x.id === 'blackbox').state, 'good');
 assert.equal(model.health.find(x => x.id === 'learning').state, 'good');
 assert.equal(model.attention.blockedCount, 2);
 assert.equal(model.attention.blockers.length, 2);
 assert.equal(model.attention.readbackLabel, '16/16');
 assert.equal(model.attention.readbackPercent, 100);
 assert.equal(model.corpus.total, 5058);
 assert.equal(model.corpus.tests, 2188);
 assert.equal(model.recent.newCount, 1);
 assert.equal(model.recent.items[0].id, 'event:new');
 assert.equal(model.promoted.length, 2);
});

test('model remains renderable when auxiliary sources are independently unavailable', () => {
 const model = buildControlTowerModel({health:null,ops:null,learning:null,summary:null,lastSeenAt:null,now:'2026-09-07T19:10:00Z'});
 assert.equal(model.health.every(x => x.state === 'unknown'), true);
 assert.equal(model.attention.blockedCount, 0);
 assert.equal(model.attention.readbackLabel, '—');
 assert.equal(model.corpus.total, null);
 assert.deepEqual(model.recent.items, []);
 assert.deepEqual(model.promoted, []);
});

test('loader degrades per source instead of rejecting the whole command center', async () => {
 const api = {
  health: async () => health,
  ops: async () => {throw new Error('ops down')},
  learning: async () => learning
 };
 const model = await loadControlTower(api,{summary,lastSeenAt:'2026-09-07T18:30:00Z',now:'2026-09-07T19:10:00Z'});
 assert.equal(model.health.find(x => x.id === 'science').state, 'good');
 assert.equal(model.health.find(x => x.id === 'blackbox').state, 'unknown');
 assert.equal(model.health.find(x => x.id === 'learning').state, 'good');
 assert.equal(model.attention.blockedCount, 0);
 assert.equal(model.corpus.tests, 2188);
});
