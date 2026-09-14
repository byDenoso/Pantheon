import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
const adapter=await readFile(new URL('../server/adapters/atlas-ssot.mjs',import.meta.url),'utf8');
const manualSync=await readFile(new URL('../../atlas-control-tower/lib/pages-manual-live-api.mjs',import.meta.url),'utf8');

test('Atlas SSOT route is service-authenticated and read-only',()=>{
 assert.match(handler,/readAtlasSsot/);
 assert.match(handler,/route==='atlas-ssot'/);
 assert.match(handler,/verifyProjectionService\(req,\{now\}\)/);
 assert.match(handler,/ATLAS_SERVICE_REQUIRED/);
 assert.match(handler,/readAtlasSsot\(\{env,now/);
});

test('Atlas SSOT reader uses exact-name Drive discovery or private override and cannot inherit legacy ids',()=>{
 assert.match(adapter,/DRIVE_SSOT_SPREADSHEET_ID/);
 assert.match(adapter,/DENER · SSOT CANONICAL/);
 assert.match(adapter,/SSOT_DISCOVERY_NOT_FOUND/);
 assert.match(adapter,/SSOT_DISCOVERY_AMBIGUOUS/);
 assert.doesNotMatch(adapter,/CANONICAL_SSOT_ID/);
 assert.doesNotMatch(adapter,/NEXO_SHEET_ID/);
 assert.doesNotMatch(adapter,/NEXO_SSOT_ID/);
});

test('manual public Atlas refresh reads the live Drive SSOT but exposes only the sanitized public projection',()=>{
 assert.match(handler,/route==='atlas-public-ssot'.*buildPublicAtlasSsot\(await readAtlasSsot\(\{env,now,signal:req\.signal\}\)\)/s);
 assert.match(handler,/https:\/\/bydenoso\.github\.io/);
 assert.match(handler,/Access-Control-Allow-Methods','GET,OPTIONS'/);
 assert.match(handler,/WRITES_DISABLED/);
 assert.match(manualSync,/nexo-one-two\.vercel\.app\/api\/atlas-public-ssot/);
 assert.match(manualSync,/readbackVerified:true/);
 assert.match(manualSync,/lastValidPreserved:true/);
});
