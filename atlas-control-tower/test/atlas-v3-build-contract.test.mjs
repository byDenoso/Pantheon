import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('state:build regenerates both sovereign static state and Atlas Projection V3',()=>{
  const script=String(pkg.scripts?.['state:build']||'');
  assert.match(script,/generate-static-state\.mjs\s+public\/data/);
  assert.match(script,/generate-atlas-v3-state\.mjs/);
  assert.match(script,/--input\s+v3\/tower-source\.json/);
  assert.doesNotMatch(script,/bootstrap-source\.json/);
  assert.match(script,/--out\s+public\/data\/v3/);
});

test('Tower source can be refreshed by the dedicated sanitizer before projection',()=>{
  assert.match(String(pkg.scripts?.['tower:sync']||''),/sync-atlas-v3-tower\.mjs/);
});
