import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const tokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
const reference=readFileSync(new URL('../ui/reference-one.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');

test('dark theme uses restrained deep-navy accents instead of neon cyan',()=>{
 assert.match(tokens,/--bg:#020611/);assert.match(tokens,/--accent:#597fc0/);assert.match(tokens,/--cosmic-haze:#10233e/);assert.doesNotMatch(tokens,/--accent:#2bc8ff/);
});

test('approved reference owns the bundled galactic treatment without a competing theme layer',()=>{
 for(const selector of ['observatory-nebula-left','observatory-galaxy-right','observatory-asteroid-field','observatory-horizon-right'])assert.match(reference,new RegExp(selector));
 assert.match(reference,/pointer-events:none/);
 assert.ok(main.indexOf('../ui/premium-v2.css') < main.indexOf('../ui/reference-one.css'));
 assert.equal(frontendFiles.includes('ui/reference-one.css'),true);
 assert.equal(frontendFiles.includes('ui/galactic-theme.css'),false);
 assert.doesNotMatch(main,/galactic-theme\.css/);
});
