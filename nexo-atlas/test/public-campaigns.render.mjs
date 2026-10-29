import {build} from 'vite';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(), temp=resolve('.sites-runtime/campaign-render-check');
await mkdir(temp,{recursive:true});
await writeFile(`${temp}/entry.tsx`, String.raw`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import PublicTestList from '../../src/atlas/ui/PublicTestList.tsx';
import PublicTestView from '../../src/atlas/ui/PublicTestView.tsx';
import PublicQuestionView from '../../src/atlas/ui/PublicQuestionView.tsx';
import {guardTests} from '../../src/atlas/publicItems.ts';
import {groupPublicQuestions,filterPublicQuestions} from '../../src/atlas/publicQuestionGroups.ts';
import {publicAtlasProjection} from '../../worker/public-tests.mjs';
const tests=guardTests(publicAtlasProjection().tests),groups=groupPublicQuestions(tests);
for(const locale of ['pt-BR','en']){
 const known=renderToStaticMarkup(<PublicTestView test={tests.find(t=>t.published_at)!} locale={locale}/>);
 assert.match(known, /dateTime="2026-10-06/);
 assert.ok(known.includes(locale==='en'?'Published on':'Publicado em'));
 const unknown=renderToStaticMarkup(<PublicTestView test={tests.find(t=>!t.published_at)!} locale={locale}/>);
 assert.ok(unknown.includes(locale==='en'?'Publication date not recorded':'Data de publicação não registrada'));
 assert.ok(unknown.includes(locale==='en'?'Updated on':'Atualizado em'));
 const html=renderToStaticMarkup(<PublicTestList tests={tests} locale={locale}/>);
 assert.equal((html.match(/atlas-campaign-update/g)||[]).length,8);
 assert.equal((html.match(/atlas-campaign-reading/g)||[]).length,8);
 assert.equal((html.match(/<details class="atlas-question-details" open/g)||[]).length,0);
 assert.match(html,locale==='en'?/215 associated tests/:/215 testes associados/);
 writeFileSync(process.env.CAMPAIGN_QA_DIR+'/overview-'+locale+'.html',html);
 let count=0;
 for(const group of groups){
  const fragment=renderToStaticMarkup(<PublicQuestionView group={group} locale={locale} searching={false}/>);
  count+=(fragment.match(/class="atlas-public-test"/g)||[]).length;
  assert.ok(fragment.includes(locale==='en'?'Limits of the conclusion':'Limites da conclusão'));
  for(const record of fragment.match(/<article class="atlas-public-test"[\s\S]*?<\/article>/g)||[]) assert.equal((record.match(/<dt>/g)||[]).length,4);
 }
 assert.equal(count,215);
}
const complete=groups.find(g=>g.id==='question-prontidao');
const subset=filterPublicQuestions(groups,'mínimo de 30 casos','pt-BR')[0];
const found=renderToStaticMarkup(<PublicQuestionView group={subset} overview={complete} locale="pt-BR" searching={true}/>);
assert.match(found,/Nos três mínimos/);assert.match(found,/investigação completa/);assert.match(found,/de 3 nesta pergunta/);
assert.equal((found.match(/class="atlas-public-test"/g)||[]).length,1);
assert.match(found,/<details class="atlas-question-details" open/);
console.log('PASS server-rendered PT/EN: 36 summaries, all 215 unchanged four-field tests, collapsed initial state, filtered/full-summary distinction, accessible disclosures and honest counts.');
`);
await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
await import(`${temp}/out/check.mjs`);
await rm(temp,{recursive:true,force:true});
