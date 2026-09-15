import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');
const css=fs.readFileSync(new URL('src/atlas-v3/atlas-v3.css',root),'utf8');

test('Neural V4 separates primary domains from contextual overlays',()=>{
  for(const domain of ['NEXO','SCIENCE','OPERATIONS','HEALTH']) assert.match(app,new RegExp(domain));
  for(const overlay of ['LEARNING','AUTOMATIONS','EVIDENCE']) assert.match(app,new RegExp(overlay));
  assert.match(app,/atlas-domain-bar/);
  assert.match(app,/atlas-overlay-menu/);
  assert.match(app,/role="toolbar"/);
  assert.doesNotMatch(app,/className="layer-rail glass-panel"/);
});

test('Neural V4 communicates live, stale and learning state without inventing data',()=>{
  assert.match(app,/LIVE/);
  assert.match(app,/STALE/);
  assert.match(app,/LEARNING/);
  assert.match(app,/Estrutura factual/);
  assert.match(app,/last-known-good|última projeção válida|último snapshot válido/i);
  assert.match(css,/neural-pulse/);
  assert.match(css,/learning-state/);
});

test('neural shell keeps responsive horizontal domain controls',()=>{
  assert.match(css,/\.neural-layer-bar/);
  assert.match(css,/overflow-x:\s*auto/);
  assert.match(css,/scrollbar-width:\s*none/);
  assert.match(css,/@media \(max-width:760px\)/);
});
