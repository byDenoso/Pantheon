import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('legacy standalone SVG graph is retired after the R3F V3 cutover',()=>{
  assert.equal(fs.existsSync(new URL('public/atlas-v3/atlas-v3.js',root)),false);
  assert.equal(fs.existsSync(new URL('public/atlas-v3/index.html',root)),false);
});
