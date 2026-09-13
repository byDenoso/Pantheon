import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../lib/atlas-api.mjs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const client=read('../src/api/client.ts');
const sovereign=read('../lib/sovereign-static-route.mjs');
const pages=read('../../.github/workflows/atlas-pages-fallback.yml');
const systemState=JSON.parse(read('../../NEXO_SYSTEM_STATE.json'));
const authority=JSON.parse(read('../../NEXO_AUTHORITY.json'));

test('Sovereign Core architecture is machine-readable and names only Drive plus GitHub as structural authorities',()=>{
  assert.equal(systemState.architecture,'NEXO_SOVEREIGN_V1');
  assert.equal(systemState.authority.mutableData,'GOOGLE_DRIVE');
  assert.equal(systemState.authority.codeContracts,'GITHUB_MAIN');
  assert.equal(systemState.runtime.frontend,'GITHUB_PAGES');
  assert.equal(systemState.runtime.readApi,'STATIC_LOCAL');
  assert.equal(authority.DATA_MUTABLE,'GOOGLE_DRIVE');
  assert.equal(authority.CODE,'GITHUB_MAIN');
  assert.equal(authority.PRESENTATION,'GITHUB_PAGES');
});

test('active Pages and browser read path does not require retired remote runtimes',()=>{
  assert.doesNotMatch(client,/https?:\/\/[^'"\s]*(?:vercel\.app|neon|supabase|firebase)/i);
  assert.doesNotMatch(client,/window\.fetch\.bind\(window\)/);
  assert.doesNotMatch(pages,/VITE_NEXO_API_BASE_URL/);
  assert.doesNotMatch(pages,/nexo-atlas-control-tower\.vercel\.app\/api/);
});

test('sovereign local router depends only on static projection modules',()=>{
  assert.match(sovereign,/drive-ssot\.mjs/);
  assert.match(sovereign,/drive-github-science\.mjs/);
  assert.doesNotMatch(sovereign,/\.\.\/api\//);
  assert.doesNotMatch(sovereign,/neon|vercel-oidc|database/i);
});

test('science sentinel is usable when global HTTP is unavailable',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('NETWORK_FORBIDDEN')};
  try{
    const api=createApi({profile:'atlas'});
    const graph=await api.graph({focus:'domain:D7',depth:3});
    assert.ok(graph.nodes.some(node=>node.id==='T-ALENS-001'));
    assert.ok(graph.nodes.some(node=>node.id==='result:T-ALENS-001'));
    assert.ok(graph.edges.some(edge=>edge.source==='T-ALENS-001'&&edge.target==='result:T-ALENS-001'&&edge.type==='PRODUCES'));
  }finally{
    globalThis.fetch=originalFetch;
  }
});
