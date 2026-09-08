import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shellCss = fs.readFileSync(new URL('../ui/reference-one.css', import.meta.url), 'utf8');
const deckCss = fs.readFileSync(new URL('../ui/reference-deck.css', import.meta.url), 'utf8');
const css = shellCss + deckCss;
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('reference-one layout reproduces the approved command-center composition', () => {
 // The approved composition survives the rework; only the hero copy changed,
 // from a marketing line to the header of a command centre.
 for(const pattern of [/class=\"reference-one\"/,/Ciência, execução e integridade/,/na mesma leitura\./,/O Atlas é projeção: a verdade continua nos truth owners/,/reference-hero-stats/,/reference-graph-zone/,/reference-explore-card/])assert.match(index,pattern);
 assert.doesNotMatch(index,/FRONTEND OFICIAL|reference-cosmos-index|reference-quote/);
});

test('approved reference keeps the operational console taxonomy with stronger status hierarchy', () => {
 for (const label of ['Status operacional','Prioridades','Atividade recente','Blockers','Readback']) assert.match(tower,new RegExp(label,'i'));
 assert.match(tower,/ct-reference-grid/);assert.match(tower,/ct-status-ring/);assert.match(tower,/ct-system-list/);
});

test('reference wallpaper is an image-backed clean field and deck reflows before compression', () => {
 assert.match(css,/atlas-observatory-bg\.svg/);assert.match(css,/reference-graph-zone/);assert.doesNotMatch(css,/observatory-asteroid-field|observatory-horizon-right/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.05fr\)/);
 assert.match(css,/@media\(max-width:1600px\)/);
 assert.match(css,/@media\(max-width:1366px\)/);
 assert.doesNotMatch(css,/#00e5ff|#00ffff|cyan/i);
});
