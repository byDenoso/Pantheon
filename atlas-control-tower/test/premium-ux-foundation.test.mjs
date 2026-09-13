import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const graph=fs.readFileSync(new URL('../src/pages/graphs-page.tsx',import.meta.url),'utf8');
const inspector=fs.readFileSync(new URL('../src/graph-engine/SpatialInspector.tsx',import.meta.url),'utf8');
const tokens=fs.readFileSync(new URL('../src/design/tokens.css',import.meta.url),'utf8');
const spatial=fs.readFileSync(new URL('../src/design/spatial-interface.css',import.meta.url),'utf8');
const mobile=fs.readFileSync(new URL('../src/design/mobile.css',import.meta.url),'utf8');

test('premium shell exposes compact command entry and graph context bar',()=>{
  assert.match(app,/premium-shell/);
  assert.match(app,/CommandEntry/);
  assert.match(app,/atlas-command-trigger/);
  assert.match(graph,/AtlasContextBar/);
  assert.match(graph,/atlas-context-bar/);
});

test('semantic design tokens own shell graph state and motion',()=>{
  for(const token of ['--surface-overlay','--graph-background','--edge-evidence','--state-stale','--motion-fast','--z-inspector']){
    assert.match(tokens,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});

test('App delegates styling to the single design-system entrypoint',()=>{
  assert.doesNotMatch(app,/react-atlas\.css|atlas-shell\.css|graph-visual\.css/);
});

test('premium inspector uses human-facing tabs, trust cues and technical disclosure',()=>{
  assert.match(inspector,/spatial-sheet-handle/);
  assert.match(inspector,/Visão Geral/);
  assert.match(inspector,/Evidências/);
  assert.match(inspector,/spatial-trust-block/);
  assert.match(inspector,/Detalhes técnicos/);
});

test('mobile graph layout respects dynamic viewport safe areas and touch targets',()=>{
  const css=spatial+'\n'+mobile;
  assert.match(css,/100dvh/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/min-height:\s*44px/);
  assert.match(css,/scroll-snap-type/);
});

test('graph premium surface keeps full-bleed workspace and trust metadata separate from canvas controls',()=>{
  assert.match(spatial,/\.spatial-stage/);
  assert.match(spatial,/\.atlas-context-bar/);
  assert.match(spatial,/\.spatial-trust-block/);
  assert.match(spatial,/--z-inspector/);
});
