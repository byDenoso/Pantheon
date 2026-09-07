import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const tokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vercel=readFileSync(new URL('../vercel.json',import.meta.url),'utf8');
const themeUrl=new URL('../ui/galactic-theme.css',import.meta.url);

test('dark theme uses restrained deep-navy accents instead of neon cyan',()=>{
  assert.match(tokens,/--bg:#020611/);
  assert.match(tokens,/--accent:#597fc0/);
  assert.match(tokens,/--cosmic-haze:#10233e/);
  assert.doesNotMatch(tokens,/--accent:#2bc8ff/);
});

test('galactic layer is a deployed public override loaded after the existing theme',()=>{
  assert.equal(existsSync(themeUrl),true,'galactic-theme.css must exist');
  const css=readFileSync(themeUrl,'utf8');
  assert.match(css,/body::before/);
  assert.match(css,/graph-stage::after/);
  assert.match(css,/command-center::after/);
  assert.match(css,/rgba\(89,127,192/);
  assert.match(index,/premium-v2\.css[^]*control-tower\.css[^]*galactic-theme\.css/);
  assert.equal(frontendFiles.includes('ui/galactic-theme.css'),true);
  assert.match(vercel,/"src": "ui\/galactic-theme\.css"/);
});
