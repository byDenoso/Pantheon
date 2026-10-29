// Uses synthetic owner/PIN only against a local workerd. Never contacts hosted Atlas.
import {Miniflare} from 'miniflare';import {build} from 'vite';import{readFileSync,readdirSync}from'node:fs';import assert from'node:assert/strict';
import {ORIGIN} from '../worker/auth.mjs';import {compilePrivateWorkspaceRuntime} from '../server/atlas/private-workspace.mjs';
const path=process.argv[2];if(!path)throw new Error('Supply an authorized local Tower path outside the Site checkout.');
const raw=readFileSync(path),tower=JSON.parse(raw),expected=compilePrivateWorkspaceRuntime(tower);
await build({configFile:false,publicDir:false,logLevel:'error',ssr:{noExternal:true,resolve:{conditions:['workerd','module','import']}},build:{ssr:'test/workspace-worker.mjs',outDir:'.sites-runtime/workspace-worker-test',emptyOutDir:true,sourcemap:false,rollupOptions:{output:{entryFileNames:'index.js',format:'es'},external:[/^node:/]}}});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/workspace-worker-test/index.js',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid'},serviceBindings:{ASSETS:()=>new Response('PUBLIC'),TOWER_TEST:()=>new Response(raw,{headers:{'Content-Type':'application/json'}})}});
const headers={origin:ORIGIN,'sec-fetch-site':'same-origin','Content-Type':'application/json','oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'owner@example.invalid'};
try{
 const db=await mf.getD1Database('DB');for(const name of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const anonymous=await mf.dispatchFetch(ORIGIN+'/api/atlas-private/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(anonymous.status,401);
 const login=await mf.dispatchFetch(ORIGIN+'/api/atlas-pin/setup',{method:'POST',headers,body:JSON.stringify({pin:'synthetic-runtime-test-pin'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const operations=await mf.dispatchFetch(ORIGIN+'/api/atlas-private/operations',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({expected_revision:tower.revision})});assert.equal(operations.status,200);assert.equal((await operations.json()).access,'PRIVATE');
 const stale=await mf.dispatchFetch(ORIGIN+'/api/atlas-private/operations',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({expected_revision:'sha256:'+'f'.repeat(64)})});assert.equal(stale.status,409);
 const spoof=await mf.dispatchFetch(ORIGIN+'/api/atlas-private/operations',{method:'POST',headers:{...headers,cookie,origin:'https://foreign.invalid'},body:'{}'});assert.equal(spoof.status,403);
 const publicData=await mf.dispatchFetch(ORIGIN+'/api/atlas-public');assert.doesNotMatch(await publicData.text(),/PRIVATE-CANARY|NEXO-BRIDGE-CANARY-20261007-CHAT-V1/);
 const response=await mf.dispatchFetch(ORIGIN+'/api/atlas-private',{method:'POST',headers:{...headers,cookie},body:'{"profile":"workspace-v1"}'});assert.equal(response.status,200);assert.deepEqual(await response.json(),JSON.parse(JSON.stringify(expected)));
 const id=expected.data.system.workspace_lab.tests[0][0],detail=await mf.dispatchFetch(ORIGIN+'/api/atlas-private/test',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({id,expected_revision:tower.revision})});assert.equal(detail.status,200);assert.equal((await detail.json()).record.id,id);
 console.log('PASS workerd workspace serialization, transparent browser JSON decompression, exact local source output, owner/PIN and on-demand canonical record. No hosted session/login latency measured.');
}finally{await mf.dispose();}
