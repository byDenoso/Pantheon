import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('active Atlas renderer is the layered Tower projection',async()=>{
  const [view,renderer,layout]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/LayeredGraphRenderer.tsx'),
    text('src/viewmodels/layeredGraph.ts'),
  ]);
  assert.match(view,/LayeredGraphRenderer/);
  assert.doesNotMatch(view,/<AtlasGalaxyRenderer/);
  assert.match(renderer,/data-renderer="layered-tower-projection"/);
  assert.match(renderer,/sourceRevision/);
  assert.match(renderer,/sourceFingerprint/);
  assert.match(layout,/DOMAIN.*ENTITY.*CAPABILITY.*WORK.*INSIGHT/s);
});

test('layered renderer preserves semantic edge classes and focus neighborhood',async()=>{
  const [renderer,layout]=await Promise.all([
    text('src/components/LayeredGraphRenderer.tsx'),
    text('src/viewmodels/layeredGraph.ts'),
  ]);
  assert.match(renderer,/edge\.kind === 'BLOCKS'/);
  assert.match(renderer,/edge\.kind === 'CONTRADICTS'/);
  assert.match(renderer,/edge\.is_learning/);
  assert.match(renderer,/edge\.kind === 'SUPPORTS'/);
  assert.match(renderer,/neighborhoodOf\(graph, selectedId\)/);
  assert.match(layout,/crossLayer: from\.layer !== to\.layer/);
});

test('layered layout keeps canonical node types and deterministic domain lanes',async()=>{
  const layout=await text('src/viewmodels/layeredGraph.ts');
  assert.match(layout,/LAYER_BY_NODE_TYPE/);
  assert.match(layout,/DOMAIN_ORDER/);
  assert.match(layout,/hexOffset/);
  assert.match(layout,/a\.id\.localeCompare\(b\.id\)/);
  assert.doesNotMatch(layout,/Math\.random/);
});

test('camera compatibility API remains available for search tours and deep links',async()=>{
  const renderer=await text('src/components/LayeredGraphRenderer.tsx');
  assert.match(renderer,/forwardRef<CanvasGraph25DHandle/);
  assert.match(renderer,/focusDomain:/);
  assert.match(renderer,/focusSubdomain:/);
  assert.match(renderer,/focusEntity:/);
  assert.match(renderer,/focusPoint:/);
  assert.match(renderer,/getView:/);
});

test('Tower revision and fingerprint are visible read-only provenance, not new authority',async()=>{
  const [view,renderer,contracts]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/LayeredGraphRenderer.tsx'),
    text('src/contracts/system.ts'),
  ]);
  assert.match(view,/galaxySnapshot\.tower_revision/);
  assert.match(view,/galaxySnapshot\.fingerprint/);
  assert.match(renderer,/data-source-revision/);
  assert.match(renderer,/data-source-fingerprint/);
  assert.match(contracts,/frontend nunca é Truth Owner/);
});
