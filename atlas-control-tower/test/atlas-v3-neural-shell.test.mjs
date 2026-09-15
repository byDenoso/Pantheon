import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');
const css=fs.readFileSync(new URL('src/atlas-v3/atlas-v3.css',root),'utf8');

test('V3 exposes a clean neural layer toggle bar',()=>{
  for(const layer of ['NEXO','SCIENCE','OPERATIONS','HEALTH','AUTOMATIONS','EVIDENCES']) assert.match(app,new RegExp(layer));
  assert.match(app,/role="toolbar"/);
  assert.match(app,/aria-label="Camadas neurais"/);
  assert.doesNotMatch(app,/className="layer-rail glass-panel"/);
});

test('V3 communicates a living learning system',()=>{
  assert.match(app,/LIVE/);
  assert.match(app,/LEARNING/);
  assert.match(app,/sistema vivo/i);
  assert.match(app,/atividade/i);
  assert.match(css,/neural-pulse/);
  assert.match(css,/learning-state/);
});

test('neural shell has responsive horizontal controls',()=>{
  assert.match(css,/\.neural-layer-bar/);
  assert.match(css,/overflow-x:\s*auto/);
  assert.match(css,/scrollbar-width:\s*none/);
  assert.match(css,/@media \(max-width:760px\)/);
});
