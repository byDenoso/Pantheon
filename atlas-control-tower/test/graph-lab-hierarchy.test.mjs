import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const projection=await import(pathToFileURL(path.join(lab,'graph/projection.mjs')));

// One hierarchy, four levels: the core, its Domains, their Programs, their Campaigns.
const graph={rootId:'system:NEXO',nodes:[
 {id:'system:NEXO',type:'SYSTEM',hierarchyLevel:'root',label:'NEXO'},
 {id:'domain:Science:EXPANSION',type:'DOMAIN',hierarchyLevel:'domain',label:'EXPANSION',recordId:'EXPANSION',status:'ACTIVE',parentId:'system:NEXO'},
 {id:'domain:Science:STRUCTURE',type:'DOMAIN',hierarchyLevel:'domain',label:'STRUCTURE',recordId:'STRUCTURE',status:'RETIRED',parentId:'system:NEXO'},
 {id:'record:Science:PROG-A',type:'PROGRAM',hierarchyLevel:'program',label:'Program A',recordId:'PROG-A',status:'ACTIVE',parentId:'domain:Science:EXPANSION'},
 {id:'record:Science:CAMP-A',type:'CAMPAIGN',hierarchyLevel:'campaign',label:'Campaign A',recordId:'CAMP-A',status:'ACTIVE',parentId:'record:Science:PROG-A'}
],edges:[
 {source:'system:NEXO',target:'domain:Science:EXPANSION'},
 {source:'system:NEXO',target:'domain:Science:STRUCTURE'},
 {source:'domain:Science:EXPANSION',target:'record:Science:PROG-A'},
 {source:'record:Science:PROG-A',target:'record:Science:CAMP-A'}
]};

test('the first screen is the NEXO core and its Domains only',()=>{
 const closed=projection.hierarchyView(graph,{expandedIds:new Set()});
 const levels=closed.nodes.map(n=>n.hierarchyLevel);
 assert.deepEqual(levels.sort(),['domain','domain','root']);
 assert.equal(closed.edges.length,2);
});

test('expansion is progressive: a Domain reveals Programs, a Program reveals Campaigns',()=>{
 const domainOpen=projection.hierarchyView(graph,{expandedIds:new Set(['domain:Science:EXPANSION'])});
 assert.equal(domainOpen.nodes.some(n=>n.hierarchyLevel==='program'),true);
 assert.equal(domainOpen.nodes.some(n=>n.hierarchyLevel==='campaign'),false);
 const programOpen=projection.hierarchyView(graph,{expandedIds:new Set(['domain:Science:EXPANSION','record:Science:PROG-A'])});
 assert.equal(programOpen.nodes.some(n=>n.hierarchyLevel==='campaign'),true);
 // A Campaign is a leaf: opening it can never add a fifth level.
 assert.equal(programOpen.nodes.find(n=>n.hierarchyLevel==='campaign').expandable,false);
});

test('a Program stays hidden while its Domain is collapsed, even if it is expanded itself',()=>{
 const view=projection.hierarchyView(graph,{expandedIds:new Set(['record:Science:PROG-A'])});
 assert.equal(view.nodes.some(n=>n.hierarchyLevel==='program'),false);
 assert.equal(view.nodes.some(n=>n.hierarchyLevel==='campaign'),false);
});

test('collapsed bodies report the weight of the subgraph a click would open',()=>{
 const closed=projection.hierarchyView(graph,{expandedIds:new Set()});
 const domain=closed.nodes.find(n=>n.id==='domain:Science:EXPANSION');
 assert.equal(domain.hiddenChildren,1);
 assert.equal(domain.expandable,true);
 // The core is always open, so it never advertises a subgraph to unfold.
 assert.equal(closed.nodes.find(n=>n.id===graph.rootId).expandable,false);
});

test('collapsing a Domain also folds the Programs opened underneath it',()=>{
 const expanded=new Set(['domain:Science:EXPANSION','record:Science:PROG-A']);
 const collapsed=projection.collapseSubtree(graph,'domain:Science:EXPANSION',expanded);
 assert.deepEqual([...collapsed],[]);
 const view=projection.hierarchyView(graph,{expandedIds:collapsed});
 assert.equal(view.nodes.length,3);
});

test('only-active hides non-active branches without changing the hierarchy',()=>{
 const view=projection.hierarchyView(graph,{expandedIds:new Set(),activeOnly:true});
 assert.equal(view.nodes.some(n=>n.recordId==='STRUCTURE'),false);
 assert.equal(view.nodes.some(n=>n.recordId==='EXPANSION'),true);
});

test('search finds a Campaign and opens every ancestor above it',()=>{
 const result=projection.expandForSearch(graph,'campaign a',new Set());
 assert.equal(result.matchId,'record:Science:CAMP-A');
 assert.deepEqual([...result.expandedIds].sort(),['domain:Science:EXPANSION','record:Science:PROG-A'].sort());
 const view=projection.hierarchyView(graph,{expandedIds:result.expandedIds});
 assert.equal(view.nodes.some(n=>n.id===result.matchId),true);
});

test('search also resolves Domains and offers the other matches',()=>{
 const domain=projection.expandForSearch(graph,'EXPANSION',new Set());
 assert.equal(domain.matchId,'domain:Science:EXPANSION');
 const partial=projection.expandForSearch(graph,'a',new Set());
 assert.ok(partial.matches.length>=2);
 assert.ok(partial.matches.every(match=>['domain','program','campaign'].includes(match.hierarchyLevel)));
});

test('ancestorsOf gives the trail used by the breadcrumb and the cockpit',()=>{
 const trail=projection.ancestorsOf(graph,'record:Science:CAMP-A').map(node=>node.recordId||node.id);
 assert.deepEqual(trail,['system:NEXO','EXPANSION','PROG-A','CAMP-A']);
});

test('Atlas shell drives the hierarchy from a single click plus search and collapse',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 assert.match(app,/onSelect:node=>[\s\S]*toggleSubgraph\(node\.id\)/);
 assert.match(app,/collapseSubtree/);
 assert.match(app,/expandForSearch/);
 for(const id of ['hierarchy-search','search-results','expand-all','collapse-all','active-only','home','breadcrumb'])assert.match(html,new RegExp(`id="${id}"`));
 assert.doesNotMatch(html,/Duplo clique abre subgrafo/);
});
