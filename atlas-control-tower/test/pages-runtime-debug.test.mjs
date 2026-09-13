import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../lib/atlas-api.mjs';

const client=fs.readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const types=fs.readFileSync(new URL('../src/api/types.ts',import.meta.url),'utf8');
const graphsPage=fs.readFileSync(new URL('../src/pages/graphs-page.tsx',import.meta.url),'utf8');
const pagesWorkflow=fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml',import.meta.url),'utf8');
const reply=body=>({ok:true,status:200,json:async()=>body});

test('absolute Atlas API base keeps the native Atlas graph and state routes',async()=>{
  const calls=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    calls.push(String(url));
    const path=new URL(String(url)).pathname;
    if(path.endsWith('/graph'))return reply({focus:'system:NEXO',nodes:[{id:'system:NEXO'}],edges:[]});
    if(path.endsWith('/state'))return reply({summary:null});
    return reply({});
  };
  try{
    const api=createApi({baseUrl:'https://nexo-atlas-control-tower.vercel.app/api',profile:'atlas'});
    await api.graph({focus:'system:NEXO'});
    await api.state({});
    assert.match(calls[0],/\/api\/graph\?/);
    assert.match(calls[1],/\/api\/state\?/);
  }finally{globalThis.fetch=originalFetch}
});

test('non JSON 200 responses fail with an Atlas route diagnostic',async()=>{
  const api=createApi({
    baseUrl:'https://nexo-atlas-control-tower.vercel.app/api',
    profile:'atlas',
    fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> 'text/html; charset=utf-8'},json:async()=>{throw new SyntaxError('The string did not match the expected pattern.')}})
  });
  await assert.rejects(()=>api.graph({focus:'system:NEXO'}),/ATLAS_API_NON_JSON.*graph/i);
});

test('malformed JSON without a content type still names the failing Atlas route',async()=>{
  const api=createApi({
    baseUrl:'https://nexo-atlas-control-tower.vercel.app/api',
    profile:'atlas',
    fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> ''},json:async()=>{throw new SyntaxError('Unexpected token <')}})
  });
  await assert.rejects(()=>api.graph({focus:'system:NEXO'}),/ATLAS_API_INVALID_JSON.*graph/i);
});

test('browser product declares the Atlas API profile explicitly',()=>{
  assert.match(client,/profile\s*:\s*['"]atlas['"]/);
});

test('empty initial graph errors never claim that a previous graph was preserved',()=>{
  assert.match(graphsPage,/state\.error\s*&&\s*graph\s*&&/);
});

test('Pages readback exercises the graph route, not health alone',()=>{
  assert.match(pagesWorkflow,/\/api\/graph\?focus=/);
  assert.match(pagesWorkflow,/GRAPH=/);
});

test('Pages deploy boots the built app in a real browser before publishing',()=>{
  assert.match(pagesWorkflow,/name:\s*Browser bootstrap smoke/);
  assert.match(pagesWorkflow,/google-chrome|chromium/);
  assert.match(pagesWorkflow,/--dump-dom/);
  assert.match(pagesWorkflow,/atlas-app/);
  assert.match(pagesWorkflow,/atlas-bootstrap-error/);
});

test('app navigation never hardcodes the site root for graph navigation',()=>{
  assert.doesNotMatch(app,/href=["']\/graphs["']/);
  assert.doesNotMatch(app,/navigate\(["']\/graphs["']\)/);
  assert.match(app,/href=\{routeFor\('graphs',\s*route\.context\)\}/);
  assert.match(app,/navigate\(routeFor\('graphs'\)\)/);
});

test('sidebar systems mirror the GitHub canonical root graph',()=>{
  const block=app.match(/const SYSTEMS\s*=\s*\[(.*?)\]\s*as const;/s)?.[1]||'';
  for(const id of ['system:NEXO','system:SCIENCE','system:ENGINEERING','system:OLYMPUS','system:OPERATIONS'])assert.match(block,new RegExp(id));
  assert.doesNotMatch(block,/system:AUTOMATION/);
  assert.doesNotMatch(block,/system:LEARNING/);
});

test('skip link has a real main landmark target',()=>{
  assert.match(index,/href=["']#atlas-main["']/);
  assert.match(app,/<main\s+id=["']atlas-main["']\s+className=["']atlas-main["']/);
});

test('health types and badge metadata accept the canonical datasource shape',()=>{
  const healthBlock=types.match(/export type HealthPayload\s*=\s*\{[\s\S]*?\n\};/)?.[0]||'';
  assert.match(healthBlock,/source\?:\s*string/);
  assert.match(healthBlock,/sourceVersion\?:\s*string/);
  assert.match(app,/dataSource\?\.effective\s*\|\|\s*state\.health\?\.dataSource\?\.source/);
  assert.match(app,/dataSource\?\.sourceVersion\s*\|\|\s*state\.health\?\.sourceVersion/);
});
