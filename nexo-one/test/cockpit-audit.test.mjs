import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('views have stable hash deep links and browser history restoration', async () => {
  const navigation = await text('src/app/navigation.ts');
  const app = await text('src/app/App.tsx');

  assert.match(navigation, /export const viewFromHash/);
  assert.match(navigation, /export const hashForView/);
  assert.match(app, /hashchange/);
  assert.match(app, /history\.replaceState/);
});

test('static Pages sends private access to the private cockpit instead of a dead local session endpoint', async () => {
  const app = await text('src/app/App.tsx');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(app, /VITE_PRIVATE_COCKPIT_URL/);
  assert.match(workflow, /VITE_PRIVATE_COCKPIT_URL:\s*https:\/\/nexo-one-two\.vercel\.app/);
});

test('personal plane exposes a per-provider connection center', async () => {
  const personal = await text('src/features/PersonalCockpit.tsx');

  assert.match(personal, /connection-center/);
  assert.match(personal, /lastSuccessAt/);
  assert.match(personal, /checkedAt/);
  assert.match(personal, /Sincronizar agora/);
});

test('overview makes source coverage explicit so zero counters cannot masquerade as health', async () => {
  const overview = await text('src/features/system/Overview.tsx');

  assert.match(overview, /Cobertura/);
  assert.match(overview, /MISSING_PROVIDER/);
});

test('empty Learning and Execution states explain the next operational path', async () => {
  const atlas = await text('src/features/system/Atlas.tsx');
  const operations = await text('src/features/system/Operations.tsx');

  assert.match(atlas, /Ver fontes/);
  assert.match(atlas, /Ver Execution/);
  assert.match(operations, /ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK/);
});
