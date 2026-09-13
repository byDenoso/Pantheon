import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('science API keeps detailed GitHub-authorized results available when Neon is unavailable',()=>{
 const science=read('api/science.js');
 assert.match(science,/science-github-fallback\.mjs/);
 assert.match(science,/projectTowerSnapshot/);
 assert.match(science,/SCIENCE_V1_UNAVAILABLE/);
});

test('fallback projection carries exact corpus counts and bounded test samples',()=>{
 const fallback=read('lib/science-github-fallback.mjs');
 assert.match(fallback,/nexo-science-github-fallback-v1/);
 assert.match(fallback,/testCount/);
 assert.match(fallback,/hasMore/);
 assert.match(fallback,/RESULT/);
 assert.match(fallback,/PEER_CONTROL_TOWER_CANONICAL/);
});
