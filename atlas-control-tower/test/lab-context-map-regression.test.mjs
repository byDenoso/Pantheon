import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const read=rel=>fs.readFileSync(path.resolve(HERE,'..',rel),'utf8');

test('Laboratory contextual map renders the published nodes and relations instead of a summary-only empty stage',()=>{
  const page=read('src/pages/atlas-pages.tsx');
  const css=read('src/design/multisurface.css');
  assert.match(page,/compact-context-flow/,'context panel needs a visible node/edge flow');
  assert.match(page,/compact-context-node/,'context panel needs visible graph nodes');
  assert.match(page,/compact-context-edge/,'context panel needs visible declared relations');
  assert.match(page,/state\.graph\.nodes/,'context panel must be derived from the current published graph');
  assert.match(css,/\.compact-context-flow/,'context flow needs an explicit layout instead of inheriting the oversized blank stage');
});
