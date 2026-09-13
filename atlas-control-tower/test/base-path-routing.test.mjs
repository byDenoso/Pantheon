import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync(new URL('../src/atlas-route.ts',import.meta.url),'utf8');

test('Pages route helpers are explicitly base-path aware',()=>{
  assert.match(route,/import\.meta\.env\.BASE_URL/);
  assert.match(route,/stripBasePath/);
  assert.match(route,/addBasePath/);
});

test('route parsing strips the Vite base before interpreting graph segments',()=>{
  assert.match(route,/stripBasePath\(location\.pathname/);
});

test('route generation adds the Vite base after building the Atlas route',()=>{
  assert.match(route,/return\s+addBasePath\(/);
});
