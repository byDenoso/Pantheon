import test from 'node:test';
import assert from 'node:assert/strict';
import {visualPublicProjection} from '../worker/public-visuals.mjs';
import {cosmologyPublicProjection} from '../worker/public-cosmology.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {createWorker} from '../worker/index.mjs';
import {loadPublic} from '../src/atlas/publicItems.ts';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {guardVisual} from '../src/atlas/publicVisuals.ts';
import {visualLinks} from '../src/atlas/researchExplorer.ts';
import {groupPublicVisuals,filterVisualGroups,visualAnalysisCount,comparisonCsv,comparisonProvenance,comparisonRevision} from '../src/atlas/publicVisualGroups.ts';
import catalog from '../src/atlas/publicVisualComparisons.json' with {type:'json'};
const pub=cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection()))));
const visuals=pub.visuals.filter(v=>v.evidenceKind==='SCIENTIFIC_RESULT');
const groups=groupPublicVisuals(visuals),byId=new Map(visuals.map(v=>[v.id,v]));
const links=visualLinks(visuals,{...pub,status:'ready'});

test('37 presentation figures retain all 72 public visuals and 71 source analyses exactly once',()=>{
 assert.equal(visuals.length,72);assert.equal(groups.length,37);assert.equal(visualAnalysisCount(visuals),71);
 const members=groups.flatMap(g=>g.members);assert.equal(members.length,72);assert.equal(new Set(members.map(v=>v.id)).size,72);
 assert.deepEqual([...members].sort((a,b)=>a.id.localeCompare(b.id)),[...visuals].sort((a,b)=>a.id.localeCompare(b.id)));
 for(const g of groups){assert.ok(g.members.length<=8);for(const v of g.members)assert.equal(v,byId.get(v.id));if(!g.plot)continue;
  assert.equal(g.plot.style,'scatter');assert.equal(g.plot.series.length,g.members.length);
  for(const [i,v] of g.members.entries()){const displayed=g.plot.series[i].points[0],original=v.plot.series[0].points[0];assert.deepEqual({...displayed,x:original.x},original);assert.equal(displayed.x,i+1);assert.equal(original.x,1);assert.equal(g.plot.series[i].id,v.id);assert.deepEqual(g.plot.series[i].label,g.configurations[v.id]);assert.deepEqual(v.plot.y,g.plot.y);}
 }
 assert.equal(catalog.groups.length,15);assert.equal(new Set(catalog.groups.flatMap(g=>g.members.map(m=>m.id))).size,catalog.groups.flatMap(g=>g.members).length);
});

test('assignment is bound to the complete public revision; every mismatch stays separate',()=>{
 const baseline=visuals[0],sibling=visuals[1];
 const mutations=[v=>v.plot.y.unit='σ',v=>delete v.plot.y,v=>delete v.plot.y.unit,v=>v.plot.y.label.en='Probability',v=>v.plot.x.unit='Mpc',v=>v.plot.style='line',v=>v.subject.question.en=v.subject.question.en.replace('0.3 ± 0.01','0.5 ± 0.1'),v=>v.subject.method.en+=' Another model.',v=>v.subject.answers.en+=' Different scope.',v=>v.subject.result.en+=' Revised.',v=>v.caption.en+=' Revised.',v=>v.limitations[0].en+=' Revised.',v=>v.sources[0].url='https://example.org/revised',v=>v.plot.series[0].points[0].y=95,v=>v.id='new-unknown-record'];
 for(const change of mutations){const altered=structuredClone(baseline);change(altered);assert.notEqual(comparisonRevision(altered),comparisonRevision(baseline));const result=groupPublicVisuals([altered,sibling]);assert.equal(result.length,2);for(const g of result){assert.equal(g.members.length,1);assert.equal(g.caption,null);assert.equal(g.plot,undefined);assert.deepEqual(g.configurations,{});assert.deepEqual(g.title,g.members[0].title);}}
 const malformed=structuredClone(baseline);delete malformed.plot.y;assert.equal(guardVisual(malformed),null);
 assert.equal(groupPublicVisuals([baseline])[0].id,baseline.id);
});

