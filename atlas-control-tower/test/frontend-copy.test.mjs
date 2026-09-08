import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('approved reference restores its intentional chrome without restoring provenance control', () => {
  assert.match(app, /FRONTEND OFICIAL/i);
  assert.match(app, /sidebar-foot reference-trace/);
  assert.match(app, /Estado rastreável/i);
  assert.doesNotMatch(app, /id="provenance"/);
});

test('command center keeps direct operational copy without generic contrast disclaimers', () => {
  assert.match(tower, /Prioridades/i);
  assert.doesNotMatch(tower, /O que merece atenção/i);
  assert.doesNotMatch(tower, /NÃO É EVIDÊNCIA CIENTÍFICA/i);
});

test('React shell names the renderer without leaking runtime credentials', () => {
  assert.match(app, /React · R3F · WebGPU/);
  assert.doesNotMatch(app, /scGpF8x9|VERCEL_OIDC_TOKEN|Authorization:\s*Bearer/);
});
