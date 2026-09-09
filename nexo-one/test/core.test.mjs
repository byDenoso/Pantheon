import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {compile,worldDiff} from '../server/compiler/world-state.mjs';
import {classify} from '../server/compiler/attention.mjs';
import {item,ProviderError} from '../server/adapters/http.mjs';
import {readProvider,clearProviderCache} from '../server/adapters/registry.mjs';
import {normalizeAtlas} from '../server/adapters/atlas.mjs';
import {validateItem,safeUrl} from '../src/contracts/validate.mjs';
import {dayItems,overlap,parseCommand,diffWorld} from '../src/app/model.ts';
const now=Date.parse('2026-09-09T12:00:00Z');
const row=(id='a',extra={})=>item('github',id,'A source item',`https://github.com/byDenoso/Pantheon/issues/${id}`,now,extra);
const result=(items=[row()],overrides={})=>({items,provider:{id:'github',label:'GitHub',status:'AVAILABLE',lastSuccessAt:new Date(now).toISOString(),checkedAt:new Date(now).toISOString(),revision:'r1',message:'OK',partial:false,count:items.length,...overrides}});
beforeEach(clearProviderCache);
test('contracts reject missing provenance, invalid dates, wrong provider and executable links',()=>{
  assert.equal(validateItem(row(),'github'),true);
  for(const extra of [{sourceRef:''},{source:'drive'},{freshness:{state:'LIVE'}},{dueAt:'invalid'},{actions:[{id:'a',label:'x',kind:'OPEN_SOURCE',url:'javascript:alert(1)'}]},{title:''},{status:'invented'},{waitingOn:'person'},{contextId:'OTHER'}])assert.equal(validateItem(row('a',extra),'github'),false);
  for(const url of ['javascript:alert(1)','http://example.com','https://secret@host.com','/relative'])assert.equal(safeUrl(url),null);
});
test('compiler is deterministic under provider/item order and read-clock changes',()=>{
  const a=compile([result([row('b'),row('a')])],{now});
  const b=compile([result([row('a'),row('b')])],{now:now+1000});
  assert.equal(a.fingerprint,b.fingerprint);assert.deepEqual(a.items,b.items);
});
test('invalid records and duplicate IDs are rejected with a visible issue',()=>{
  const w=compile([result([row(),row(),row('b',{sourceRef:'javascript:bad'})])],{now});
  assert.equal(w.items.length,1);assert.equal(w.providers[0].partial,true);assert.equal(w.issues[0].code,'INVALID_PROVENANCE');
});
test('fingerprint tracks changed content, provider availability and stale transition',()=>{
  const a=compile([result()],{now});
  assert.notEqual(a.fingerprint,compile([result([row('a',{title:'Changed'})])],{now}).fingerprint);
  assert.notEqual(a.fingerprint,compile([result([],{status:'UNAVAILABLE'})],{now}).fingerprint);
  const stale=compile([result()],{now:now+360000});assert.equal(stale.items[0].freshness.state,'STALE');assert.notEqual(stale.fingerprint,a.fingerprint);
});
test('world diff distinguishes additions, modifications and removals; first load has no invented changes',()=>{
  const a=compile([result([row('a'),row('b')])],{now});
  const b=compile([result([row('a',{title:'New'}),row('c')])],{now,previous:a});
  assert.deepEqual(a.diff.added,[]);assert.deepEqual(b.diff.added,['github:c']);assert.deepEqual(b.diff.updated,['github:a']);assert.deepEqual(b.diff.removed,['github:b']);
  assert.deepEqual(diffWorld(a,b).updated,b.diff.updated);
});
test('NOW prioritizes explicit blocked and due loops; never unread mail alone',()=>{
  assert.equal(classify(row('a',{status:'BLOCKED'}),now).attention,'ESCALATE');
  assert.equal(classify(row('a',{status:'NEEDS_ME',dueAt:'2026-09-09T13:00:00Z'}),now).attention,'ACT');
  assert.equal(classify(row('a',{status:'NEEDS_ME',dueAt:'2026-09-08T13:00:00Z'}),now).attention,'ESCALATE');
  assert.equal(classify(row('a',{kind:'MESSAGE'}),now).attention,'NOTICE');
  assert.equal(classify(row('a',{status:'WAITING_OTHER'}),now).attention,'NOTICE');
  assert.equal(classify(row('a',{status:'DONE'}),now).attention,'IGNORE');
});
test('stale blocked items do not claim current urgency',()=>{const x=row('a',{status:'BLOCKED'});x.freshness.state='STALE';assert.equal(classify(x,now).attention,'NOTICE');});
test('ended Calendar events are not escalated as missed deadlines',()=>{assert.equal(classify(row('a',{kind:'EVENT',dueAt:'2026-09-09T10:00:00Z',endAt:'2026-09-09T11:00:00Z'}),now).attention,'IGNORE');});
test('provider failure retains last valid data with original observation time and stale marker',async()=>{
  const first=await readProvider('github',{now,reader:async()=>({items:[row()]})});
  const second=await readProvider('github',{now:now+61000,reader:async()=>{throw Error('fail')}});
  assert.equal(second.items.length,1);assert.equal(second.provider.status,'UNAVAILABLE');assert.equal(second.items[0].freshness.state,'STALE');assert.equal(second.provider.lastSuccessAt,first.provider.lastSuccessAt);
});
test('authentication loss removes cached private records',async()=>{
  await readProvider('drive',{access:'PRIVATE',now,reader:async()=>({items:[item('drive','a','Private','https://drive.google.com/file/d/a/view',now)]})});
  const lost=await readProvider('drive',{access:'PRIVATE',now:now+61000,reader:async()=>{throw new ProviderError('AUTH_REQUIRED')}});
  assert.equal(lost.items.length,0);assert.equal(lost.provider.count,null);
});
test('public mode neither invokes private readers nor passes credentials into GitHub',async()=>{
  let called=false;const p=await readProvider('drive',{reader:async()=>{called=true;return {items:[]}}});assert.equal(called,false);assert.equal(p.provider.status,'AUTH_REQUIRED');
  await readProvider('github',{env:{GITHUB_TOKEN:'secret'},reader:async({env})=>{assert.equal(env.GITHUB_TOKEN,undefined);return {items:[]};}});
});
test('slow provider is bounded even if reader ignores abort signal',async()=>{
  const start=Date.now();const x=await readProvider('github',{timeout:20,reader:()=>new Promise(()=>{})});assert.equal(x.provider.status,'UNAVAILABLE');assert.ok(Date.now()-start<1000);
});
test('concurrent refresh requests coalesce per provider and access scope',async()=>{
  let count=0;const reader=async()=>{count++;await new Promise(r=>setTimeout(r,5));return {items:[]};};await Promise.all([readProvider('github',{reader}),readProvider('github',{reader})]);assert.equal(count,1);
});
test('search failure does not substitute unrelated cached snapshot',async()=>{
  await readProvider('github',{reader:async()=>({items:[row()]})});const x=await readProvider('github',{query:'different',reader:async()=>{throw Error()}});assert.deepEqual(x.items,[]);
});
test('successful empty snapshot is distinguishable from unavailable provider',async()=>{const x=await readProvider('github',{reader:async()=>({items:[]})});assert.equal(x.provider.status,'AVAILABLE');assert.equal(x.provider.count,0);});
test('Atlas preserves fallback freshness and rejects missing graph contract',()=>{
  const x=normalizeAtlas({nodes:[{id:'TEST:1',label:'Test'}],edges:[],fingerprint:'fp',freshness:'FALLBACK',source:'v1',truncated:true},{url:'https://nexo-atlas-control-tower.vercel.app/api/graph',now});assert.equal(x.items[0].freshness.state,'STALE');assert.equal(x.partial,true);assert.equal(x.items[0].authority,'DERIVED');
  assert.throws(()=>normalizeAtlas({nodes:[]},{url:'https://atlas.test/api/graph',now}));
});
test('DAY handles all-day exclusive end and overlapping events',()=>{
  const all=row('a',{kind:'EVENT',allDay:true,dueAt:'2026-09-09',endAt:'2026-09-10'});assert.equal(dayItems([all],'2026-09-09').length,1);assert.equal(dayItems([all],'2026-09-10').length,0);
  const a=row('b',{kind:'EVENT',dueAt:'2026-09-09T10:00:00Z',endAt:'2026-09-09T11:00:00Z'}),b=row('c',{kind:'EVENT',dueAt:'2026-09-09T10:30:00Z',endAt:'2026-09-09T12:00:00Z'});assert.equal(overlap(a,b),true);assert.equal(overlap(all,b),false);
});
test('command parser routes deterministically and rejects implicit writes',()=>{assert.equal(parseCommand('/day').tab,'DAY');assert.equal(parseCommand('Olympus').context,'OLYMPUS');assert.equal(parseCommand('CAMB pdf').query,'CAMB pdf');assert.match(parseCommand('enviar email').message,/não estão habilitadas/);});
