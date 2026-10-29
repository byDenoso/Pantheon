import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {hasPublishedValue} from '../src/features/lab/presentation.ts';
import {publicCount} from '../src/atlas/publicCount.ts';
import {createCosmosCache} from '../src/tower-web/cosmosCache.ts';
import {buildTowerGraph} from '../src/tower-web/model.ts';
test('empty published values never hide valid zero or false',()=>{
 for(const v of ['', '  \n ', null,undefined,[],{}, {x:[' ']}])assert.equal(hasPublishedValue(v),false);
 for(const v of [0,false,{x:0},{x:false},['result']])assert.equal(hasPublishedValue(v),true);
});
test('public counts distinguish unknown, empty and partial',()=>{
 const p={status:'ready',tests:[],items:[]};assert.equal(publicCount(p,0,false),'0');
 assert.equal(publicCount(p,undefined,false),'Indisponível');
 assert.equal(publicCount({...p,coverage:'UNAVAILABLE'},0,true),'Unavailable');
 assert.equal(publicCount({...p,coverage:'PARTIAL'},2,false),'2 nesta leitura');
 assert.equal(publicCount({...p,coverage:'COMPLETE',campaigns:[{testsCoverage:'UNAVAILABLE'}]},0,false,true),'0 nesta leitura');
});
test('graph metrics are lazy, computed once and preserve graph analysis',()=>{
 const g=buildTowerGraph([{id:'a',domain:'D'},{id:'b',domain:'D',parents:['a']}]);
 assert.equal(typeof Object.getOwnPropertyDescriptor(g,'metrics').get,'function');
 assert.equal(g.metrics,g.metrics);assert.equal(g.metrics.degree.get('test:a'),1);assert.equal(g.metrics.inDeg.get('test:b'),1);
});
test('workspace layout cache isolates sessions, mutations and generations',()=>{
 const tests=[{id:'a',domain:'D'},{id:'b',domain:'D',parents:['a']}],cache=createCosmosCache(),opts={normDomain:d=>d,campaignLabel:id=>id};
 const a=cache.read(tests,opts),b=cache.read(tests,opts);assert.equal(a.graph,b.graph);assert.notEqual(a.raw,b.raw);assert.deepEqual(a.raw,b.raw);
 a.raw.pos.get('test:a').x=999999;a.raw.center.x=999999;a.raw.halo.clear();a.raw.domainIds.push('invented');
 assert.deepEqual(cache.read(tests,opts).raw,b.raw);
 assert.notEqual(cache.read([...tests],opts).graph,b.graph);
 const c=cache.read(tests,opts);assert.notEqual(cache.read(tests,{...opts,normDomain:d=>d}).graph,c.graph);
 const d=cache.read(tests,opts);assert.notEqual(cache.read(tests,{...opts,campaignLabel:id=>id}).graph,d.graph);
 const e=cache.read(tests,opts);cache.clear();assert.notEqual(cache.read(tests,opts).graph,e.graph);
 assert.notEqual(createCosmosCache().read(tests,opts).graph,e.graph);
});
test('workspace owns and clears its cache; shell uses current artwork',()=>{
 const w=readFileSync('src/private-workspace/PrivateWorkspace.tsx','utf8'),s=readFileSync('src/atlas/ui/Shell.tsx','utf8');
 assert.match(w,/useEffect\(\(\) => \(\) => cosmosCache.clear\(\), \[cosmosCache\]\)/);
 assert.match(w,/createCosmosCache\(\), \[state\]/);assert.match(s,/<CosmologicalBackdrop paused=/);assert.doesNotMatch(s,/CinematicBackdrop/);
 assert.match(readFileSync('src/atlas/ui/CosmologicalBackdrop.tsx','utf8'),/import '\.\.\/cinema\/cinema.css'/);
 assert.doesNotMatch(readFileSync('src/private-design/private-design.css','utf8'),/gas-dark.jpg|gas-light.jpg/);
});
