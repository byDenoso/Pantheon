import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');
const canvas=fs.readFileSync(new URL('src/scene/AtlasCanvas.tsx',root),'utf8');

test('inspector exposes contextual premium content only from published fields',()=>{
  assert.match(app,/inspector-context/);
  assert.match(app,/Resumo/);
  assert.match(app,/Próximo movimento/);
  assert.match(app,/node\.summary/);
  assert.match(app,/entity\?\./);
});

test('mobile and desktop use bounded pixel density for the neural renderer',()=>{
  assert.match(canvas,/dpr=\{\[1,compact\?1\.35:1\.75\]\}/);
  assert.match(canvas,/graphRenderBudget/);
});
