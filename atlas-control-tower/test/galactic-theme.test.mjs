import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const tokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
const nextgen=readFileSync(new URL('../nextgen/styles.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const builds=new Set(vercel.builds.map(x=>x.src));

test('dark theme keeps restrained deep-navy system tokens',()=>{
 assert.match(tokens,/--bg:#020611/);assert.match(tokens,/--accent:#597fc0/);assert.match(tokens,/--cosmic-haze:#10233e/);assert.doesNotMatch(tokens,/--accent:#2bc8ff/);
});

test('NextGen owns one responsive cosmic treatment without loading competing legacy layers',()=>{
 assert.match(nextgen,/radial-gradient/);
 assert.match(nextgen,/\.observatory/);
 assert.match(nextgen,/@media\(max-width:720px\)/);
 assert.match(index,/nextgen\/styles\.css/);
 assert.doesNotMatch(index,/premium-v2\.css|reference-one\.css|reference-deck\.css|galactic-theme\.css/);
 assert.equal(frontendFiles.includes('nextgen/styles.css'),true);assert.equal(builds.has('nextgen/styles.css'),true);
 assert.equal(frontendFiles.includes('ui/galactic-theme.css'),false);assert.equal(builds.has('ui/galactic-theme.css'),false);
});
