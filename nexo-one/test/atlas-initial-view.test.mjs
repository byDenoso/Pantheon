import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('Atlas opens on the three-domain NEXO galaxy and exposes camera drill-down',async()=>{
  const [atlas,renderer,canvas]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/AtlasCanvas25D.tsx'),
    text('src/components/CanvasGraph25D.tsx'),
  ]);

  assert.match(atlas,/setRootExpanded\] = useState\(true\)/);
  assert.match(atlas,/Visão por domínios/);
  assert.match(atlas,/Mostrar grafo completo/);
  assert.match(atlas,/controllerRef=\{galaxyRef\}/);
  assert.match(renderer,/GALAXY_ARMS/);
  assert.match(renderer,/Galáxia 2\.5D do NEXO ONE/);
  assert.match(canvas,/focusDomain/);
  assert.match(canvas,/focusSubdomain/);
  assert.match(canvas,/focusEntity/);
  assert.match(canvas,/reset/);
});
