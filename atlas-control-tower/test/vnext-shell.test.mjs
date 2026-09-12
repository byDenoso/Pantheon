import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('vNext exposes five top-level product areas and Learning is an overlay',()=>{
  const nav=read('src/app/navigation.ts');
  for(const label of ['Visão geral','Domínios','Grafos','Operação','Proveniência']) assert.match(nav,new RegExp(label));
  assert.doesNotMatch(nav,/label: 'Learning'/);
  assert.doesNotMatch(nav,/Universo científico|Black Box.*nav/i);
});

test('routes are lazy and keep graph engines out of the root shell',()=>{
  const app=read('src/App.tsx');
  for(const page of ['ObservatoryPage','LaboratoryPage','UniversePage']){
    assert.match(app,new RegExp(`lazy\\(.*${page}`,'s'),`${page} is not lazy`);
  }
  assert.match(app,/useAtlasRoute/);
  assert.match(app,/GraphsPage/);
  assert.doesNotMatch(app,/<AtlasCanvas|<Canvas|GraphExplorer/);
});

test('main entrypoint uses only the vNext design system',()=>{
  const main=read('src/main.tsx');
  assert.match(main,/\.\/design\/index\.css/);
  for(const legacy of ['../styles.css','official-dashboard.css','premium-v2.css','reference-one.css']) assert.doesNotMatch(main,new RegExp(legacy.replace(/[./]/g,m=>'\\'+m)));
});

test('local Vite development proxies canonical API reads',()=>{
  const vite=read('vite.config.ts');
  assert.match(vite,/['"]\/api['"]/);
  assert.match(vite,/apiBase/);
  assert.doesNotMatch(vite,/nexo-atlas-control-tower\.vercel\.app/);
});
