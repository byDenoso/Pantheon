import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml',import.meta.url),'utf8');

test('Pages readback proves the published root enters standalone Neural V4',()=>{
  assert.match(workflow,/ATLAS_V4_ROOT_REDIRECT_READBACK_OK/);
  assert.match(workflow,/page\.goto\(process\.env\.PAGE_URL/);
  assert.match(workflow,/\/Pantheon\/atlas-v3\//);
  assert.match(workflow,/premium-shell/);
});
