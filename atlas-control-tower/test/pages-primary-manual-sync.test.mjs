import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');

test('public Atlas shell has no login/private gate for read-only product areas', async () => {
  const app = await read('src/App.tsx');
  assert.doesNotMatch(app, /LoginPage/);
  assert.doesNotMatch(app, /PrivateGate/);
  assert.doesNotMatch(app, /private:\s*true/);
  assert.match(app, /route\.area === 'lab'\s*&&\s*<LaboratoryPage/);
  assert.match(app, /route\.area === 'atividade'\s*&&\s*<AtividadePage\s*\/>/);
});

test('Atlas frontend has no scheduled Vercel refresh', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.ok(!config.crons?.length, 'manual sync owns Atlas refresh; vercel cron must be absent');
});

test('GitHub Pages is the primary frontend deployment', async () => {
  const pages = await read('../.github/workflows/atlas-pages-fallback.yml');
  const vercel = await read('../.github/workflows/atlas-deploy.yml');
  assert.match(pages, /^name:\s*Atlas Pages Production/m);
  assert.match(pages, /push:\s*\n\s*branches:\s*\[main\]/m);
  assert.doesNotMatch(vercel, /push:\s*\n\s*branches:\s*\[main\]/m);
});

test('NEXO One allows only the public Pages origin for live Atlas public projection', async () => {
  const handler = await read('../nexo-one/server/handler.mjs');
  assert.match(handler, /https:\/\/bydenoso\.github\.io/);
  assert.match(handler, /route === 'atlas-public-ssot'/);
  assert.match(handler, /Access-Control-Allow-Origin/);
});
