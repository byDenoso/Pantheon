import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 marks compact rendering from viewport instead of pretending every GPU is desktop',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V3 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  assert.match(app,/useMedia\(['"]\(max-width: 760px\)['"]\)/);
  assert.match(app,/compact=\{compact\}/);
});
