// Node SSR verification uses synthetic source text only. Browser visual QA is a separate check.
import {build} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});
const temp=await mkdtemp(resolve('.sites-runtime/retrieval-render-'));
try {
 await writeFile(`${temp}/entry.tsx`,String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import RetrievalPanel,{RetrievalEvidence,retrievalFailure} from '${resolve('src/private-memory/RetrievalPanel.tsx')}';
const result={query:'Dataset versus prior',role:'LEARNER',mode:'lexical',route:{mode:'lexical',reason:'measured_lexical_default; hybrid_remains_opt_in'},snapshot:{source_id:'fixture',revision:'r-1',observed_at:'2026-10-06T00:00:00Z'},authorization_revision:'r-1',method:'nexo-retrieval-1.3.0',answer_status:'EVIDENCE_FOUND',hits:[{id:'TEST::T-1',title:'A < B',kind:'TEST',state:'PROVISIONAL',excerpt:'Dataset: D-1\nPrior: P-1\n<script>forbidden()</script>\nResult: unchanged ± 0.1',chunk_context:{dataset:'D-1',prior:'P-1'},segments:[{json_pointer:'/dataset',text_start:0,text_end:2}],citation:{canonical_id:'TEST::T-1',object_id:'T-1',source_id:'fixture',tower_revision:'r-1',path:'entities/test/T-1.json',json_pointer:'/record',entity_version:'v7',content_sha256:'a'.repeat(64)},authority:'evidence_only',graph_path:{seed:'DATASET::D-1',edges:[{source:'TEST::T-1',target:'DATASET::D-1',relation:'uses_dataset',pointer:'/refs/0'}]}}]};
const request={query:result.query,mode:'auto',k:8};
for(const lang of ['pt-BR','en']){
 let requests=0;const initial=renderToStaticMarkup(<RetrievalPanel lang={lang} read={async()=>{requests++;}} sync={async()=>{requests++;}} onUnauthorized={()=>{}}/>);
 assert.equal(requests,0);assert.match(initial,/role="search"/);assert.match(initial,/name|aria-label/);assert.match(initial,/<textarea[^>]*required/);assert.match(initial,/<option value="auto" selected/);assert.doesNotMatch(initial,/<option[^>]*ENGINEER/);
 const html=renderToStaticMarkup(<RetrievalEvidence result={result} request={request} lang={lang}/>);
 for(const preserved of ['Dataset: D-1','Prior: P-1','unchanged ± 0.1','entities/test/T-1.json','/record','v7','r-1','/refs/0','uses_dataset','text_start'])assert.ok(html.includes(preserved),preserved);
 assert.match(html,/&lt;script&gt;forbidden\(\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,lang==='en'?/independent confirmations/:/confirmações independentes/);
 assert.match(html,lang==='en'?/word-based search/:/busca por palavras/);
 const empty=renderToStaticMarkup(<RetrievalEvidence result={{...result,hits:[],answer_status:'NO_EVIDENCE_IN_AUTHORIZED_INDEX'}} request={request} lang={lang}/>);assert.match(empty,/role="status"/);assert.match(empty,lang==='en'?/No evidence was found/:/Nenhuma evidência encontrada/);
}
for(const [error,state]of [[{status:401},'unauthorized'],[{status:403},'unauthorized'],[{status:409},'stale'],[{message:'HISTORICAL_QUERY_UNSUPPORTED'},'unsupported'],[{message:'RETRIEVAL_RESPONSE_INVALID'},'error'],[{status:503},'unavailable']])assert.equal(retrievalFailure(error),state);
console.log('PASS: PT/EN source form, escaped scientific text, complete citations/context/graph paths, route explanation, no-evidence and failure states. SSR only; visual browser QA not established.');
 `);
 await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
 await import(`${temp}/out/check.mjs`);
} finally {await rm(temp,{recursive:true,force:true});}
