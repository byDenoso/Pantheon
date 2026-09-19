import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('Atlas opens on domain topology instead of an isolated NEXO root',async()=>{
  const [atlas,renderer]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/AtlasWebGL3D.tsx'),
  ]);

  assert.match(atlas,/setRootExpanded\] = useState\(true\)/);
  assert.match(atlas,/Visão por domínios/);
  assert.match(atlas,/Mostrar grafo completo/);
  assert.doesNotMatch(atlas,/else if \(rootExpanded\) setRootExpanded\(false\)/);
  assert.match(renderer,/toque em um domínio para abrir/);
  assert.match(renderer,/Enquadrar/);
});
