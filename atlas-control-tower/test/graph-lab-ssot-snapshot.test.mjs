import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');

test('production Graph Lab has a Drive-derived SSOT snapshot fallback',()=>{
 const snapshotPath=path.join(lab,'data/ssot.snapshot.json');
 assert.ok(fs.existsSync(snapshotPath),'missing Drive SSOT projection snapshot');
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
 assert.equal(snapshot.authority,'drive-ssot-projection');
 assert.equal(snapshot.spreadsheet_id,'1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY');
 assert.ok(snapshot.tabs?.Science?.length>0);
 assert.ok(snapshot.tabs?.Olympus?.length>0);
 assert.ok(snapshot.tabs?.NEXO?.length>0);
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 assert.match(app,/loadSsotSnapshot/);
 assert.match(app,/SSOT SNAPSHOT/);
});
