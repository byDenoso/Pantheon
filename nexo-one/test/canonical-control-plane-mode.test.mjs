import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildReleaseVercelConfig} from '../scripts/release-config.mjs';

const read=path=>readFile(fileURLToPath(new URL(path,import.meta.url)),'utf8');

test('canonical production mode keeps operational SystemState behind private session',async()=>{
  const [handler,remote,workflow,verify]=await Promise.all([
    read('../server/handler.mjs'),read('../src/data/adapters/remote.ts'),read('../../.github/workflows/nexo-one-production.yml'),read('../scripts/verify-release.mjs')
  ]);
  assert.match(handler,/route==='system'[\s\S]{0,180}if\(!privateAccess\)return send\(\{error:'AUTH_REQUIRED'\},401\)/);
  assert.match(handler,/readSystemInput\(\{env\}\)/);
  assert.match(remote,/credentials:\s*'same-origin'/);
  assert.match(workflow,/NEXO_QA_COOKIE/);
  assert.match(verify,/Authenticated QA session is required|NEXO_QA_COOKIE/);
  assert.doesNotMatch(handler,/PUBLIC_SYSTEM_PROVIDERS/);
});

test('health distinguishes external Vercel channel and dedicated write credential',async()=>{
  const handler=await read('../server/handler.mjs');
  assert.match(handler,/requiredProviders\s*=\s*world\.providers\.filter\(p=>p\.id!==['"]vercel['"]\)/);
  assert.match(handler,/vercel_write:!!env\.VERCEL_WRITE_TOKEN/);
  assert.doesNotMatch(handler,/vercel_write:!!\(env\.VERCEL_WRITE_TOKEN\|\|env\.VERCEL_READ_TOKEN\)/);
});

test('release provenance is an explicit static artifact, not SPA fallback',async()=>{
  const config=buildReleaseVercelConfig({headers:[{headers:[]}]},['index.html','assets/app.js','release-provenance.json']);
  assert.ok(config.builds.some(build=>build.src==='release-provenance.json'&&build.use==='@vercel/static'));
  const packageScript=await read('../scripts/package-release.mjs');
  const verify=await read('../scripts/verify-release.mjs');
  assert.match(packageScript,/release-provenance\.json/);
  assert.match(verify,/release-provenance\.json/);
  assert.match(verify,/NEXO_EXPECTED_SHA/);
});

test('preview and production verification pin readback to an explicit source SHA',async()=>{
  const [preview,production]=await Promise.all([
    read('../../.github/workflows/nexo-one-preview.yml'),read('../../.github/workflows/nexo-one-production.yml')
  ]);
  assert.match(preview,/NEXO_EXPECTED_SHA:\s*\$\{\{\s*inputs\.source_sha\s*\}\}/);
  assert.match(production,/expected_sha:/);
  assert.match(production,/NEXO_EXPECTED_SHA:\s*\$\{\{\s*inputs\.expected_sha\s*\}\}/);
});
