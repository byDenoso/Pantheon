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
  assert.match(app, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
});

test('static Pages sends private access to the private cockpit instead of a dead local session endpoint', async () => {
  const app = await text('src/app/App.tsx');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(app, /VITE_PRIVATE_COCKPIT_URL/);
  assert.match(workflow, /VITE_PRIVATE_COCKPIT_URL:\s*https:\/\/nexo-one-two\.vercel\.app/);
});

test('mobile keeps the private session control visible', async () => {
  const app = await text('src/app/App.tsx');
  const layout = await text('src/styles/layout.css');

  assert.match(app, /ACESSO PRIVADO/);
  assert.doesNotMatch(layout, /\.avatar\{display:none!important\}/);
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

test('Actions shows projected Tower WORK when executable ActionRecords are intentionally absent', async () => {
  const operations = await text('src/features/system/Operations.tsx');
  const styles = await text('src/styles/system.css');
  assert.match(operations, /node\.type === 'ACTION'/);
  assert.match(operations, /WORK na projeção da Tower/);
  assert.match(operations, /Nenhuma autonomia comprovada/);
  assert.match(operations, /ActionRecord → capability → runtime/);
  assert.match(operations, /PROJECTED_WORK_PAGE = 40/);
  assert.match(styles, /\.work-projection-note/);
  assert.match(styles, /\.work-queue/);
  assert.match(styles, /\.work-human-chip/);
});

test('empty Execution state explains the next operational path', async () => {
  const operations = await text('src/features/system/Operations.tsx');
  assert.match(operations, /ACTION → CAPABILITY → RUNTIME → EFFECT → READBACK/);
});
