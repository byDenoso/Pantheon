// Synthetic SSR component verification. This does not claim visual browser QA.
import {build} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});
const temp=await mkdtemp(resolve('.sites-runtime/board-render-'));
try {
 await writeFile(`${temp}/entry.tsx`,String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import AgentBoardView from '${resolve('src/private-workspace/AgentBoardView.tsx')}';
import {compilePrivateTowerRuntime} from '${resolve('server/atlas/private-tower.mjs')}';
import {makePrivateTowerFixture} from '${resolve('test/helpers/private-tower.fixture.mjs')}';
const tower=makePrivateTowerFixture();
tower.files['evolution/board.json']={encoding:'json',value:{posts:[{id:'ROOT',from:'ENGINEER',to:'EXECUTOR',at:'2025-12-31T12:00:00Z',text:'Canonical text\n<script>never()</script>',refs:['TEST-01','https://example.invalid/private-ref'],private:true},{id:'REPLY',from:'EXECUTOR',to:'ENGINEER',at:'2025-12-31T13:00:00Z',text:'Canonical reply',reply_to:'ROOT',refs:[]}]}};
tower.file_count=Object.keys(tower.files).length;
const state=compilePrivateTowerRuntime(tower).data.system;
assert.equal(state.evolution,null);
for(const lang of ['pt-BR','en']){
 const html=renderToStaticMarkup(<AgentBoardView state={state} lang={lang}/>);
 for(const phrase of ['Canonical text','Canonical reply','evolution/board.json#/posts/0','ROOT','REPLY',state.bus.fingerprint])assert.ok(html.includes(phrase),phrase);
 assert.match(html,/&lt;script&gt;never\(\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/href="#\/teia\/teste\/TEST-01"/);assert.doesNotMatch(html,/href="https:\/\/example.invalid\/private-ref"/);
 assert.match(html,lang==='en'?/Answered/:/Respondido/);assert.equal((html.match(/data-post-id=/g)||[]).length,2);
 assert.match(html,/<input type="search"/);assert.equal((html.match(/<select/g)||[]).length,2);
 const stale={...state,bus:{...state.bus,fingerprint:'different'}};
 const unavailable=renderToStaticMarkup(<AgentBoardView state={stale} lang={lang}/>);
 assert.match(unavailable,lang==='en'?/unavailable/:/não está disponível/);assert.doesNotMatch(unavailable,/Canonical text|data-post-id=/);
}
console.log('PASS: PT/EN canonical posts under partial evolution, escaped text, exact revision and locators, private internal references, reply status, filters and stale-source failure. SSR only.');
 `);
 await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
 await import(`${temp}/out/check.mjs`);
} finally {await rm(temp,{recursive:true,force:true});}
