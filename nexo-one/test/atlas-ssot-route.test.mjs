import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');

test('Atlas SSOT route is service-authenticated and read-only',()=>{
 assert.match(handler,/readAtlasSsot/);
 assert.match(handler,/route==='atlas-ssot'/);
 assert.match(handler,/verifyProjectionService\(req,\{now\}\)/);
 assert.match(handler,/ATLAS_SERVICE_REQUIRED/);
 assert.match(handler,/readAtlasSsot\(\{env,now/);
});