test('unknown priors, metric differences, method families and unknown releases never combine',()=>{
 for(const index of [18,19,20,21,25,26,30,31,40,48,52,53,54,63,64,65,66,67,68,69,70,71])assert.equal(groups.find(g=>g.members.includes(visuals[index])).members.length,1,`index ${index}`);
 assert.notEqual(groups.find(g=>g.members.includes(visuals[0])).id,groups.find(g=>g.members.includes(visuals[22])).id);
 const partitions=catalog.groups.filter(g=>g.id.startsWith('sn-partition'));
 for(const g of partitions){const bins=new Set(g.members.map(m=>m.configuration.en.match(/ · z: (.*?)(?: ·|$)/)[1]));assert.equal(bins.size,1);}
 for(const g of catalog.groups.filter(g=>g.id.startsWith('sn-'))){assert.match(g.caption.en,/denominators are not provided in these public summaries/);for(const m of g.members){assert.match(m.configuration.en,/Ωm =/);assert.match(m.configuration.en,/ · z: /);assert.match(m.configuration.en,/remove z =/);}}
 for(const index of [43,45,47])assert.match(groups.find(g=>g.members.includes(visuals[index])).configurations[visuals[index].id].en,/same-design repeat/);
});

test('all source members remain searchable in both locales, with complete comparison context',()=>{
 for(const locale of ['pt-BR','en'])for(const v of visuals){const found=filterVisualGroups(groups,v.subject.question[locale],'',locale);assert.ok(found.some(g=>g.members.includes(v)),v.id);}
 const found=filterVisualGroups(groups,'0.33 ± 0.01','','en');assert.ok(found.some(g=>g.members.length>1));assert.ok(found.every(g=>g.members.some(v=>v.subject.question.en.includes('0.33 ± 0.01'))));
 assert.equal(filterVisualGroups(groups,'impossible non-existent phrase','','en').length,0);
 assert.equal(filterVisualGroups(groups,'','SOFTWARE_VALIDATION','en').length,0);
 assert.deepEqual(groupPublicVisuals(visuals,true).map(g=>g.members[0]),visuals);
 assert.ok(groupPublicVisuals(visuals,true).every(g=>g.members.length===1&&!g.plot));
});

test('provenance exports contain unchanged originals, configurations, captions and mapped sources',()=>{
 for(const g of groups.filter(g=>g.plot))for(const locale of ['pt-BR','en']){
  const metadata=JSON.parse(comparisonProvenance(g,links));assert.deepEqual(metadata.originalVisuals,g.members);assert.deepEqual(metadata.configurations,g.configurations);
  const csv=comparisonCsv(g,locale,links);assert.match(csv,/original_x/);assert.match(csv,/display_category/);assert.match(csv,/comparison_qualification/);
  for(const v of g.members){assert.ok(csv.includes(v.id));assert.ok(csv.includes(v.sources[0].url));assert.ok(csv.includes(links[v.id].href));assert.deepEqual(metadata.sourceInvestigations[v.id],links[v.id]);assert.ok(csv.includes(g.configurations[v.id][locale]));}
 }
 const reordered=groupPublicVisuals([...visuals].reverse());assert.deepEqual(new Set(reordered.flatMap(g=>g.members.map(v=>JSON.stringify(v)))),new Set(visuals.map(v=>JSON.stringify(v))));
 const newer=structuredClone(visuals[71]);newer.publishedAt='2026-10-09T17:00:00.000Z';assert.equal(groupPublicVisuals([visuals[0],newer,visuals[1]])[0].members[0],newer);
});

test('actual worker API and final client guards activate the same reviewed comparisons',async()=>{const response=await createWorker().fetch(new Request('https://nexoresearch.org/api/atlas-public'),{});assert.equal(response.status,200);const body=await response.json();const loaded=await loadPublic(async()=>Response.json(body));assert.equal(loaded.status,'ready');assert.equal(loaded.tests.length,169);assert.equal(loaded.visuals.length,72);assert.deepEqual(loaded.visuals,pub.visuals);assert.equal(groupPublicVisuals(loaded.visuals).length,37);});
