import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('Atlas opens on the three-domain NEXO galaxy and exposes camera drill-down',async()=>{
  const [atlas,adapter,three,canvas]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/AtlasGalaxyRenderer.tsx'),
    text('src/components/GalaxyThree3D.tsx'),
    text('src/components/CanvasGraph25D.tsx'),
  ]);

  assert.match(atlas,/setRootExpanded\] = useState\(true\)/);
  assert.match(atlas,/Visão por domínios/);
  assert.match(atlas,/Mostrar grafo completo/);
  assert.match(atlas,/<AtlasGalaxyRenderer ref=\{galaxyRef\}/);
  assert.match(atlas,/galaxySnapshot\.domains/);
  assert.match(adapter,/GalaxyThree3D/);
  assert.match(adapter,/AtlasCanvas25D/);
  assert.match(three,/focusDomain/);
  assert.match(three,/focusSubdomain/);
  assert.match(three,/focusEntity/);
  assert.match(three,/reset/);
  assert.match(canvas,/focusDomain/);
});
