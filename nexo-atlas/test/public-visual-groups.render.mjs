import {build} from 'vite';import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const temp=resolve('.sites-runtime/comparisons-render');await mkdir(temp,{recursive:true});
await writeFile(temp+'/entry.tsx',String.raw`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import assert from 'node:assert/strict';
import PublicResearchHub from '../../src/atlas/ui/PublicResearchHub.tsx';
import ComparisonFigure from '../../src/atlas/ui/ComparisonFigure.tsx';import PublicVisualGallery from '../../src/atlas/ui/PublicVisualGallery.tsx';
import {visualPublicProjection} from '../../worker/public-visuals.mjs';import {cosmologyPublicProjection} from '../../worker/public-cosmology.mjs';import {campaignPublicProjection} from '../../worker/public-campaigns.mjs';import {publicAtlasProjection} from '../../worker/public-tests.mjs';import {publicEditorialProjection} from '../../worker/public-editorial.mjs';
import {groupPublicVisuals} from '../../src/atlas/publicVisualGroups.ts';import {visualLinks} from '../../src/atlas/researchExplorer.ts';
const pub=cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection()))));const visuals=pub.visuals.filter(v=>v.evidenceKind==='SCIENTIFIC_RESULT');const groups=groupPublicVisuals(visuals),links=visualLinks(visuals,{...pub,status:'ready'});let count=0;
for(const locale of ['pt-BR','en']){
 for(const group of groups.filter(g=>g.plot)){
  const html=renderToStaticMarkup(<ComparisonFigure group={group} locale={locale} links={links} headingLevel={3}/>);
  assert.match(html,/nexo-summary-figure/);assert.match(html,/nexo-comparison-heading/);assert.doesNotMatch(html,/nexo-stat-number/);assert.doesNotMatch(html,/NaN|Infinity/);
  assert.equal((html.match(/class="nexo-bar-row"/g)||[]).length,group.members.length);assert.match(html,/aria-pressed="true"/);
  for(const v of group.members){assert.ok(html.includes(links[v.id].href));assert.ok(html.includes(v.publishedAt));assert.ok(html.includes(v.plot.series[0].points[0].y.toLocaleString(locale,{maximumSignificantDigits:21})));}
  count++;
 }
 const hub=renderToStaticMarkup(<PublicResearchHub pub={{...pub,status:'ready'}} locale={locale} checking={false} pending={false} checkedAt={null} refresh={()=>{}} activeTab='figures'/>);assert.match(hub,locale==='en'?/Published figures<\/dt><dd>37<\/dd>/:/Figuras publicadas<\/dt><dd>37<\/dd>/);
 const html=renderToStaticMarkup(<PublicVisualGallery visuals={visuals} locale={locale} links={links}/>);
 assert.match(html,/1–6 \/ 37/);assert.match(html,locale==='en'?/71 source analyses/:/71 análises de origem/);assert.equal((html.match(/<article /g)||[]).length,6);
 const compact=renderToStaticMarkup(<PublicVisualGallery visuals={visuals.slice(0,4)} locale={locale} compact links={links}/>);assert.doesNotMatch(compact,/nexo-comparison-card/);assert.equal((compact.match(/nexo-stat-number/g)||[]).length,4);
}
console.log('Rendered '+count+' bilingual comparison panels plus both full/compact galleries; all source links, dates and values retained.');
`);
await build({configFile:false,logLevel:'warn',build:{ssr:temp+'/entry.tsx',outDir:temp+'/out',rollupOptions:{output:{entryFileNames:'render.mjs'}}}});
await import(pathToFileURL(temp+'/out/render.mjs'));
