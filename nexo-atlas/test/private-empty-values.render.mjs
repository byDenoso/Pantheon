import {build} from 'vite';import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';import {resolve} from 'node:path';
await mkdir(resolve('.sites-runtime'),{recursive:true});const tmp=await mkdtemp(resolve('.sites-runtime/empty-values-'));
try{
await writeFile(`${tmp}/entry.tsx`,String.raw`
import React from 'react';import assert from 'node:assert/strict';import {renderToStaticMarkup as render} from 'react-dom/server';
import {SourceValue,DateText} from '${resolve('src/private-workspace/Value.tsx')}';
import {WORKSPACE_COPY} from '${resolve('src/private-workspace/copy.ts')}';
for(const lang of ['pt-BR','en']){
 for(const value of ['  ',{valid:12,blank_array:[],blank_object:{},whitespace:'  '},{nested:{v:[]}},0,false,'line\n\n  \n\nnext']){
  const html=render(<SourceValue value={value} lang={lang}/>);assert.ok(html.trim());assert.doesNotMatch(html,/<(p|dd|ul|dl)>\s*<\/\1>/);
 }
 const invalid=render(<DateText value="not-a-date" lang={lang}/>),missing=render(<DateText value={null} lang={lang}/>);
 assert.notEqual(invalid,missing);assert.match(invalid,lang==='en'?/invalid/:/inválida/);assert.ok(missing);
 const zero=render(<SourceValue value={0} lang={lang}/>);assert.match(zero,/>0</);
 const deep={one:{two:{three:{four:{record:'x'.repeat(20000)+'PRIVATE-END-MARKER'}}}}};
 const clipped=render(<SourceValue value={deep} lang={lang}/>);
 assert.ok(clipped.includes(WORKSPACE_COPY[lang].clipped),'deep source content must disclose abbreviation');
 assert.equal(clipped.includes('PRIVATE-END-MARKER'),false);
}
console.log('PASS PT/EN empty nested values, whitespace, valid zero/false, invalid/missing dates and honest deep-content abbreviation');
`);
await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:`${tmp}/entry.tsx`,outDir:`${tmp}/out`,emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});await import(`${tmp}/out/check.mjs`);
}finally{await rm(tmp,{recursive:true,force:true});}
