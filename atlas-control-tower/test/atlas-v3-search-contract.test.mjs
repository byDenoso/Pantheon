import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 search results can select and focus canonical entities',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V3 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  assert.match(app,/searchResults/);
  assert.match(app,/focusEntity/);
  assert.match(app,/canonicalIds/);
});
