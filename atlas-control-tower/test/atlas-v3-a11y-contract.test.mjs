import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 page provides accessible canvas summary and semantic controls',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V3 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  assert.match(app,/aria-label=["']Mapa de conhecimento/);
  assert.match(app,/aria-live/);
  assert.match(app,/aria-expanded/);
  assert.match(app,/aria-controls/);
  assert.match(app,/aria-label="Tema do Atlas"/);
});
