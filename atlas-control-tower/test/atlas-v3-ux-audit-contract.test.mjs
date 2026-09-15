import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const exists=path=>fs.existsSync(new URL(path,root));
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('V3 exposes explicit loading error empty and navigation affordances',()=>{
  assert.equal(exists('src/atlas-v3/AtlasV3App.tsx'),true,'V3 app must exist');
  const app=read('src/atlas-v3/AtlasV3App.tsx');
  assert.match(app,/aria-busy/);
  assert.match(app,/role=["']alert["']/);
  assert.match(app,/Nenhuma entidade encontrada/);
  assert.match(app,/Voltar ao NEXO/);
  assert.match(app,/Escape/);
  assert.match(app,/aria-live/);
});

test('V3 search and layers are touch reachable and not hover-only',()=>{
  assert.equal(exists('src/atlas-v3/atlas-v3.css'),true,'V3 CSS must exist');
  const css=read('src/atlas-v3/atlas-v3.css');
  assert.match(css,/\.layer-button/);
  assert.match(css,/\.search-trigger/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/touch-action/);
});
