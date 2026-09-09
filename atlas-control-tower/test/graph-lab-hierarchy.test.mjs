import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const projection=await import(pathToFileURL(path.join(lab,'graph/projection.mjs')));
const graph={rootId:'system:NEXO',nodes:[
 {id:'system:NEXO',type:'SYSTEM',label:'NEXO'},
 {id:'system:SCIENCE',type:'SYSTEM',label:'SCIENCE',parentId:'system:NEXO'},
 {id:'domain:Science:EXPANSION',type:'DOMAIN',hierarchyLevel:'domain',label:'EXPANSION',recordId:'EXPANSION',status:'ACTIVE',parentId:'system:SCIENCE'},
 {id:'record:Science:PROG-A',type:'PROGRAM',hierarchyLevel:'program',label:'Program A',recordId:'PROG-A',status:'ACTIVE',parentId:'domain:Science:EXPANSION'},
 {id:'record:Science:CAMP-A',type:'CAMPAIGN',hierarchyLevel:'campaign',label:'Campaign A',recordId:'CAMP-A',status:'ACTIVE',parentId:'record:Science:PROG-A'}
],edges:[
 {source:'system:NEXO',target:'system:SCIENCE'},{source:'system:SCIENCE',target:'domain:Science:EXPANSION'},{source:'domain:Science:EXPANSION',target:'record:Science:PROG-A'},{source:'record:Science:PROG-A',target:'record:Science:CAMP-A'}
]};

test('hierarchy is lazy at Domain and Program and Campaign is a leaf',()=>{
 const closed=projection.hierarchyView(graph,{expandedIds:new Set()});
 assert.equal(closed.nodes.some(n=>n.hierarchyLevel==='domain'),true);
 assert.equal(closed.nodes.some(n=>n.hierarchyLevel==='program'),false);
 const domainOpen=projection.hierarchyView(graph,{expandedIds:new Set(['domain:Science:EXPANSION'])});
 assert.equal(domainOpen.nodes.some(n=>n.hierarchyLevel==='program'),true);
 assert.equal(domainOpen.nodes.some(n=>n.hierarchyLevel==='campaign'),false);
 const open=projection.hierarchyView(graph,{expandedIds:new Set(['domain:Science:EXPANSION','record:Science:PROG-A'])});
 assert.equal(open.nodes.some(n=>n.hierarchyLevel==='campaign'),true);
 assert.deepEqual([...projection.hierarchyExpandableIds(graph)].sort(),['domain:Science:EXPANSION','record:Science:PROG-A'].sort());
});

test('search for campaign automatically expands Domain and Program ancestors',()=>{
 const result=projection.expandForSearch(graph,'campaign a',new Set());
 assert.equal(result.matchId,'record:Science:CAMP-A');
 assert.deepEqual([...result.expandedIds].sort(),['domain:Science:EXPANSION','record:Science:PROG-A'].sort());
});

test('Graph Lab UI exposes hierarchy controls and single-click expansion',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 assert.match(app,/onSelect:node=>.*toggleHierarchy/s);
 for(const id of ['hierarchy-search','expand-all','collapse-all','active-only'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/Duplo clique abre subgrafo/);
});
