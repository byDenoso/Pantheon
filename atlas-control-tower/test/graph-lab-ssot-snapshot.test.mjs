import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');

test('production Graph Lab keeps base snapshot and a Drive-derived hierarchy overlay',async()=>{
 const snapshotPath=path.join(lab,'data/ssot.snapshot.json');
 const hierarchyPath=path.join(lab,'data/ssot.hierarchy.snapshot.json');
 assert.ok(fs.existsSync(snapshotPath),'missing Drive SSOT projection snapshot');
 assert.ok(fs.existsSync(hierarchyPath),'missing hierarchy overlay snapshot');
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
 const hierarchy=JSON.parse(fs.readFileSync(hierarchyPath,'utf8'));
 for(const value of [snapshot,hierarchy]){
  assert.equal(value.authority,'drive-ssot-projection');
  assert.equal(value.spreadsheet_id,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 }
 assert.equal(hierarchy.tabs.Science.filter(r=>r.record_type==='program').length,6);
 assert.equal(hierarchy.tabs.Relations.filter(r=>r.relation_type==='PRIMARY_PROGRAM').length,17);
 assert.ok(snapshot.tabs?.Olympus?.length>0);
 assert.ok(snapshot.tabs?.NEXO?.length>0);
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 assert.match(app,/loadSsotSnapshot/);
 assert.match(app,/SSOT SNAPSHOT/);
});
