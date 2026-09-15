import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('AtlasCanvas caps DPR and semantic budgets on compact surfaces',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/visibleBudget:compact\?60:180/);
  assert.match(canvas,/labelBudget:compact\?12:36/);
  assert.match(canvas,/dpr=\{compact\?\[1,1\.5\]:\[1,2\]\}/);
});
