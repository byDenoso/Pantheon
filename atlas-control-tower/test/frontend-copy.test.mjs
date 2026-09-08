import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('approved reference restores its intentional chrome without restoring provenance control', () => {
  assert.match(index, /FRONTEND OFICIAL/i);
  assert.match(index, /class="sidebar-foot reference-trace"/);
  assert.match(index, /Estado rastreável/i);
  assert.doesNotMatch(index, /id="provenance"/);
});

test('command center keeps direct operational copy without generic contrast disclaimers', () => {
  assert.match(tower, /Prioridades/i);
  assert.doesNotMatch(tower, /O que merece atenção/i);
  assert.doesNotMatch(tower, /NÃO É EVIDÊNCIA CIENTÍFICA/i);
  assert.doesNotMatch(tower, /DERIVED_NOT_EVIDENCE/);
});

test('sidebar status card is optional to WebMCP updates', () => {
  const app = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\$\('#mcp'\)\.textContent/);
});
