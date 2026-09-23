import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 app supports focus history home and Escape navigation',()=>{
  const appPath=new URL('src/atlas-v3/AtlasV3App.tsx',root);
  assert.equal(fs.existsSync(appPath),true,'V3 app must exist');
  const app=fs.readFileSync(appPath,'utf8');
  assert.match(app,/focusHistory/);
  assert.match(app,/Voltar ao Nexo/);
  assert.match(app,/event\.key===['"]Escape['"]/);
  assert.match(app,/setFocusId/);
});
