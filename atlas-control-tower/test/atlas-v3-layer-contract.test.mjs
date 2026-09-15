import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 preserves six overlay layers over one scene graph',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V3 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  for(const layer of ['SCIENCE','LEARNING','OPERATIONS','EVIDENCE','PROVENANCE','HEALTH']) assert.match(app,new RegExp(layer));
  assert.match(app,/layer-muted|layerVisible|nodeVisibleForLayer/);
});
