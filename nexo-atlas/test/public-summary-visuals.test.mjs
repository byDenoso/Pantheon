import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../worker/public-summary-visuals.json' with {type:'json'};
import {summaryVisualProjection} from '../worker/public-summary-visuals.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {publicationKey} from '../worker/public-publication.mjs';
import {loadPublic} from '../src/atlas/publicItems.ts';
import {guardVisual} from '../src/atlas/publicVisuals.ts';
const publicData=publicEditorialProjection(publicAtlasProjection());
test('summary figures use exact published sources and never invent approval receipts',()=>{
 const result=summaryVisualProjection(publicData);
 assert.equal(result.tests,publicData.tests);
 assert.ok(result.visuals.length>50);
 assert.equal(new Set(result.visuals.map(v=>v.id)).size,result.visuals.length);
 for(const v of result.visuals){assert.ok(guardVisual(v));assert.equal(v.presentation,'PUBLISHED_SUMMARY');assert.equal(v.plot.style,'scatter');assert.ok(!('approvals' in v));assert.ok(v.limitations.length);}
 for(const entry of catalog.records)assert.ok(publicData.tests.some(t=>publicationKey(t)===entry.sourceKey));
});
test('source revision changes and removals retire derived visuals',()=>{
 const result=summaryVisualProjection({...publicData,tests:[]});assert.equal(result.visuals.length,0);
 const t=publicData.tests.find(t=>catalog.records.some(r=>r.sourceKey===publicationKey(t)));
 const valid=summaryVisualProjection({...publicData,tests:[t]});assert.ok(valid.visuals.length);
 const changed={...t,result:{...t.result,en:t.result.en+' Revised.'}};
 assert.equal(summaryVisualProjection({...publicData,tests:[changed]}).visuals.length,0);
});
test('full public response survives client guards with every plotted value intact',async()=>{
 const result=summaryVisualProjection(publicData);const loaded=await loadPublic(async()=>Response.json(result));
 assert.equal(loaded.status,'ready');assert.equal(loaded.tests.length,215);assert.deepEqual(loaded.visuals,result.visuals);
});
