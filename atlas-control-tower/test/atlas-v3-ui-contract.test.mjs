import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('atlas-v3/index.html',root),'utf8');
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');
const css=fs.readFileSync(new URL('src/atlas-v3/atlas-v3.css',root),'utf8');
const themeCss=fs.readFileSync(new URL('src/atlas-v3/atlas-v3-theme.css',root),'utf8');
const adapter=fs.readFileSync(new URL('src/atlas-v3/scene-adapter.mjs',root),'utf8');

test('V3 presents a cinematic neural canvas rather than the retired SVG dashboard',()=>{
  assert.match(html,/NEXO Atlas/);
  assert.match(app,/AtlasCanvas/);
  assert.match(app,/Mapa neural em canvas 2\.5D/);
  assert.match(app,/SPATIAL CANVAS/);
  assert.match(app,/Buscar campanha, claim, teste ou/);
  assert.match(app,/TOWER_V06/);
  assert.match(css,/radial-gradient/);
  assert.match(css,/backdrop-filter/);
  assert.match(css,/\.layer-rail/);
  assert.match(css,/\.control-dock/);
  assert.match(themeCss,/data-presentation="canvas"/);
});

test('V3 presentation hierarchy is explicit and non-canonical',()=>{
  assert.match(adapter,/__PRESENTATION_NEXO__/);
  assert.match(adapter,/__PRESENTATION_CLUSTER__/);
  assert.match(adapter,/presentationOnly:true/);
  assert.match(adapter,/INTERDOMAIN/);
  assert.match(adapter,/OLYMPUS/);
  assert.match(adapter,/ENGINEERING/);
});

test('V3 keeps a dedicated mobile composition',()=>{
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/100dvh/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/\.inspector-sheet\.is-open/);
  assert.match(css,/orientation:landscape/);
  assert.match(themeCss,/@media \(max-width:760px\)/);
});
