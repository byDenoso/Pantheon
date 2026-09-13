import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8');
const pages=fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml',import.meta.url),'utf8');

test('default browser client reads published static artifacts while explicit remote base stays compatibility-only',()=>{
  assert.match(client,/createStaticArtifactApi/);
  assert.match(client,/import\.meta\.env\.BASE_URL/);
  assert.match(client,/\/data|['"]data['"]/);
  assert.match(client,/createApi/);
  assert.match(client,/VITE_NEXO_API_BASE_URL/);
});

test('Pages stages static state before Vite build and readback proves manifest plus D7 sentinel',()=>{
  assert.match(pages,/npm run state:build[\s\S]*npm run build -- --base=\/Pantheon\//);
  assert.match(pages,/data\/current\/manifest\.json/);
  assert.match(pages,/science\/D7\.json/);
  assert.match(pages,/T-ALENS-001/);
  assert.match(pages,/sha256:/);
});
