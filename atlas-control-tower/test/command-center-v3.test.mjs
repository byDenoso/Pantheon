import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shellCss = fs.readFileSync(new URL('../ui/reference-one.css', import.meta.url), 'utf8');
const deckCss = fs.readFileSync(new URL('../ui/reference-deck.css', import.meta.url), 'utf8');
const css = shellCss + deckCss;
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('approved command-center UX uses the new navigation rail and hero shell', () => {
  for (const label of ['Visão Global','Galáxias','Ciência','Engineering','Olympus','Learning','Black Box','Pessoas','Ideias','Dados','Relatórios']) {
    assert.match(index, new RegExp(`>${label}<|>${label}</span>`));
  }
  assert.match(index, /Conectamos ciência, pessoas e tecnologia/);
  assert.match(index, /reference-hero-stats/);
  assert.match(index, /reference-explore-card/);
  assert.doesNotMatch(index, /FRONTEND OFICIAL|reference-cosmos-index|reference-quote/);
});

test('new spatial shell removes the giant procedural planet and keeps a clean graph center', () => {
  assert.match(css, /--reference-sidebar-width:124px/);
  assert.match(css, /\.reference-space\{[^}]*background-image:url\('\/assets\/atlas-observatory-bg\.svg'\)/s);
  assert.match(css, /background-position:center/);
  assert.doesNotMatch(css, /\.observatory-asteroid-field|\.observatory-horizon-right/);
  assert.match(css, /\.reference-hero-copy\{[^}]*width:min\(34%/s);
  assert.match(css, /\.reference-graph-zone\{[^}]*left:36%/s);
});

test('operational deck renders a strong status ring and readable action rows', () => {
  assert.match(tower, /ct-status-ring/);
  assert.match(tower, /ct-system-list/);
  assert.match(tower, /ct-action-state/);
  assert.match(tower, /Ver todos os blockers/);
  assert.match(tower, /Ver histórico/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,1\.2fr\) minmax\(0,1\.15fr\) minmax\(0,1fr\) minmax\(0,1fr\)/);
});
