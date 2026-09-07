import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('highlighted chrome requested for removal is absent from the entrypoint', () => {
  assert.doesNotMatch(index, /FRONTEND OFICIAL/i);
  assert.doesNotMatch(index, /id="provenance"/);
  assert.doesNotMatch(index, /class="sidebar-foot"/);
  assert.doesNotMatch(index, /Estado rastreável/i);
});

test('command center uses direct operational copy without generic contrast disclaimers', () => {
  assert.match(tower, /Prioridades operacionais/);
  assert.doesNotMatch(tower, /O que merece atenção/i);
  assert.doesNotMatch(tower, /NÃO É EVIDÊNCIA CIENTÍFICA/i);
  assert.doesNotMatch(tower, /DERIVED_NOT_EVIDENCE/);
});

test('removing the sidebar status card does not leave a hard dependency on #mcp', () => {
  const app = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\$\('#mcp'\)\.textContent/);
});
