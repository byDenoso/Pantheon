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

test('live activity endpoint reads canonical Tower entities and tolerates absent optional indexes',()=>{
  const source=read('api/live/activity.mjs');
  assert.match(source,/createTowerGithubGateway/);
  assert.match(source,/listJsonDirectory\(['"]entities\/test['"]\)/);
  assert.match(source,/readJson\(['"]indexes\/active-work\.json['"]\)/);
  assert.match(source,/readJson\(['"]indexes\/interdomain-active\.json['"]\)/);
  assert.match(source,/availability/);
});

test('live and semantic routes reuse existing Vercel functions instead of increasing Hobby function count',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.builds.filter(item=>item.use==='@vercel/node').length,12);
  assert.ok(config.routes.some(route=>route.src==='/api/live/activity'&&String(route.dest).includes('runtime-orphans')));
  assert.ok(config.routes.some(route=>route.src==='/api/private/semantic'&&String(route.dest).includes('private/index')));
});

test('private semantic command endpoint is authenticated and never accepts generic patch commands',()=>{
  const source=read('api/private/semantic.mjs');
  assert.match(source,/withGoogleAuth/);
  assert.match(source,/createNexoSemanticGateway/);
  assert.match(source,/ALLOWED_COMMANDS/);
  assert.doesNotMatch(source,/patch_json|write_entity/i);
});

test('login page performs real Google Identity sign-in with client configuration loaded from the server',()=>{
  const source=read('src/pages/LoginPage.tsx');
  assert.match(source,/accounts\.google\.com\/gsi\/client/);
  assert.match(source,/\/api\/auth\/session/);
  assert.match(source,/storeGoogleCredential/);
  assert.doesNotMatch(source,/VITE_GOOGLE_CLIENT_ID/);
  assert.doesNotMatch(source,/Abrindo o Cockpit público/);
});

test('private gate restores a stored browser session instead of remaining a no-op',()=>{
  const source=read('src/components/PrivateGate.tsx');
  assert.match(source,/readStoredGoogleSession/);
  assert.match(source,/Entrar no Atlas/);
});

test('Atividade exposes an explicit authenticated create-work operation',()=>{
  const source=read('src/pages/AtividadePage.tsx');
  assert.match(source,/semanticCommand\(['"]nexo\.create_work['"]/);
  assert.match(source,/Criar WORK/);
});
