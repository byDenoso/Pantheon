import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('graph navigation derives expandability from real hierarchical children or explicit child count',async()=>{
 const {deriveGraphNavigation}=await import(new URL('../src/graph-engine/navigation-contract.mjs',import.meta.url));
 const nodes=[
  {id:'domain:D1',type:'DOMAIN'},
  {id:'CAMP-A',type:'CAMPAIGN'},
  {id:'program:P1',type:'PROGRAM',metadata:{childCount:2}},
  {id:'program:LEAF',type:'PROGRAM'}
 ];
 const edges=[{source:'domain:D1',target:'CAMP-A',type:'CONTAINS'}];
 const nav=deriveGraphNavigation(nodes,edges);
 assert.deepEqual(nav.get('domain:D1'),{childCount:1,expandable:true});
 assert.deepEqual(nav.get('CAMP-A'),{childCount:0,expandable:false});
 assert.deepEqual(nav.get('program:P1'),{childCount:2,expandable:true});
 assert.deepEqual(nav.get('program:LEAF'),{childCount:0,expandable:false});
});

test('renderer boundary and inspector refuse to enter a structural leaf',()=>{
 const renderer=read('src/graph-engine/GraphRenderer.tsx');
 const inspector=read('src/graph-engine/SpatialInspector.tsx');
 assert.match(renderer,/state\?\.expandable/);
 assert.match(renderer,/else props\.onSelect\(id\)/);
 assert.match(inspector,/selected\.expandable===true/);
 assert.match(inspector,/selectedCanOpen&&<button className="primary"/);
 assert.doesNotMatch(inspector,/selected\.id!==projection\?\.focusId&&<button className="primary"/);
});
