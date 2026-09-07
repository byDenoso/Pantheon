import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../ui/reference-one.css', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('reference-one layout reproduces the approved hero composition', () => {
  assert.match(index, /class="reference-one"/);
  assert.match(index, /Ideias em órbita\./);
  assert.match(index, /Descobertas em rede\./);
  assert.match(index, /GALÁXIAS/);
  assert.match(index, /DADOS/);
  assert.match(index, /PESSOAS/);
  assert.match(index, /IMPACTO/);
  assert.match(index, /observatory-galaxy-right/);
  assert.match(index, /observatory-asteroid-field/);
  assert.match(index, /observatory-horizon-right/);
});

test('approved reference keeps the exact lower console taxonomy', () => {
  for (const label of ['Status operacional','Prioridades','Atividade recente','Blockers','Readback']) {
    assert.match(tower, new RegExp(label, 'i'));
  }
  assert.match(tower, /ct-reference-grid/);
  assert.match(tower, /ct-readback-console/);
});

test('reference wallpaper is structural, not a neon recolor', () => {
  assert.match(css, /\.observatory-galaxy-right/);
  assert.match(css, /\.observatory-asteroid-field/);
  assert.match(css, /\.observatory-horizon-right/);
  assert.match(css, /\.reference-visualization-bar/);
  assert.match(css, /grid-template-columns:\s*1\.05fr\s+1\.15fr\s+1\.45fr\s+1\.25fr\s+\.9fr/);
  assert.doesNotMatch(css, /#00e5ff|#00ffff|cyan/i);
});
