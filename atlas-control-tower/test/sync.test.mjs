import test from 'node:test';import assert from 'node:assert/strict';import {Coordinator} from '../lib/sync.mjs';
const base={nodes:[{id:'a',authority:'SCIENCE_CANONICAL'}],edges:[]};
test('offline readers preserve last good graph and mark sources stale',async()=>{const c=new Coordinator(base,{drive:async()=>{throw Error('secret should not leak')},neon:async()=>{throw Error('offline')}});await c.sync();assert.equal(c.graph.nodes[0].id,'a');assert.equal(c.sources.drive.status,'STALE');assert.ok(!JSON.stringify(c.sources).includes('secret'))});
test('concurrent sync requests reuse one read',async()=>{let reads=0;const c=new Coordinator(base,{drive:async()=>{reads++;await new Promise(r=>setTimeout(r,10));return base}});await Promise.all([c.sync(),c.sync()]);assert.equal(reads,1)});
test('identical canonical data returns NO_CHANGE',async()=>{const c=new Coordinator(base,{drive:async()=>base});assert.equal((await c.sync()).outcome,'NO_CHANGE')});
