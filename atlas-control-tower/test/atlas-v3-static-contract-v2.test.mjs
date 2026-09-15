import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('bundled V3 still reads only Projection V3 and never legacy runtimes',()=>{
  const loaderPath=new URL('src/atlas-v3/projection-loader.mjs',root);
  assert.equal(fs.existsSync(loaderPath),true,'projection loader must exist');
  const loader=fs.readFileSync(loaderPath,'utf8');
  assert.match(loader,/data\/v3\/current\/manifest\.json/);
  assert.match(loader,/TOWER_V06/);
  assert.match(loader,/projectionOnly/);
  assert.doesNotMatch(loader,/vercel\.app|neon|google drive/i);
});
