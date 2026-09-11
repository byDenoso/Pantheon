import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
const adapter=await readFile(new URL('../server/adapters/atlas-ssot.mjs',import.meta.url),'utf8');

test('Atlas SSOT route is service-authenticated and read-only',()=>{
 assert.match(handler,/readAtlasSsot/);
 assert.match(handler,/route==='atlas-ssot'/);
 assert.match(handler,/verifyProjectionService\(req,\{now\}\)/);
 assert.match(handler,/ATLAS_SERVICE_REQUIRED/);
 assert.match(handler,/readAtlasSsot\(\{env,now/);
});

test('Atlas SSOT reader cannot inherit the legacy NEXO sheet id',()=>{
 assert.match(adapter,/NEXO_SSOT_ID/);
 assert.match(adapter,/1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY/);
 assert.doesNotMatch(adapter,/NEXO_SHEET_ID/);
});
