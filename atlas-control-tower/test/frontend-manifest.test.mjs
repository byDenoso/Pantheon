import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const builds = new Set(vercel.builds.map(x => x.src));

test('Premium V2 public assets are declared and deployed', () => {
 for (const file of ['ui/premium-v2.css','ui/workspace.mjs']) {
  assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
  assert.ok(builds.has(file), `vercel build missing ${file}`);
 }
});

test('Observatory overview assets are declared, deployed and the operational deck follows the map', () => {
 for (const file of ['ui/control-tower.css','ui/control-tower.mjs','ui/observatory-v2.css']) {
  assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
  assert.ok(builds.has(file), `vercel build missing ${file}`);
 }
 assert.match(index, /\/ui\/control-tower\.css/);
 assert.match(index, /\/ui\/observatory-v2\.css/);
 assert.match(index, /id="command-center"/);
 assert.ok(index.indexOf('id="map-workspace"') < index.indexOf('id="command-center"'));
});

test('entrypoint loads Premium V2 instead of legacy competing override layers', () => {
 assert.match(index, /\/ui\/premium-v2\.css/);
 assert.doesNotMatch(index, /\/ui\/motion-impact\.css/);
 assert.doesNotMatch(index, /\/ui\/readability\.css/);
});

test('dead legacy override styles are not deployed as public build assets', () => {
 assert.equal(builds.has('ui/motion-impact.css'), false);
 assert.equal(builds.has('ui/readability.css'), false);
});
