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

test('approved reference owns one image-backed spatial treatment without competing theme layers',()=>{
 assert.match(reference,/atlas-observatory-bg\.svg/);
 assert.match(reference,/reference-space[^}]*pointer-events:none/s);
 assert.doesNotMatch(reference,/observatory-asteroid-field|observatory-horizon-right/);
 assert.match(index,/premium-v2\.css[^]*reference-one\.css[^]*reference-deck\.css/);
 assert.equal(frontendFiles.includes('ui/reference-one.css'),true);assert.equal(builds.has('ui/reference-one.css'),true);assert.equal(frontendFiles.includes('ui/reference-deck.css'),true);assert.equal(builds.has('ui/reference-deck.css'),true);
 assert.equal(frontendFiles.includes('assets/atlas-observatory-bg.svg'),true);assert.equal(builds.has('assets/atlas-observatory-bg.svg'),true);
 assert.equal(frontendFiles.includes('ui/galactic-theme.css'),false);assert.equal(builds.has('ui/galactic-theme.css'),false);
});
