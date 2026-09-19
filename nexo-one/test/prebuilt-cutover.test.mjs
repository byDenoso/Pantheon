import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../../.github/workflows/nexo-one-pages.yml',import.meta.url),'utf8');

test('production Pages build stages a locally built static artifact',()=>{
  assert.match(workflow,/working-directory:\s*nexo-one/);
  assert.match(workflow,/npm run build/);
  assert.match(workflow,/actions\/upload-pages-artifact@v4/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
});
