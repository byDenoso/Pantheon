import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('state:build regenerates both sovereign static state and Atlas Projection V3',()=>{
  const script=String(pkg.scripts?.['state:build']||'');
  assert.match(script,/generate-static-state\.mjs\s+public\/data/);
  assert.match(script,/generate-atlas-v3-state\.mjs/);
  assert.match(script,/--input\s+v3\/bootstrap-source\.json/);
  assert.match(script,/--out\s+public\/data\/v3/);
});
