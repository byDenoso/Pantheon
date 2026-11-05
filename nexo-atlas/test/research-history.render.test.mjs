import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

test('result history renders both versions, correction reason and field provenance from a synthetic fixture',async()=>{
  await mkdir(resolve('.sites-runtime'),{recursive:true});
  const temp=await mkdtemp(resolve('.sites-runtime/history-render-'));
  try {
    const component=resolve('src/atlas/ui/ResearchRecord.tsx').replaceAll('\\','/');
    await writeFile(join(temp,'entry.tsx'),`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ResultHistory} from '${component}';
const text=value=>({'pt-BR':value,en:value});
const first={version:'SYNTHETIC-1',status:'unknown',date:null,datasets:null,code:null,result:text('SYNTHETIC earlier result <script>'),uncertainty:null,scope:null,limits:null,evidenceLevel:null,sourceKeys:['a'.repeat(64)],changeReason:null};
const second={...first,version:'SYNTHETIC-2',result:text('SYNTHETIC corrected result'),changeReason:text('SYNTHETIC reason for correction'),publication:{doi:'10.1234/synthetic',arxiv:null},provenance:{version:{commit:'b'.repeat(40),path:'nexo-atlas/worker/public-cosmology.json',sha256:'c'.repeat(64),pointer:'/records/synthetic/research/version'}}};
for(const locale of ['pt-BR','en']) {
  const html=renderToStaticMarkup(<ResultHistory versions={[first,second]} locale={locale}/>);
  assert.ok(html.indexOf('SYNTHETIC-1')<html.indexOf('SYNTHETIC-2'));
  for(const expected of ['SYNTHETIC earlier result','SYNTHETIC corrected result','SYNTHETIC reason for correction','https://doi.org/10.1234/synthetic','/records/synthetic/research/version','c'.repeat(64)])assert.ok(html.includes(expected),expected);
  assert.ok(html.includes(locale==='en'?'Not available in the public record.':'Não informado no registro público.'));
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  const parallel=renderToStaticMarkup(<ResultHistory versions={[{...first,analysisId:'SYNTHETIC-analysis-a'},{...first,analysisId:'SYNTHETIC-analysis-b'}]} locale={locale}/>);
  assert.ok(parallel.includes('SYNTHETIC-analysis-a'));assert.ok(parallel.includes('SYNTHETIC-analysis-b'));
}
`);
    await build({configFile:false,publicDir:false,logLevel:'error',build:{ssr:join(temp,'entry.tsx'),outDir:join(temp,'out'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'check.mjs'}}}});
    await import(pathToFileURL(join(temp,'out/check.mjs')).href);
  }finally{assert.equal(dirname(temp),resolve('.sites-runtime'));await rm(temp,{recursive:true,force:true});}
});
