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

test('canonical architecture is machine-readable and keeps TOWER_V06 as the sole operational truth owner',()=>{
  assert.equal(systemState.architecture,'NEXO_TOWER_ATLAS_V3');
  assert.equal(systemState.authority.operationalTruth,'TOWER_V06');
  assert.equal(systemState.authority.truthOwner,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
  assert.equal(systemState.authority.writeModel,'GITHUB_CAS_ENTITY_EVENT');
  assert.equal(systemState.authority.codeContracts,'GITHUB_MAIN');
  assert.equal(systemState.authority.projection,'ATLAS_PROJECTION_V3');
  assert.equal(systemState.runtime.frontend,'GITHUB_PAGES');
  assert.equal(systemState.runtime.readModel,'ATLAS_DATA_SDK_V3');
  assert.equal(systemState.projection.projectionOnly,true);
  assert.equal(authority.OPERATIONAL_TRUTH,'TOWER_V06');
  assert.equal(authority.TRUTH_OWNER,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
  assert.equal(authority.GOOGLE_DRIVE,'EVIDENCE_ARTIFACT_DATASET_LEGACY_PROJECTION_ONLY');
  assert.equal(authority.ATLAS,'READ_ONLY_PROJECTION');
  assert.equal(authority.CODE,'GITHUB_MAIN');
  assert.equal(authority.PRESENTATION,'GITHUB_PAGES');
});

test('active Pages and browser read path does not require retired remote runtimes',()=>{
  assert.doesNotMatch(client,/https?:\/\/[^'"\s]*(?:vercel\.app|neon|supabase|firebase)/i);
  assert.doesNotMatch(client,/window\.fetch\.bind\(window\)/);
  assert.doesNotMatch(pages,/VITE_NEXO_API_BASE_URL/);
  assert.doesNotMatch(pages,/nexo-atlas-control-tower\.vercel\.app\/api/);
});

test('sovereign local router keeps legacy static compatibility isolated from remote retired runtimes',()=>{
  assert.match(sovereign,/drive-ssot\.mjs/);
  assert.match(sovereign,/drive-github-science\.mjs/);
  assert.doesNotMatch(sovereign,/\.\.\/api\//);
  assert.doesNotMatch(sovereign,/neon|vercel-oidc|database/i);
});

test('science campaign sentinel is usable when global HTTP is unavailable',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('NETWORK_FORBIDDEN')};
  try{
    const api=createApi({profile:'atlas'});
    const graph=await api.graph({focus:'domain:D7',depth:3});
    assert.ok(graph.nodes.some(node=>node.id==='CAMP-CMB-ANOMALIES'&&node.type==='CAMPAIGN'));
    assert.equal(graph.nodes.some(node=>node.type==='TEST'||node.type==='RESULT'),false);
    assert.equal(graph.truncated,false);
  }finally{
    globalThis.fetch=originalFetch;
  }
});
