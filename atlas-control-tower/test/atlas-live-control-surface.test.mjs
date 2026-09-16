import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=path=>readFileSync(resolve(here,'..',path),'utf8');

test('activity drawer reads live Tower API instead of public snapshot placeholders',()=>{
  const source=read('src/components/shell/ActivityDrawer.tsx');
  assert.match(source,/\/api\/live\/activity/);
  assert.doesNotMatch(source,/PublicSnapshotSource/);
  assert.doesNotMatch(source,/snapshot público atual/i);
  assert.doesNotMatch(source,/índice de busca público/i);
});

test('live activity endpoint reads canonical Tower entities and indexes',()=>{
  const source=read('api/live/activity.mjs');
  assert.match(source,/createTowerGithubGateway/);
  assert.match(source,/listJsonDirectory\(['"]entities\/test['"]\)/);
  assert.match(source,/readActiveWorkIndex/);
  assert.match(source,/readInterdomainIndex/);
});

test('private semantic command endpoint is authenticated and never accepts generic patch commands',()=>{
  const source=read('api/private/semantic.mjs');
  assert.match(source,/withGoogleAuth/);
  assert.match(source,/createNexoSemanticGateway/);
  assert.match(source,/ALLOWED_COMMANDS/);
  assert.doesNotMatch(source,/patch_json|write_entity/i);
});

test('login page performs real Google Identity sign-in instead of redirecting to public cockpit',()=>{
  const source=read('src/pages/LoginPage.tsx');
  assert.match(source,/accounts\.google\.com\/gsi\/client/);
  assert.match(source,/VITE_GOOGLE_CLIENT_ID/);
  assert.match(source,/storeGoogleCredential/);
  assert.doesNotMatch(source,/Abrindo o Cockpit público/);
});

test('App restores a browser session rather than forcing session null',()=>{
  const source=read('src/App.tsx');
  assert.match(source,/readStoredGoogleSession/);
  assert.doesNotMatch(source,/const session = null/);
});
