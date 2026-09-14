import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');

test('read-only Atlas surfaces no longer block on authentication', async () => {
  const gate = await read('src/components/PrivateGate.tsx');
  const login = await read('src/pages/LoginPage.tsx');
  assert.match(gate, /return <>{children}<\/>/);
  assert.doesNotMatch(gate, /AUTH_SETUP_REQUIRED|Acesso à área restrito/);
  assert.doesNotMatch(login, /AUTH_SETUP_REQUIRED|GOOGLE_CLIENT_ID|NEXO_ALLOWED_EMAILS/);
  assert.match(login, /routeFor\('cockpit'\)/);
});

test('Atlas frontend has no scheduled Vercel refresh', async () => {
  const config = JSON.parse(await read('vercel.json'));
  assert.ok(!config.crons?.length, 'manual sync owns Atlas refresh; vercel cron must be absent');
});

test('GitHub Pages deploys the production-grade static Atlas on main', async () => {
  const pages = await read('../.github/workflows/atlas-pages-fallback.yml');
  assert.match(pages, /push:\s*\n\s*branches:\s*\[main\]/m);
  assert.match(pages, /actions\/deploy-pages@v4/);
  assert.match(pages, /PAGES_STATIC_STATE_READBACK_OK/);
});

test('NEXO One allows the public Pages origin only on sanitized public Atlas routes', async () => {
  const handler = await read('../nexo-one/server/handler.mjs');
  assert.match(handler, /https:\/\/bydenoso\.github\.io/);
  assert.match(handler, /route==='atlas-public-ssot'/);
  assert.match(handler, /Access-Control-Allow-Origin/);
  assert.match(handler, /GET,OPTIONS/);
});
