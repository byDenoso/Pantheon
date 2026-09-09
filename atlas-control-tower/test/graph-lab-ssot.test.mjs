import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const modulePath=rel=>path.join(lab,rel);

async function importLab(rel){
 const file=modulePath(rel);
 assert.ok(fs.existsSync(file),`graph lab module missing: ${rel}`);
 return import(pathToFileURL(file));
}

test('SSOT adapter targets the canonical Drive spreadsheet and its three truth tabs',async()=>{
 const ssot=await importLab('data/ssot.mjs');
 assert.equal(ssot.SSOT_SPREADSHEET_ID,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 assert.deepEqual(ssot.SSOT_TABS,['Science','Olympus','NEXO']);
 const graph=ssot.rowsToGraph({
  Science:[{record_type:'paper',record_id:'T-PAPER-002',status:'IN_PROGRESS',title:'PEER observational model paper',detail:'core claim',source:'REV::T-PAPER-002::1',updated_at:'2026-09-09'}],
  Olympus:[{record_type:'person',record_id:'P-001',status:'ACTIVE',title:'Athlete',detail:'current state',source:'Drive:olympus',updated_at:'2026-09-09'}],
  NEXO:[{record_type:'policy',record_id:'POL-1',status:'ACTIVE',title:'Execution core',detail:'readback required',source:'Drive:nexo',updated_at:'2026-09-09'}]
 });
 assert.equal(graph.rootId,'system:NEXO');
 assert.ok(graph.nodes.some(n=>n.id==='system:SCIENCE'));
 assert.ok(graph.nodes.some(n=>n.id==='system:OLYMPUS'));
 assert.ok(graph.nodes.some(n=>n.id==='record:Science:T-PAPER-002'&&n.recordId==='T-PAPER-002'));
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
