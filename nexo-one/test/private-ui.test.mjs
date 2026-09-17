import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url),text=path=>readFile(new URL(path,root),'utf8');
const chosenPin=['23','01'].join('');

test('private PIN never appears in browser source',async()=>{
  for(const path of ['src/app/App.tsx','src/app/useSession.ts','src/features/PersonalCockpit.tsx']){
    const source=await text(path);
    assert.equal(source.includes(chosenPin),false,`${path} contém PIN literal`);
  }
});

test('PIN input is ephemeral and private handoff preserves the current hash',async()=>{
  const app=await text('src/app/App.tsx');
  assert.match(app,/const \[pin, setPin\]/);
  assert.match(app,/const submitted=pin;setPin\(''\)/);
  assert.match(app,/target\.hash = window\.location\.hash/);
  assert.match(app,/data-access=\{session\.session\.authenticated\?'PRIVATE':'PUBLIC'\}/);
});

test('session UX uses same-origin cookies and generic PIN failures',async()=>{
  const source=await text('src/app/useSession.ts');
  assert.match(source,/credentials:'same-origin'/);
  assert.match(source,/PIN inválido\./);
  assert.doesNotMatch(source,/Confira a senha/);
  assert.match(source,/Runtime privado indisponível\./);
});
