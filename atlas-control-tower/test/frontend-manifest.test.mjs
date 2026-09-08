import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const builds = new Set(vercel.builds.map(x => x.src));

const liveAssets=['nextgen/styles.css','nextgen/app.mjs','nextgen/graph/engine.mjs'];
const retiredStyles=['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/motion-impact.css','ui/readability.css'];

test('current NextGen frontend assets are declared and deployed', () => {
 for (const file of liveAssets) {
  assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
  assert.ok(builds.has(file), `vercel build missing ${file}`);
 }
 assert.match(index,/\/nextgen\/styles\.css/);
 assert.match(index,/\/nextgen\/app\.mjs/);
 assert.match(index,/id="cosmos"/);
 assert.match(index,/class="lower-deck"/);
});

test('NextGen API route is deployed ahead of generic legacy routes', () => {
 assert.ok(builds.has('api/ng.js'),'api/ng.js must be built');
 const routes=vercel.routes.map(x=>x.src);
 const nextgen=routes.indexOf('/api/ng');
 const generic=routes.findIndex(x=>String(x).includes('state|sync|graph'));
 assert.ok(nextgen>=0,'/api/ng route missing');
 assert.ok(generic<0||nextgen<generic,'NextGen route must resolve before generic API routes');
});

test('retired override styles stay out of the NextGen entrypoint', () => {
 for(const file of retiredStyles){
  assert.doesNotMatch(index,new RegExp(file.replace(/[./]/g,m=>'\\'+m)),`entrypoint still loads ${file}`);
 }
});
