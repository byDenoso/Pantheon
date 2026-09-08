/** The workspace is the map, and the map carries only declared relations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const testNode = (id, domains) => ({id, type: 'TEST', label: id, domain: domains[0], domains});

test('a domain link counts the tests that declare both domains', async () => {
 const {domainCoDeclarations} = await import('../lib/domain-links.mjs');
 const links = domainCoDeclarations([
  testNode('T1', ['D7', 'D3']), testNode('T2', ['D3', 'D7']), testNode('T3', ['D7', 'D2']),
  testNode('T4', ['D7']), testNode('T5', ['D1', 'D3', 'D7']), {id:'domain:D7',type:'DOMAIN',domain:'D7'}
 ]);
 const find=(a,b)=>links.find(l=>l.a===a&&l.b===b);
 assert.equal(find('D3','D7').tests,3);assert.equal(find('D2','D7').tests,1);assert.equal(find('D1','D3').tests,1);assert.equal(find('D1','D7').tests,1);
 assert.equal(links.length,4);
 for(const l of links)assert.ok(l.a<l.b);
 assert.deepEqual(links.map(l=>l.tests),[...links.map(l=>l.tests)].sort((x,y)=>y-x));
});

test('domain links never invent a relation', async () => {
 const {domainCoDeclarations}=await import('../lib/domain-links.mjs');
 assert.deepEqual(domainCoDeclarations([]),[]);assert.deepEqual(domainCoDeclarations(null),[]);assert.deepEqual(domainCoDeclarations([testNode('T',['D1'])]),[]);
 assert.deepEqual(domainCoDeclarations([{id:'T',type:'TEST',domains:['D1','','D1',null]}]),[]);
 assert.deepEqual(domainCoDeclarations([{id:'x',type:'CLAIM',domains:['D1','D2']}]),[]);
});

test('the science graph response carries declared domain links',()=>{
 const runtime=read('api/runtime.js');assert.match(runtime,/domainCoDeclarations/);assert.match(runtime,/domainLinks/);assert.match(runtime,/system:SCIENCE/);
});

test('the graph contract carries domain links instead of dropping them as extra',async()=>{
 const {normalizeGraph}=await import('../lib/graph-contract.mjs');
 const g=normalizeGraph({focus:'system:SCIENCE',nodes:[],edges:[],domainLinks:[{a:'D3',b:'D7',tests:11},{a:'D1',b:'D1',tests:4},{a:'D2',b:'',tests:2},{a:'D5',b:'D6',tests:0}]});
 assert.deepEqual(g.domainLinks,[{a:'D3',b:'D7',tests:11}]);assert.ok(!('domainLinks' in (g.extra||{})));assert.deepEqual(normalizeGraph({nodes:[],edges:[]}).domainLinks,[]);
});

test('domain links become cross-domain filaments only where both domain bodies exist',async()=>{
 const {withDomainLinks}=await import('../ui/map-data.mjs');
 const {classifyEdge}=await import('../ui/filaments.mjs');
 const data={focus:'system:SCIENCE',nodes:[{id:'system:SCIENCE',type:'SYSTEM'},{id:'domain:D7',type:'DOMAIN',domain:'D7'},{id:'domain:D3',type:'DOMAIN',domain:'D3'},{id:'domain:D2',type:'DOMAIN',domain:'D2'}],edges:[],domainLinks:[{a:'D3',b:'D7',tests:11},{a:'D2',b:'D7',tests:1},{a:'D9',b:'D7',tests:4}]};
 const out=withDomainLinks(data,'system:SCIENCE'),added=out.edges.filter(e=>e.type==='CO_DECLARED');
 assert.equal(added.length,2);const strong=added.find(e=>e.id.includes('D3'));assert.equal(strong.authority,'DERIVED_NOT_EVIDENCE');assert.equal(strong.tests,11);
 const byId=new Map(out.nodes.map(n=>[n.id,n]));assert.equal(classifyEdge(byId.get(strong.source),byId.get(strong.target),strong),'cross-domain');assert.equal(data.edges.length,0);
});

test('R3F filaments are instanced and GPU-driven rather than one DOM/canvas timer per edge',()=>{
 const renderer=read('src/scene/InstancedFilaments.tsx');
 const materials=read('src/scene/materials.ts');
 assert.match(renderer,/<instancedMesh/);
 assert.match(renderer,/setMatrixAt/);
 assert.match(renderer,/setColorAt/);
 assert.doesNotMatch(renderer,/setInterval|setTimeout|quadraticCurveTo/);
 assert.match(materials,/time\.mul/);
 assert.match(materials,/MeshBasicNodeMaterial/);
});

test('the React workspace is one map surface with semantic expansion, not tab panels',()=>{
 const app=read('src/App.tsx');const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.doesNotMatch(app,/role="tablist"|data-mode="explore"|data-mode="learning"|data-mode="audit"|id="data-section"|id="learning-section-panel"|id="audit-section"|data-open-mode/);
 assert.match(app,/id="map-workspace"/);assert.match(app,/id="more"/);assert.match(canvas,/<Canvas/);
 for(const focus of ['system:NEXO','system:SCIENCE','system:AUTOMATION','system:LEARNING'])assert.ok(app.includes(focus),`sidebar focus ${focus} must remain`);
});

test('the workspace compatibility module still normalizes retired modes to the map',async()=>{
 const {normalizeMode,modeState}=await import('../ui/workspace.mjs');
 assert.equal(normalizeMode('learning'),'overview');assert.equal(normalizeMode('audit'),'overview');assert.equal(normalizeMode('explore'),'overview');assert.equal(normalizeMode(),'overview');assert.deepEqual(modeState('overview'),{map:true});
});
