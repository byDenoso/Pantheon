import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const builds = new Set(vercel.builds.map(x => x.src));

const liveAssets=['ui/premium-v2.css','ui/reference-one.css','ui/cockpit-copy.mjs','src/App.tsx','src/scene/AtlasCanvas.tsx'];
const retiredStyles=['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/motion-impact.css','ui/readability.css'];

test('current frontend sources are declared and bundled by Vite', () => {
 for (const file of liveAssets) assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
 assert.ok(builds.has('package.json'), 'Vite static build missing');
 assert.match(main,/\.\.\/ui\/premium-v2\.css/);
 assert.match(main,/\.\.\/ui\/reference-one\.css/);
 assert.match(app,/id="command-center"/);
 assert.ok(app.indexOf('id="map-workspace"') < app.indexOf('id="command-center"'));
});

test('retired override styles are absent from the Vite source boundary', () => {
 for(const file of retiredStyles){
  assert.equal(frontendFiles.includes(file),false,`frontend boundary still contains ${file}`);
  assert.equal(builds.has(file),false,`Vercel still builds ${file}`);
  assert.doesNotMatch(main,new RegExp(file.replace(/[./]/g,m=>'\\'+m)),`entrypoint still imports ${file}`);
 }
});
