import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('root presentation assigns distinct positions to every canonical cluster instead of collapsing unknown clusters at the center', () => {
  const canvas = read('src/scene/CanvasGraphFallback.tsx');
  for (const key of ['SCIENCE', 'ENGINEERING', 'INTERDOMAIN', 'OLYMPUS', 'OPERATIONS', 'REFERENCES', 'OTHER']) {
    assert.match(canvas, new RegExp(`${key}:\\{x:`), `missing explicit root position for ${key}`);
  }
});

test('mobile root view uses container width to switch to compact screen-space domain placement', () => {
  const canvas = read('src/scene/CanvasGraphFallback.tsx');
  assert.match(canvas, /mobile=width<=520/);
  assert.match(canvas, /domainScreenPoint/);
  assert.match(canvas, /Math\.min\(width\*\.32,145\)/);
});

test('mobile root view suppresses secondary node labels and wraps domain labels inside bounded width', () => {
  const canvas = read('src/scene/CanvasGraphFallback.tsx');
  assert.match(canvas, /mobile&&focusRef\.current===ROOT/);
  assert.match(canvas, /truncateLabel/);
  assert.match(canvas, /ctx\.textAlign='center'/);
  assert.match(canvas, /const showLabel=rootMobile\?\(domain\|\|active\)/);
});
