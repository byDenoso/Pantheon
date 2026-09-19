import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const read = path => readFile(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('NEXO ONE exposes SystemState in public read-only mode without a private-session gate', async () => {
  const handler = await read('../server/handler.mjs');
  assert.doesNotMatch(handler, /if\(!privateAccess\)return send\(\{error:'AUTH_REQUIRED'\},401\)[\s\S]{0,600}route==='system'/);
  assert.match(handler, /route==='system'/);
  assert.match(handler, /access:'PUBLIC'/);
  assert.match(handler, /req\.method!=='GET'\)return send\(\{error:'WRITES_DISABLED'\},405\)/);
});

test('public SystemState never reads private ACTION_REGISTER surfaces directly', async () => {
  const handler = await read('../server/handler.mjs');
  assert.doesNotMatch(handler, /route==='system'[\s\S]{0,1200}readSystemInput\(\{env\}\)/);
  assert.match(handler, /truthGraphInput\?\.capabilityRows/);
});

test('release acceptance is public and does not require a QA session cookie', async () => {
  const release = await read('../scripts/verify-release.mjs');
  assert.doesNotMatch(release, /NEXO_QA_COOKIE|Authenticated QA session|access!=='PRIVATE'/);
  assert.match(release, /read\('\/api\/system'\)/);
  assert.match(release, /publicBoundary:'pass'/);
});

test('frontend remote adapter keeps public SystemState independent from a private session', async () => {
  const remote = await read('../src/data/adapters/remote.ts');
  assert.doesNotMatch(remote, /credentials:\s*'same-origin'[\s\S]{0,300}\/api\/system/);
});

test('production promotion workflow has no runtime-login dependency', async () => {
  const workflow = await read('../../.github/workflows/nexo-one-pages.yml');
  assert.doesNotMatch(workflow, /NEXO_QA_COOKIE/);
});

test('private session support is bounded to session state while public SystemState stays explicit', async () => {
  const handler = await read('../server/handler.mjs');
  const example = await read('../.env.example');
  assert.match(handler, /sessionAccess\(req,env,now\)/);
  assert.match(handler, /route==='session'/);
  assert.match(handler, /const options=\{now,access:'PUBLIC',env,force\}/);
  assert.match(example, /NEXO_PASSWORD_HASH/);
  assert.match(example, /NEXO_SESSION_SECRET/);
});
