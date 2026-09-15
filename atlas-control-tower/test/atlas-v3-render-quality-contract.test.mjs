import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('AtlasCanvas uses smaller semantic label star and DPR budgets on compact surfaces',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/visibleBudget:compact\?70:180/);
  assert.match(canvas,/labelBudget:compact\?14:36/);
  assert.match(canvas,/count=\{compact\?90:180\}/);
  assert.match(canvas,/PerformanceMonitor/);
  assert.match(canvas,/Math\.max\(1,value-\.25\)/);
  assert.match(canvas,/Math\.min\(compact\?1\.5:2,value\+\.15\)/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');assert.match(app,/compact=\{compact\}/);
});
