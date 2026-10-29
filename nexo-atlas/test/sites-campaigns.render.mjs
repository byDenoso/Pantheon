import {build} from 'vite';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=resolve('.sites-runtime/canonical-render');await mkdir(temp,{recursive:true});
await writeFile(`${temp}/entry.tsx`,String.raw`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import assert from 'node:assert/strict';
import PublicCampaignsView from '../../src/atlas/ui/PublicCampaignsView.tsx';
const b=s=>({'pt-BR':s,en:s});
const campaign=i=>({id:'qa-'+i,questionId:'question-'+i,question:b('Synthetic question '+i),why:b('Software test only'),method:b('Synthetic fixture'),currentStage:b('Checking implementation'),nextStep:b('Review software'),limitations:[b('Not scientific evidence')],updatedAt:'2026-10-08T12:00:00Z',state:i===13?'completed':'ongoing',closure:i===13?{closedAt:'2026-10-08T12:00:00Z',reason:'BUDGET',outcome:'NULL',summary:b('Synthetic closure')}:null,testsCoverage:'COMPLETE',references:[],tests:[{id:'t-'+i,question:b('Synthetic test'),method:b('Unit test'),stage:'REVIEWED',updatedAt:'2026-10-08T12:00:00Z',result:{verdict:'NULL',summary:b('Synthetic result'),limitations:[b('Fixture')]},references:[]}]});
const campaigns=Array.from({length:14},(_,i)=>campaign(i));
for(const locale of ['pt-BR','en']){
 globalThis.window={location:{search:''}};
 const html=renderToStaticMarkup(<PublicCampaignsView campaigns={campaigns} locale={locale} coverage="COMPLETE"/>);
 assert.equal((html.match(/class="atlas-public-campaign"/g)||[]).length,6);
 assert.match(html,locale==='en'?/In progress/:/Em andamento/);
 assert.match(html,/<progress value="1" max="1"/);assert.match(html,/\?campanha=qa-/);
 globalThis.window={location:{search:'?campanha=qa-13'}};
 const one=renderToStaticMarkup(<PublicCampaignsView campaigns={campaigns} locale={locale} coverage="COMPLETE"/>);
 assert.equal((one.match(/class="atlas-public-campaign"/g)||[]).length,1);
 assert.match(one,/Synthetic closure/);
 globalThis.window={location:{search:'?campanha=absent'}};
 assert.doesNotMatch(renderToStaticMarkup(<PublicCampaignsView campaigns={campaigns} locale={locale} coverage="COMPLETE"/>),/class="atlas-public-campaign"/);
}
console.log('PASS synthetic SSR PT/EN, six per page, deep links, closure and reviewed progress. No browser QA or scientific result claimed.');
`);
await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
await import(pathToFileURL(`${temp}/out/check.mjs`).href);await rm(temp,{recursive:true,force:true});
