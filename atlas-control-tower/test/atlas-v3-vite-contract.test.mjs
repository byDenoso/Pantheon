import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('Vite builds both the canonical shell and Atlas V3 page without renaming the root entry',()=>{
  const config=fs.readFileSync(new URL('vite.config.ts',root),'utf8');
  assert.match(config,/rollupOptions/);
  assert.match(config,/index:\s*['"]index\.html['"]/);
  assert.match(config,/atlasV3:\s*['"]atlas-v3\/index\.html['"]/);
});
