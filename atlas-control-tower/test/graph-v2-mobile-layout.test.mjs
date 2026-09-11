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

test('graph route owns the viewport instead of inheriting document padding',()=>{
  const css=read('src/design/graph-v2.css');
  assert.match(css,/\.nexo-content:has\(\.graphs-page\)\{[^}]*padding:0[^}]*max-width:none/);
  assert.match(css,/\.graphs-page\{[^}]*height:calc\(100dvh - 64px\)[^}]*overflow:hidden/);
  assert.match(css,/\.graph-v2-shell\{[^}]*position:relative[^}]*height:100%[^}]*min-height:0/);
  assert.match(css,/\.graph-v2-toolbar\{[^}]*position:absolute/);
  assert.match(css,/\.graph-v2-main\{[^}]*position:absolute[^}]*inset:0/);
});

test('mobile canvas fills the route and inspector stays collapsed after selection',()=>{
  const explorer=read('src/graph-engine/GraphExplorer.tsx');
  const css=read('src/design/graph-v2.css');
  assert.match(css,/@media\(max-width:560px\)\{[^}]*\.graphs-page\{[^}]*height:calc\(100dvh - 116px\)/s);
  assert.match(css,/\.graph-v2-inspector:not\(\.is-open\) \.graph-v2-inspector-body\{display:none\}/);
  assert.match(explorer,/matchMedia\('\(min-width:861px\)'\)/);
});
