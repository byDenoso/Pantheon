import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));

test('mobile V3 uses a full-screen stage and safe-area aware chrome',()=>{
  assert.equal(exists('src/atlas-v3/atlas-v3.css'),true,'mobile-first V3 stylesheet must exist');
  const css=read('src/atlas-v3/atlas-v3.css');
  assert.match(css,/100dvh/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/overflow-x:\s*hidden/);
  assert.match(css,/min-(?:width|height):\s*44px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/\.inspector-sheet/);
});

test('mobile inspector is a dismissible bottom sheet rather than a desktop overlay squeezed onto the phone',()=>{
  assert.equal(exists('src/atlas-v3/AtlasV3App.tsx'),true);
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/inspector-sheet/);
  assert.match(app,/aria-modal/);
  assert.match(app,/Fechar inspector/);
  assert.match(app,/compact=/);
});

test('mobile browser smoke covers portrait landscape and tablet overflow',()=>{
  const workflow=read('../.github/workflows/atlas-pages-fallback.yml');
  assert.match(workflow,/390,height:844/);
  assert.match(workflow,/844,height:390/);
  assert.match(workflow,/768,height:1024/);
  assert.match(workflow,/scrollWidth/);
  assert.match(workflow,/atlas-v3-stage/);
});
