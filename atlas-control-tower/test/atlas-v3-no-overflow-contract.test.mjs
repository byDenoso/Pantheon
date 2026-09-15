import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 shell prevents page overflow while allowing internal rails and sheets to scroll',()=>{
  const cssPath=new URL('src/atlas-v3/atlas-v3.css',root);
  assert.equal(fs.existsSync(cssPath),true,'V3 CSS must exist');
  const css=fs.readFileSync(cssPath,'utf8');
  assert.match(css,/html,body,#atlas-v3-root/);
  assert.match(css,/overflow:\s*hidden/);
  assert.match(css,/\.layer-rail[^}]*overflow-x:\s*auto/s);
  assert.match(css,/\.inspector-body[^}]*overflow-y:\s*auto/s);
});
