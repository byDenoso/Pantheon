import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const legacyTokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const design=readFileSync(new URL('../src/design/tokens.css',import.meta.url),'utf8');

test('legacy graph palette remains restrained for route-scoped graph rendering',()=>{
 assert.match(legacyTokens,/--bg:#020611/);
 assert.doesNotMatch(legacyTokens,/--accent:#2bc8ff/);
});

test('vNext shell owns one warm neutral design system without legacy galactic overrides',()=>{
 assert.match(main,/\.\/design\/index\.css/);
 for(const legacy of ['premium-v2.css','reference-one.css','galactic-theme.css','official-dashboard.css']) assert.doesNotMatch(main,new RegExp(legacy));
 assert.match(design,/--bg:#f4f2ec/);
 assert.match(design,/--dark:#101410/);
 assert.doesNotMatch(design,/#00e5ff|#00ffff|cyan/i);
});
