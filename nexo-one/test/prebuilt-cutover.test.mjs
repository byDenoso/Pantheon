import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../../.github/workflows/nexo-one-v05-cutover.yml',import.meta.url),'utf8');

test('production recovery stages a locally built Vercel output',()=>{
  assert.match(workflow,/vercel build --prod/);
  assert.match(workflow,/vercel deploy --prebuilt --prod --skip-domain/);
  assert.match(workflow,/cd nexo-one/);
});
