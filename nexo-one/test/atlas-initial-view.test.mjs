import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('Atlas opens on the Tower-synced layered projection and preserves drill-down',async()=>{
  const [atlas,renderer,layout]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/LayeredGraphRenderer.tsx'),
    text('src/viewmodels/layeredGraph.ts'),
  ]);

  assert.match(atlas,/setRootExpanded\] = useState\(true\)/);
  assert.match(atlas,/Visão por domínios/);
  assert.match(atlas,/Mostrar grafo completo/);
  assert.match(atlas,/<LayeredGraphRenderer/);
  assert.match(atlas,/sourceRevision=\{galaxySnapshot\.tower_revision\}/);
  assert.match(atlas,/sourceFingerprint=\{galaxySnapshot\.fingerprint\}/);
  assert.match(renderer,/data-renderer="layered-tower-projection"/);
  assert.match(renderer,/TOWER ·/);
  assert.match(renderer,/focusDomain:/);
  assert.match(renderer,/focusSubdomain:/);
  assert.match(renderer,/focusEntity:/);
  assert.match(renderer,/reset:/);
  assert.match(layout,/layoutLayeredGraph/);
  assert.match(layout,/LAYERED_LAYERS/);
});
