import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V4 keeps primary domains distinct from contextual overlays over one scene graph',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  const semanticPath=new URL('src/atlas-v3/semantic-v4.mjs',root);
  assert.equal(fs.existsSync(appPath),true,'V4 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  const semantic=fs.readFileSync(semanticPath,'utf8');
  for(const domain of ['NEXO','SCIENCE','OPERATIONS','HEALTH']) assert.match(semantic,new RegExp(domain));
  for(const overlay of ['LEARNING','AUTOMATIONS','EVIDENCE']) assert.match(semantic,new RegExp(overlay));
  assert.match(app,/graphForSemanticContext/);
  assert.match(app,/overlayAvailability/);
  assert.match(app,/disabled=\{!available\}/);
  assert.doesNotMatch(app,/nodeVisibleForLayer/);
});
