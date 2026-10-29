import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryTransport} from '../src/private-memory/transport.ts';
test('private transport exposes two fixed POST routes without URLs or credentials in parameters',async()=>{
 const calls=[],read=createMemoryTransport(async(url,init)=>{calls.push({url,init});return Response.json({access:'PRIVATE'});});
 await read('browse',{query:'H-1'});await read('propose',{text:'Review'});
 assert.deepEqual(calls.map(v=>v.url),['/api/atlas-memory/browse','/api/atlas-memory/propose']);
 for(const {init} of calls){assert.equal(init.method,'POST');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');}
 await assert.rejects(()=>read('apply',{}),/MEMORY_ACTION_DENIED/);await assert.rejects(()=>read('https://attacker.invalid',{}),/MEMORY_ACTION_DENIED/);assert.equal(calls.length,2);
});
test('transport retains conflicts and expired-session status for honest UI recovery',async()=>{
 for(const status of [401,409,503]){const read=createMemoryTransport(async()=>Response.json({error:'MEMORY_TEST_FAILURE'},{status}));await assert.rejects(()=>read('browse',{}),e=>e.status===status&&e.message==='MEMORY_TEST_FAILURE');}
});
