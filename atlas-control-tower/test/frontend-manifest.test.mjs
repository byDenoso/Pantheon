import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const builds = new Set(vercel.builds.map(x => x.src));

const liveAssets=['ui/premium-v2.css','ui/reference-one.css','ui/control-tower.mjs','ui/workspace.mjs'];
const retiredStyles=['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/motion-impact.css','ui/readability.css'];

test('current frontend assets are declared and deployed', () => {
 for (const file of liveAssets) {
  assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
  assert.ok(builds.has(file), `vercel build missing ${file}`);
 }
 assert.match(index,/\/ui\/premium-v2\.css/);
 assert.match(index,/\/ui\/reference-one\.css/);
 assert.match(index,/id="command-center"/);
 assert.ok(index.indexOf('id="map-workspace"') < index.indexOf('id="command-center"'));
});

test('retired override styles are absent from the entrypoint and public build', () => {
 for(const file of retiredStyles){
  assert.equal(frontendFiles.includes(file),false,`frontend boundary still contains ${file}`);
  assert.equal(builds.has(file),false,`vercel still builds ${file}`);
  assert.doesNotMatch(index,new RegExp(file.replace(/[./]/g,m=>'\\'+m)),`entrypoint still loads ${file}`);
 }
});
