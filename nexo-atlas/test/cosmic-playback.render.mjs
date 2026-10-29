// Synthetic SSR verification, no sockets, credentials or private source records.
// Does not replace visual/browser verification.
import {build} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});
const temp=await mkdtemp(resolve('.sites-runtime/cosmic-render-'));
try {
 await writeFile(`${temp}/entry.tsx`,String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import TowerCosmos from '${resolve('src/tower-web/TowerCosmos.tsx')}';
const tests=[{id:'FIRST',domain:'SCIENCE',createdAt:'2026-01-01T00:00:00Z'},{id:'LAST',domain:'ENGINEERING',createdAt:'2026-01-03T00:00:00Z',parents:['FIRST']},{id:'UNDATED',domain:'SCIENCE'}];
for(const theme of ['dark','light']){
 const html=renderToStaticMarkup(<TowerCosmos tests={tests} theme={theme} autoRefreshMs={0}/>);
 assert.ok(html.includes('data-theme="'+theme+'"'));
 for(const phrase of ['Linha do tempo','0.25×','0.5×','1×','Halos de matéria escura','Expansão por energia escura','Sem escala física','Pausar movimento','Visão atual','1 teste sem data fica fora do replay'])assert.ok(html.includes(phrase),phrase);
 assert.equal((html.match(/<canvas/g)||[]).length,2,'existing GL + overlay only');
 assert.match(html,/data-playback-rate="0.5"/);assert.match(html,/data-replay-cut="current"/);assert.match(html,/data-replay-playing="false"/);
 assert.match(html,/aria-pressed="true">0.5×/);assert.match(html,/type="range" aria-label="Replay no tempo"/);
 const unavailable=renderToStaticMarkup(<TowerCosmos tests={[tests[0]]} theme={theme}/>);
 assert.match(unavailable,/duas datas de criação publicadas distintas/);assert.doesNotMatch(unavailable,/aria-label="Replay no tempo"/);
}
globalThis.window={matchMedia:(q)=>({matches:q==='(prefers-reduced-motion: reduce)'})};
const reduced=renderToStaticMarkup(<TowerCosmos tests={tests}/>);
assert.match(reduced,/data-motion="off"/);assert.match(reduced,/Movimento reduzido: use o controle de data/);assert.match(reduced,/disabled="" title="Reprodução automática desligada/);
delete globalThis.window;
console.log('PASS: dark/light SSR, native timeline controls, exact date bounds, unavailable dates, honest illustration labels, existing two canvases, reduced-motion disabled autoplay. Browser QA still required.');
 `);
 await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
 await import(`${temp}/out/check.mjs`);
}finally{await rm(temp,{recursive:true,force:true});}
