import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('shell domain hydration never inserts Science as an implicit parent',()=>{
  assert.doesNotMatch(app,/state\.focusId === 'system:NEXO'[^\n]*focusSystem\('system:SCIENCE'/);
  assert.match(app,/const domain = \{ id: `domain:\$\{route\.context\.domain\}`[^\n]+\n\s*void actions\.open\(domain\);/);
});

test('explicit science graph paths may still hydrate Science for backwards-compatible routes',()=>{
  assert.match(app,/segment\.toLowerCase\(\) === 'science' \? 'system:SCIENCE'/);
});
