import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('Vite builds both the canonical shell and Atlas V3 page',()=>{
  const config=fs.readFileSync(new URL('vite.config.ts',root),'utf8');
  assert.match(config,/rollupOptions/);
  assert.match(config,/index\.html/);
  assert.match(config,/atlas-v3\/index\.html/);
});
