// Synthetic SSR contracts. No credentials, private records or browser claims.
import {build} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});
const temp=await mkdtemp(resolve('.sites-runtime/private-design-render-'));
try{
 await writeFile(`${temp}/entry.tsx`,String.raw`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PrivateNav} from '${resolve('src/private-design/PrivateNav.tsx')}';
const items=[{key:'web',href:'#/teia',label:'Teia'},{key:'domains',href:'#/teia/dominios',label:'Domínios'},{key:'research',href:'#/teia/testes',label:'Testes'},{key:'operations',href:'#/teia/operacao',label:'Operação'},{key:'board',href:'#/teia/mural',label:'Mural'},{key:'memory',href:'#/teia/memoria',label:'Memória'}];
for(const current of items.map(i=>i.key)){
 const html=renderToStaticMarkup(<PrivateNav items={items} current={current} label="Área privada" moreLabel="Mais"/>);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.equal((html.match(/data-overflow=""/g)||[]).length,3);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/aria-controls="[^"]+"/);
 assert.doesNotMatch(html,/pd-nav-menu/);
 assert.ok(html.includes('href="'+items.find(i=>i.key===current).href+'"'));
 if(items.findIndex(i=>i.key===current)>=3)assert.ok(html.includes('<span>'+items.find(i=>i.key===current).label+'</span></button>'));
}
const withoutMemory=renderToStaticMarkup(<PrivateNav items={items.slice(0,-1)} current="web" label="Private area" moreLabel="More"/>);
assert.doesNotMatch(withoutMemory,/#\/teia\/memoria/);assert.match(withoutMemory,/<span>More<\/span>/);
console.log('PASS private nav SSR: all current routes, overflow labels, closed disclosure, omitted memory slot, PT/EN. Browser interaction remains unverified.');
 `);
 await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${temp}/entry.tsx`,outDir:`${temp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
 await import(`${temp}/out/check.mjs`);
}finally{await rm(temp,{recursive:true,force:true});}
