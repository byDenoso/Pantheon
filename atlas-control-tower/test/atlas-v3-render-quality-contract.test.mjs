import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('AtlasCanvas lowers semantic density on compact surfaces and suspends hidden rendering',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/graphRenderBudget/);
  assert.match(canvas,/renderBudget\.visibleBudget/);
  assert.match(canvas,/renderBudget\.labelBudget/);
  assert.match(canvas,/renderActive/);
  assert.match(canvas,/document\.visibilityState/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');assert.match(app,/compact=\{compact\}/);
});
