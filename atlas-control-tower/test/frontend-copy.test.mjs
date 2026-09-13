import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const graphs = fs.readFileSync(new URL('../src/pages/graphs-page.tsx', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/app/AppShell.tsx', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('vNext shell identifies Atlas as a read-only projection without naming a provider', () => {
  assert.match(shell, /projeção somente leitura/i);
  assert.doesNotMatch(shell, /NEON|Truth Owners no Neon/i);
  assert.doesNotMatch(app + shell, /id="provenance"|VERCEL_OIDC_TOKEN|Authorization:\s*Bearer/);
});

test('command center keeps direct operational copy without generic contrast disclaimers', () => {
  assert.match(tower, /Prioridades/i);
  assert.doesNotMatch(tower, /O que merece atenção/i);
  assert.doesNotMatch(tower, /NÃO É EVIDÊNCIA CIENTÍFICA/i);
});

test('graph renderer is route-scoped instead of leaking into the root shell', () => {
  assert.doesNotMatch(app, /from ['"]\.\/scene\/AtlasCanvas|<AtlasCanvas|<Canvas|GraphRenderer/);
  assert.match(app, /GraphsPage/);
  assert.match(graphs, /<GraphRenderer/);
  assert.doesNotMatch(graphs, /<AtlasCanvas/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/atlas-pages'\)/);
});