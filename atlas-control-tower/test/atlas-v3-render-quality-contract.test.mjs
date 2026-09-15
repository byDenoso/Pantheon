import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('AtlasCanvas uses a smaller semantic and label budget on compact surfaces',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/visibleBudget:compact\?90:180/);
  assert.match(canvas,/labelBudget:compact\?20:36/);
  assert.match(canvas,/dpr=\{\[1,2\]\}/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/compact=\{compact\}/);
});
