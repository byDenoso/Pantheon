import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const modulePath=rel=>path.join(lab,rel);
async function importLab(rel){const file=modulePath(rel);assert.ok(fs.existsSync(file),`graph lab module missing: ${rel}`);return import(pathToFileURL(file));}

test('SSOT adapter targets canonical Drive tabs and projects Domain -> Program -> Campaign',async()=>{
 const ssot=await importLab('data/ssot.mjs');
 assert.equal(ssot.SSOT_SPREADSHEET_ID,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 assert.deepEqual(ssot.SSOT_TABS,['Science','Relations','Olympus','NEXO']);
 const graph=ssot.rowsToGraph({
  Science:[
   {record_type:'program',record_id:'PROG-A',status:'ACTIVE',title:'Program A',domain:'EXPANSION'},
   {record_type:'campaign',record_id:'CAMP-A',status:'ACTIVE',title:'Campaign A',domain:'D3'},
   {record_type:'current_test',record_id:'TEST-A',status:'ACTIVE',title:'Historical test',domain:'D3'}
  ],
  Relations:[{relation_id:'REL-A',source_entity:'CAMP-A',relation_type:'PRIMARY_PROGRAM',target_entity:'PROG-A',status:'ACTIVE'}],
  Olympus:[{record_type:'person',record_id:'P-001',status:'ACTIVE',title:'Athlete',detail:'current state',source:'Drive:olympus'}],
  NEXO:[{record_type:'policy',record_id:'POL-1',status:'ACTIVE',title:'Execution core',detail:'readback required',source:'Drive:nexo'}]
 });
 const domain=graph.nodes.find(n=>n.hierarchyLevel==='domain'&&n.recordId==='EXPANSION');
 const program=graph.nodes.find(n=>n.recordId==='PROG-A');
 const campaign=graph.nodes.find(n=>n.recordId==='CAMP-A');
 assert.equal(graph.rootId,'system:NEXO');
 assert.equal(program.parentId,domain.id);
 assert.equal(campaign.parentId,program.id);
 assert.equal(graph.nodes.some(n=>n.recordId==='TEST-A'),false);
 assert.ok(graph.nodes.some(n=>n.id==='record:NEXO:POL-1'&&n.source==='Drive:nexo'));
 assert.ok(graph.edges.every(e=>graph.nodes.some(n=>n.id===e.source)&&graph.nodes.some(n=>n.id===e.target)));
});

test('production graph lab loads Drive SSOT first and keeps synthetic data demo-only',()=>{
 const app=fs.readFileSync(modulePath('app.mjs'),'utf8');
 assert.match(app,/loadSsotGraph/);
 assert.match(app,/params\.get\('demo'\)==='1'/);
 assert.match(app,/SSOT UNAVAILABLE/);
 assert.match(app,/createSyntheticGraph/);
});
