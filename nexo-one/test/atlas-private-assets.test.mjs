import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readPrivateUiAsset} from '../server/atlas/private-assets.mjs';
import handler from '../server/handler.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('server-only private assets require a reviewed manifest, integrity and contained paths',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'atlas-private-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes='export const synthetic = true;';await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'assets/app.js'),bytes);
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({contract:'ATLAS_PRIVATE_ASSETS_V1',files:{'assets/app.js':sha(bytes)}}));
 assert.equal((await readPrivateUiAsset('assets/app.js',{root})).bytes.toString(),bytes);
 for(const name of ['../secret.js','assets/../secret.js','/secret.js','%2e%2e/secret.js','assets/app.js.map','manifest.json','assets/missing.js'])await assert.rejects(readPrivateUiAsset(name,{root}));
 await writeFile(path.join(root,'assets/app.js'),'tampered');await assert.rejects(readPrivateUiAsset('assets/app.js',{root}),/MISMATCH/);
 const outside=await mkdtemp(path.join(tmpdir(),'atlas-outside-fixture-'));t.after(()=>rm(outside,{recursive:true,force:true}));await writeFile(path.join(outside,'escaped.js'),bytes);await symlink(path.join(outside,'escaped.js'),path.join(root,'assets/link.js'));await writeFile(path.join(root,'manifest.json'),JSON.stringify({contract:'ATLAS_PRIVATE_ASSETS_V1',files:{'assets/link.js':sha(bytes)}}));await assert.rejects(readPrivateUiAsset('assets/link.js',{root}),/PRIVATE_ASSET_NOT_FOUND/);
});
test('private asset routes reject anonymous requests before filesystem lookup or route override',async()=>{
 for(const url of ['/api/atlas-private-ui','/api/atlas-private-assets/assets/app.js','/api/atlas-private-assets/assets/app.js?route=atlas-public','/api/index?route=atlas-private-asset&asset=assets/app.js']){
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};await handler({url,method:'GET',headers:{}},res);assert.equal(res.statusCode,401);assert.deepEqual(res.body,{error:'AUTH_REQUIRED'});assert.equal(res.headers['Cache-Control'],'private, no-store');
 }
});
test('private UI missing build fails explicitly rather than serving public or synthetic fallback',async()=>{await assert.rejects(readPrivateUiAsset('index.html',{root:'/nonexistent-synthetic-private-root'}),/PRIVATE_UI_NOT_BUILT/);});
test('deployment configs route private assets through the authenticated function, never static dist',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const [url,include] of [[new URL('../../vercel.json',import.meta.url),'nexo-one/server/private-ui/**'],[new URL('../vercel.json',import.meta.url),'server/private-ui/**']]){
  const config=JSON.parse(await readFile(url,'utf8'));assert.equal(config.functions['api/index.js'].includeFiles,include);assert.equal(config.rewrites[0].source,'/api/atlas-private-assets/:asset*');assert.match(config.rewrites[0].destination,/route=atlas-private-asset/);
 }
 const {buildReleaseVercelConfig}=await import('../scripts/release-config.mjs');const release=buildReleaseVercelConfig({},['index.html','server/private-ui/assets/private.js']);assert.deepEqual(release.builds[0].config.includeFiles,['server/private-ui/**']);assert.ok(!release.builds.some(b=>b.use==='@vercel/static'&&b.src.includes('private-ui')));
});
