import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const modulePath=rel=>path.join(lab,rel);
async function importLab(rel){const file=modulePath(rel);assert.ok(fs.existsSync(file),`graph lab module missing: ${rel}`);return import(pathToFileURL(file));}

const rows=()=>({
 Science:[
  {record_type:'program',record_id:'PROG-A',status:'ACTIVE',title:'Program A',domain:'EXPANSION',summary:'linha de investigação'},
  {record_type:'campaign',record_id:'CAMP-A',status:'ACTIVE',title:'Campaign A',domain:'D3',summary:'Pergunta… 145 test_ids únicos.'},
  {record_type:'campaign',record_id:'CAMP-ORPHAN',status:'ACTIVE',title:'Campaign sem program',domain:'D4'},
  {record_type:'current_test',record_id:'T-CAMP-A-001',status:'BLOCKED_CONTRACT_INCOMPLETE',title:'Replay congelado',detail:'CAMP-A precisa do gerador',updated_at:'2026-09-08T10:00:00Z'}
 ],
 Engineering:[
  {record_type:'domain',record_id:'ENG-DOM-ENGINEERING',status:'ACTIVE',title:'Engineering',summary:'projeção navegável'},
  {record_type:'program',record_id:'ENG-PROG-ATLAS',status:'ACTIVE',title:'Atlas Control Tower',parent_id:'ENG-DOM-ENGINEERING'},
  {record_type:'campaign',record_id:'ENG-CAMP-GRAPH',status:'ACTIVE',title:'Atlas Graph + SSOT',parent_id:'ENG-PROG-ATLAS'}
 ],
 Relations:[{relation_id:'REL-A',source_entity:'CAMP-A',relation_type:'PRIMARY_PROGRAM',target_entity:'PROG-A',status:'ACTIVE'}],
 Olympus:[{record_type:'person',record_id:'OLY-CL-0001',status:'ACTIVE',title:'Dener',detail:'CORE'}],
 NEXO:[{record_type:'policy',record_id:'POL-1',status:'ACTIVE',title:'Execution core',detail:'readback required',source:'Drive:nexo'}]
});

test('SSOT adapter targets the canonical Drive tabs and reads Engineering best-effort',async()=>{
 const ssot=await importLab('data/ssot.mjs');
 assert.equal(ssot.SSOT_SPREADSHEET_ID,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 assert.deepEqual(ssot.SSOT_TABS,['Science','Relations','Olympus','NEXO']);
 assert.deepEqual(ssot.SSOT_OPTIONAL_TABS,['Engineering']);
 const app=fs.readFileSync(modulePath('app.mjs'),'utf8');
 assert.match(app,/loadSsotGraph/);
 assert.match(app,/params\.get\('demo'\)==='1'/);
 assert.match(app,/SSOT UNAVAILABLE/);
 assert.match(app,/createSyntheticGraph/);
});

test('the graph hierarchy starts as NEXO -> macro lanes -> local subgraphs',async()=>{
 const {rowsToGraph,ROOT_ID}=await importLab('data/ssot.mjs');
 const graph=rowsToGraph(rows());
 assert.equal(graph.rootId,ROOT_ID);
 const levels=new Set(graph.nodes.map(n=>n.hierarchyLevel));
 for(const level of ['root','lane','domain','group','program','person','project','campaign'])assert.ok(levels.has(level),level);
 const science=graph.nodes.find(n=>n.id==='lane:SCIENCE');
 const olympus=graph.nodes.find(n=>n.id==='lane:OLYMPUS');
 const engineering=graph.nodes.find(n=>n.id==='lane:ENGINEERING');
 assert.equal(science.parentId,ROOT_ID);
 assert.equal(olympus.parentId,ROOT_ID);
 assert.equal(engineering.parentId,ROOT_ID);
 const domain=graph.nodes.find(n=>n.recordId==='EXPANSION');
 const program=graph.nodes.find(n=>n.recordId==='PROG-A');
 const campaign=graph.nodes.find(n=>n.recordId==='CAMP-A');
 assert.equal(domain.parentId,science.id);
 assert.equal(program.parentId,domain.id);
 assert.equal(campaign.parentId,program.id);
 assert.ok(graph.edges.every(e=>graph.nodes.some(n=>n.id===e.source)&&graph.nodes.some(n=>n.id===e.target)));
});

test('Engineering keeps GitHub/runtime authority while declared children remain reachable',async()=>{
 const {rowsToGraph}=await importLab('data/ssot.mjs');
 const graph=rowsToGraph(rows());
 const lane=graph.nodes.find(n=>n.id==='lane:ENGINEERING');
 const domain=graph.nodes.find(n=>n.recordId==='ENG-DOM-ENGINEERING');
 const program=graph.nodes.find(n=>n.recordId==='ENG-PROG-ATLAS');
 const campaign=graph.nodes.find(n=>n.recordId==='ENG-CAMP-GRAPH');
 assert.equal(lane.authority,'runtime-github');
 assert.equal(domain.parentId,lane.id);
 assert.equal(domain.authority,'canonical');
 assert.equal(program.parentId,domain.id);
 assert.equal(campaign.parentId,program.id);
 // A domain the SSOT only implies through the Programs' domain column says so.
 assert.equal(graph.nodes.find(n=>n.recordId==='EXPANSION').authority,'derived-from-ssot');
});

test('non-structural NEXO records stay as cockpit context while Olympus people are graph nodes',async()=>{
 const {rowsToGraph}=await importLab('data/ssot.mjs');
 const graph=rowsToGraph(rows());
 assert.equal(graph.nodes.some(n=>n.recordId==='POL-1'),false,'POL-1 must not be a graph node');
 assert.equal(graph.nodes.some(n=>n.recordId==='T-CAMP-A-001'),false,'tests must not become graph nodes');
 assert.ok(graph.nodes.some(n=>n.recordId==='OLY-CL-0001'&&n.parentId==='olympus:group:CORE'),'Olympus people are first-class local subgraph nodes');
 const core=graph.nodes.find(n=>n.id===graph.rootId).ops;
 const coreText=JSON.stringify(core);
 assert.match(coreText,/Execution core/);
 // The blocked test names CAMP-A, so it lands on that Campaign rather than the core.
 const campaign=graph.nodes.find(n=>n.recordId==='CAMP-A');
 assert.ok(campaign.ops.sections.find(s=>s.id==='blockers').items.some(item=>/Replay congelado/.test(item.title)));
});

test('a Campaign without a PRIMARY_PROGRAM is reported instead of being re-parented silently',async()=>{
 const {rowsToGraph}=await importLab('data/ssot.mjs');
 const graph=rowsToGraph(rows());
 const orphan=graph.nodes.find(n=>n.recordId==='CAMP-ORPHAN');
 assert.equal(orphan.hierarchyOrphan,true);
 assert.equal(orphan.parentId,'lane:SCIENCE');
 assert.ok(orphan.ops.sections.find(s=>s.id==='integrity').items.some(item=>/Program primário ausente/.test(item.title)));
 assert.equal(graph.ops.counts.orphans,1);
});