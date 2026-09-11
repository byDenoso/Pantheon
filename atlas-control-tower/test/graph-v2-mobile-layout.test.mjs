import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('mobile graph uses compact controls and a collapsible bottom sheet',()=>{
  const explorer=read('src/graph-engine/GraphExplorer.tsx');
  const css=read('src/design/graph-v2.css');
  assert.match(explorer,/graph-v2-inspector-toggle/);
  assert.match(explorer,/inspectorOpen/);
  assert.match(explorer,/aria-label="Centralizar grafo"[^>]*>◎</);
  assert.match(css,/@media\(max-width:860px\)/);
  assert.match(css,/\.graph-v2-inspector:not\(\.is-open\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/100dvh/);
  assert.match(css,/\.graph-v2-toolbar>div:first-child\{display:none\}/);
});

test('mobile canvas keeps most of the viewport available to the graph',()=>{
  const css=read('src/design/graph-v2.css');
  assert.match(css,/\.graph-v2-main\{[^}]*min-height:calc\(100dvh - 146px\)/);
  assert.match(css,/\.graph-v2-inspector:not\(\.is-open\) \.graph-v2-inspector-body\{display:none\}/);
});
