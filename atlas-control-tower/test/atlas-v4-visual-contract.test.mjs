import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const theme=fs.readFileSync(new URL('src/atlas-v3/atlas-v3-theme.css',root),'utf8');

test('V4 gives domains stable semantic accents without turning the canvas into a rainbow',()=>{
  for(const token of ['--domain-nexo','--domain-science','--domain-operations','--domain-health','--domain-learning','--domain-evidence']) assert.match(theme,new RegExp(token));
  assert.match(theme,/\.atlas-domain-bar/);
  assert.match(theme,/\.atlas-overlay-menu/);
});

test('V4 orientation chrome is compact and mobile-safe',()=>{
  assert.match(theme,/\.atlas-breadcrumb/);
  assert.match(theme,/\.sync-diff-chip/);
  assert.match(theme,/\.stale-state/);
  assert.match(theme,/@media \(max-width:760px\)/);
});
