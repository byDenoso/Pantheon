import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertShellOnly} from '../scripts/assert-publication.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const destination='https://nexoresearch.org/';
const entries=['index.html','atlas-v3/index.html'];

function assertBridge(html){
  assert.match(html,/<html\s+lang="pt-BR"/);
  assert.match(html,/<main\s+id="atlas-main"/);
  assert.match(html,/<h1>NEXO Atlas<\/h1>/);
  assert.match(html,/<meta\s+name="referrer"\s+content="no-referrer"\s*\/>/);
  const refresh=html.match(/<meta\s+http-equiv="refresh"\s+content="([^"]+)"\s*\/>/)?.[1];
  assert.equal(refresh,`0; url=${destination}`,'automatic navigation has one fixed destination');
  const links=[...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
  assert.deepEqual(links.map(match=>match[1]),['#atlas-main',destination]);
  assert.equal(links[1][2],'Abrir o Atlas atual','a visible link works without script execution');
  assert.match(links[1][0],/rel="noreferrer"/);
  assert.doesNotMatch(html,/<(?:script|iframe|object|embed|form|input|link)\b|\son[a-z]+\s*=|\/src\/|\/api\/|data\/v3\//i,
    'the bridge cannot load an old app, data reader or caller-controlled navigation');
}

test('root and nested legacy entrypoints are accessible fixed-destination bridges',async()=>{
  for(const entry of entries)assertBridge(await readFile(join(root,entry),'utf8'));
});

test('hosting redirects discard legacy paths and query parameters while preserving API configuration',async()=>{
  const config=JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  const redirects=config.routes.filter(route=>route.headers?.Location);
  assert.deepEqual(redirects.map(route=>({src:route.src,status:route.status,headers:route.headers})),[
    {src:'/',status:303,headers:{Location:`${destination}#`,'Referrer-Policy':'no-referrer'}},
    {src:'/(.*)',status:303,headers:{Location:`${destination}#`,'Referrer-Policy':'no-referrer'}},
  ]);
  // 303 prevents forwarding a retired-interface POST body. The explicit empty
  // fragment prevents HTTP redirect fragment inheritance (RFC 9110, 10.2.2).
  for(const redirect of redirects){
    assert.ok(redirect.headers.Location.endsWith('#'));
    assert.doesNotMatch(redirect.headers.Location,/\$\d|\?/);
  }
  assert.equal(new URL(destination).search,'');assert.equal(new URL(destination).hash,'');
  assert.ok(config.routes.findIndex(route=>route.handle==='filesystem')<config.routes.indexOf(redirects[1]));
  // This deactivation is restricted to static redirects. Preserve every existing
  // API route, build declaration, identity boundary and deployment setting.
  const protectedConfig={...config,routes:config.routes.filter(route=>!route.headers?.Location)};
  assert.equal(createHash('sha256').update(JSON.stringify(protectedConfig)).digest('hex'),
    '4d2756368282be5ddd0695ec5c8751c978a67d6056630fa2d16ea58aaa7b6add');
});

test('the actual production build contains only the two bridges and passes the unchanged publication gate',async t=>{
  const temp=await mkdtemp(join(tmpdir(),'atlas-bridge-build-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const outDir=join(temp,'dist');
  const {build}=await import('vite');
  await build({root,configFile:join(root,'vite.config.ts'),logLevel:'silent',build:{outDir,emptyOutDir:true}});
  const files=[];
  async function walk(dir,prefix=''){
    for(const item of await readdir(dir,{withFileTypes:true})){
      const relative=prefix?`${prefix}/${item.name}`:item.name;
      if(item.isDirectory())await walk(join(dir,item.name),relative);
      else{assert.ok(item.isFile(),'no links or special files in the publication');files.push(relative);}
    }
  }
  await walk(outDir);
  assert.deepEqual(files.sort(),[...entries].sort(),'no legacy application, data or executable asset is published');
  for(const entry of entries)assertBridge(await readFile(join(outDir,entry),'utf8'));
  assert.deepEqual(await assertShellOnly(outDir),{publicDataCount:0});
});
