import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const builds = new Set(vercel.builds.map(x => x.src));

const retiredStyles=['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/motion-impact.css','ui/readability.css'];

test('the React frontend is built as one Vite artifact and deployed with the API boundary', () => {
 assert.ok(frontendFiles.includes('index.html'), 'frontend boundary must retain the entrypoint');
 assert.ok(builds.has('package.json'), 'Vercel must run the Vite static build');
 assert.equal(packageJson.scripts?.build, 'vite build');
 assert.match(index, /id="root"/);
 assert.match(index, /src\/main\.tsx/);
 assert.ok(builds.has('api/runtime-orphans.js'), 'API wrapper remains in the deployment');
});

test('retired override styles are absent from the entrypoint and public build', () => {
 for(const file of retiredStyles){
  assert.equal(frontendFiles.includes(file),false,`frontend boundary still contains ${file}`);
  assert.equal(builds.has(file),false,`vercel still builds ${file}`);
  assert.doesNotMatch(index,new RegExp(`<link[^>]+${file.replace(/[./]/g,m=>'\\'+m)}`),`entrypoint still loads ${file}`);
 }
});
