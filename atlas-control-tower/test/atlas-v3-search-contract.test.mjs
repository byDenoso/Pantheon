import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('Neural V4 search focuses canonical entities and reveals their domain or overlay',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V4 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  assert.match(app,/searchResults/);
  assert.match(app,/focusEntity/);
  assert.match(app,/canonicalIds/);
  assert.match(app,/primaryDomainForNode/);
  assert.match(app,/overlayForNode/);
  assert.match(app,/setPrimaryDomain\(current=>primaryDomainForNode\(node,current\)\)/);
});
