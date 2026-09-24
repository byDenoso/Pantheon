import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('layered layout keeps canonical node types and deterministic domain lanes',async()=>{
  const layout=await text('src/viewmodels/layeredGraph.ts');
  assert.match(layout,/LAYER_BY_NODE_TYPE/);
  assert.match(layout,/DOMAIN_ORDER/);
  assert.match(layout,/hexOffset/);
  assert.match(layout,/a\.id\.localeCompare\(b\.id\)/);
  assert.doesNotMatch(layout,/Math\.random/);
});

