import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../ui/reference-one.css', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('reference-one layout reproduces the approved hero composition', () => {
 for(const pattern of [/class="reference-one"/,/Ideias em órbita\./,/Descobertas em rede\./,/GALÁXIAS/,/DADOS/,/PESSOAS/,/IMPACTO/,/observatory-galaxy-right/,/observatory-asteroid-field/,/observatory-horizon-right/])assert.match(index,pattern);
});

test('approved reference keeps the exact lower console taxonomy', () => {
 for (const label of ['Status operacional','Prioridades','Atividade recente','Blockers','Readback']) assert.match(tower,new RegExp(label,'i'));
 assert.match(tower,/ct-reference-grid/);assert.match(tower,/ct-readback-console/);
});

test('reference wallpaper is structural and the console deck reflows before compression', () => {
 assert.match(css,/\.observatory-galaxy-right/);assert.match(css,/\.observatory-asteroid-field/);assert.match(css,/\.observatory-horizon-right/);assert.match(css,/\.reference-visualization-bar/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1600px\)[^]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:1366px\)[^]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/#00e5ff|#00ffff|cyan/i);
});
