import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../../.github/workflows/nexo-one-pages.yml',import.meta.url),'utf8');

test('production promotion builds a static artifact and deploys it through GitHub Pages',async()=>{
  const scripts=JSON.parse(await readFile(new URL('../../nexo-atlas/package.json',import.meta.url),'utf8')).scripts;
  assert.match(workflow,/npm run check/);
  assert.equal(scripts.check,'npm run typecheck && npm run build && npm test');
  assert.match(workflow,/actions\/upload-pages-artifact@v4/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
  assert.match(workflow,/working-directory: nexo-atlas/);
  assert.doesNotMatch(workflow,/vercel deploy --prebuilt --prod/);
});
