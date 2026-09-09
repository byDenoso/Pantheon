import test from 'node:test';
import assert from 'node:assert/strict';
import {rowsToGraph} from '../graph-lab/data/ssot.mjs';
import {hierarchyView,expandForSearch,ancestorsOf} from '../graph-lab/graph/projection.mjs';

const rowsByTab={
 Science:[
  {record_type:'program',record_id:'PROG-EXPANSION-GEOMETRY',status:'ACTIVE',title:'Expansion, geometry & dark energy',domain:'EXPANSION'},
  {record_type:'program',record_id:'PROG-STRUCTURE-DARK-SECTOR',status:'ACTIVE',title:'Structure growth & dark sector',domain:'STRUCTURE'},
  {record_type:'program',record_id:'PROG-CMB-EARLY-MICROPHYSICS',status:'ACTIVE',title:'CMB, early universe & microphysics',domain:'EARLY'},
  {record_type:'program',record_id:'PROG-HIGHZ-ASTROPHYSICS',status:'ACTIVE',title:'High-z astrophysics',domain:'HIGHZ'},
  {record_type:'program',record_id:'PROG-COSMIC-HOMOGENEITY',status:'ACTIVE',title:'Cosmic homogeneity & mega-structures',domain:'HOMOGENEITY'},
  {record_type:'program',record_id:'PROG-SCIENTIFIC-VALIDATION',status:'ACTIVE',title:'Scientific validation & inference',domain:'VALIDATION'},
  {record_type:'campaign',record_id:'CAMP-H0-RULER-ANCHOR',status:'ACTIVE',title:'H0 / acoustic ruler / anchors',domain:'D1'},
  {record_type:'campaign',record_id:'CAMP-DDE-ROBUSTNESS',status:'ACTIVE',title:'Dynamical dark energy robustness',domain:'D3'},
  {record_type:'campaign',record_id:'CAMP-MEGASTRUCTURES',status:'ACTIVE',title:'Mega-structures robustness',domain:'CROSS'}
 ],
 Relations:[
  {relation_type:'PRIMARY_PROGRAM',source_entity:'CAMP-H0-RULER-ANCHOR',target_entity:'PROG-EXPANSION-GEOMETRY',status:'ACTIVE'},
  {relation_type:'PRIMARY_PROGRAM',source_entity:'CAMP-DDE-ROBUSTNESS',target_entity:'PROG-EXPANSION-GEOMETRY',status:'ACTIVE'},
  {relation_type:'PRIMARY_PROGRAM',source_entity:'CAMP-MEGASTRUCTURES',target_entity:'PROG-COSMIC-HOMOGENEITY',status:'ACTIVE'}
 ],
 Olympus:[
  {record_type:'person',record_id:'OLY-CL-0001',status:'ACTIVE',title:'Dener',detail:'CORE'},
  {record_type:'person',record_id:'OLY-CL-0002',status:'ACTIVE',title:'Renilde De Oliveira Paula',detail:'LITE'},
  {record_type:'person',record_id:'OLY-CL-0003',status:'ACTIVE',title:'Miquéias Da Silva Souza',detail:'LITE'},
  {record_type:'person',record_id:'OLY-CL-0004',status:'ACTIVE',title:'Josué Ferreira dos Santos',detail:'LITE'},
  {record_type:'person',record_id:'OLY-CL-0005',status:'ACTIVE',title:'Natália',detail:'RESEARCH'}
 ],
 Engineering:[]
};

const labels=view=>view.nodes.map(node=>node.label);
const byLabel=(graph,label)=>graph.nodes.find(node=>node.label===label);

test('Graph Lab opens with NEXO plus exactly the three macro lanes',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const view=hierarchyView(graph,{expandedIds:new Set()});
 assert.deepEqual(labels(view),['NEXO','CIÊNCIA','OLYMPUS','ENGENHARIA']);
 assert.equal(view.nodes.filter(node=>node.hierarchyLevel==='lane').length,3);
 assert.equal(view.nodes.some(node=>['HIGHZ','EXPANSION','STRUCTURE','EARLY','HOMOGENEITY','VALIDATION'].includes(node.label)),false);
});

test('expanding Ciência reveals science domains before programs and campaigns',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const view=hierarchyView(graph,{expandedIds:new Set(['lane:SCIENCE'])});
 for(const label of ['EXPANSION','STRUCTURE','EARLY','HIGHZ','HOMOGENEITY','VALIDATION'])assert.ok(labels(view).includes(label),label);
 assert.equal(labels(view).includes('Expansion, geometry & dark energy'),false);
});

test('expanding a science domain reveals its program and campaign children',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const expansion=byLabel(graph,'EXPANSION');
 const program=byLabel(graph,'Expansion, geometry & dark energy');
 const view=hierarchyView(graph,{expandedIds:new Set(['lane:SCIENCE',expansion.id,program.id])});
 for(const label of ['Expansion, geometry & dark energy','H0 / acoustic ruler / anchors','Dynamical dark energy robustness'])assert.ok(labels(view).includes(label),label);
});

test('Olympus groups people under CORE, LITE and RESEARCH',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const view=hierarchyView(graph,{expandedIds:new Set(['lane:OLYMPUS','olympus:group:CORE','olympus:group:LITE','olympus:group:RESEARCH'])});
 for(const label of ['CORE','LITE','RESEARCH','Dener','Renilde De Oliveira Paula','Miquéias Da Silva Souza','Josué Ferreira dos Santos','Natália'])assert.ok(labels(view).includes(label),label);
});

test('Engineering lane is marked as GitHub/runtime authority instead of SSOT truth',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const engineering=graph.nodes.find(node=>node.id==='lane:ENGINEERING');
 assert.equal(engineering.authority,'runtime-github');
 assert.match(engineering.summary,/GitHub \+ runtime/);
});

test('alternative learning filaments are an optional overlay and do not change hierarchy',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const base=hierarchyView(graph,{expandedIds:new Set(['lane:SCIENCE','lane:OLYMPUS']),showAlternativeFilaments:false});
 const overlay=hierarchyView(graph,{expandedIds:new Set(['lane:SCIENCE','lane:OLYMPUS']),showAlternativeFilaments:true});
 assert.equal(base.edges.some(edge=>edge.kind?.startsWith('alternative')),false);
 assert.ok(overlay.edges.some(edge=>edge.kind==='alternative-learning'));
 assert.deepEqual(labels(base),labels(overlay));
});

test('search opens macro ancestors before landing on a nested science campaign',()=>{
 const graph=rowsToGraph(rowsByTab,{kind:'drive-ssot-snapshot'});
 const result=expandForSearch(graph,'Dynamical dark energy',new Set());
 assert.ok(result.matchId);
 assert.ok(result.expandedIds.has('lane:SCIENCE'));
 const trail=ancestorsOf(graph,result.matchId).map(node=>node.label);
 assert.deepEqual(trail.slice(0,4),['NEXO','CIÊNCIA','EXPANSION','Expansion, geometry & dark energy']);
});
