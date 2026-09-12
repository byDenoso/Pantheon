import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');

test('handler imports and dispatches the research API compiler',()=>{assert.match(handler,/atlas-research-api\.mjs/);assert.match(handler,/RESEARCH_ROUTES\.has\(route\)/);assert.match(handler,/buildAtlasResearchView\(snapshot,route\)/);});
test('research routes use the canonical SSOT reader and remain GET-only',()=>{assert.match(handler,/readAtlasSsot\(\{env,now,signal:req\.signal\}\)/);assert.match(handler,/req\.method!==\'GET\'/);assert.match(handler,/WRITES_DISABLED/);});
