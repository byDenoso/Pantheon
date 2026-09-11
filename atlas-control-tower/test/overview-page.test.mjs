import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/pages/OverviewPage.tsx',import.meta.url),'utf8');

test('overview is a decision surface backed by resilient source contracts',()=>{
 assert.match(page,/loadOverviewSources/);
 assert.match(page,/buildOverviewModel/);
 for(const label of ['O que mudou','Bloqueios','Estado científico','Proveniência']) assert.match(page,new RegExp(label));
});

test('overview never renders the graph or provider-specific backend labels',()=>{
 assert.doesNotMatch(page,/AtlasCanvas|map-workspace|NEON|DIRECT_NEON|science_v1/);
 assert.match(page,/Fonte indisponível|indisponível/i);
});
