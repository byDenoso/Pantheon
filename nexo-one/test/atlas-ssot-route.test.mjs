import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
const adapter=await readFile(new URL('../server/adapters/atlas-ssot.mjs',import.meta.url),'utf8');
const live=await readFile(new URL('../../atlas-control-tower/lib/live-drive-ssot.mjs',import.meta.url),'utf8');

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

test('public Atlas projection does not depend on runtime Google credentials',()=>{
 assert.match(handler,/route==='atlas-public-ssot'.*publicProjection/s);
 assert.match(handler,/buildAtlasResearchView\(snapshot\|\|publicProjection,route\)/);
 assert.match(live,/nexo-one-two\.vercel\.app\/api\/atlas-public-ssot/);
});
