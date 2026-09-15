import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('mobile controls meet 44px touch target floor',()=>{
  const cssPath=new URL('src/atlas-v3/atlas-v3.css',root);
  assert.equal(fs.existsSync(cssPath),true,'V3 CSS must exist');
  const css=fs.readFileSync(cssPath,'utf8');
  assert.match(css,/--hit:\s*44px/);
});
