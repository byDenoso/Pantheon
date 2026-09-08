import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const tokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
const reference=readFileSync(new URL('../ui/reference-one.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const builds=new Set(vercel.builds.map(x=>x.src));

test('dark theme uses restrained deep-navy accents instead of neon cyan',()=>{
 assert.match(tokens,/--bg:#020611/);assert.match(tokens,/--accent:#597fc0/);assert.match(tokens,/--cosmic-haze:#10233e/);assert.doesNotMatch(tokens,/--accent:#2bc8ff/);
});

test('approved reference owns the deployed galactic treatment without a competing theme layer',()=>{
 for(const selector of ['observatory-nebula-left','observatory-galaxy-right','observatory-asteroid-field','observatory-horizon-right'])assert.match(reference,new RegExp(selector));
 assert.match(reference,/pointer-events:none/);
 assert.match(index,/premium-v2\.css[^]*reference-one\.css/);
 assert.equal(frontendFiles.includes('ui/reference-one.css'),true);assert.equal(builds.has('ui/reference-one.css'),true);
 assert.equal(frontendFiles.includes('ui/galactic-theme.css'),false);assert.equal(builds.has('ui/galactic-theme.css'),false);
});
