import {Miniflare} from 'miniflare';
import {build} from 'vite';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ORIGIN} from '../worker/auth.mjs';

const input=process.argv[2];if(!input)throw new Error('Supply an authorized local Tower file outside the Site checkout.');
await build({configFile:false,publicDir:false,logLevel:'warn',ssr:{noExternal:true,resolve:{conditions:['workerd','module','import']}},build:{ssr:'test/runtime-worker.mjs',outDir:'.sites-runtime/runtime-test',emptyOutDir:true,sourcemap:false,rollupOptions:{output:{entryFileNames:'index.js',format:'es'},external:[/^node:/]}}});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/runtime-test/index.js',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid'},serviceBindings:{ASSETS:()=>new Response('PUBLIC'),TOWER_TEST:()=>new Response(readFileSync(input),{headers:{'Content-Type':'application/json'}})}});
const headers={origin:ORIGIN,'sec-fetch-site':'same-origin','Content-Type':'application/json','oai-authenticated-user-id':'verified-owner','oai-authenticated-user-email':'owner@example.invalid'};
try{
 const db=await mf.getD1Database('DB');
 for(const name of readdirSync('drizzle').filter(v=>v.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 console.log('workerd check: migrations ready');
 const login=await mf.dispatchFetch(ORIGIN+'/api/atlas-pin/setup',{method:'POST',headers,body:JSON.stringify({pin:'synthetic-runtime-test-pin'})});assert.equal(login.status,200,await login.text());
 console.log('workerd check: PIN setup ready');
 const cookie=login.headers.get('set-cookie').split(';')[0],start=Date.now();
 const response=await mf.dispatchFetch(ORIGIN+'/api/atlas-private',{method:'POST',headers:{...headers,cookie,'Accept-Encoding':'gzip'},body:'{}'});
 assert.equal(response.status,200);
 console.log('workerd check: response headers',JSON.stringify(Object.fromEntries(response.headers)));
 // Use the same transparent HTTP decompression + JSON decoder as browser fetch.
 // An extra manual gunzip would hide a production double-compression bug.
 const decoded = await response.json();assert.equal(decoded.contract,'ATLAS_PRIVATE_V1');assert.equal(decoded.data.access,'PRIVATE');
 const raw=Buffer.from(JSON.stringify(decoded));
 const baseline=JSON.parse(readFileSync('/tmp/atlas-runtime-baseline.json'));
 assert.equal(createHash('sha256').update(raw).digest('hex'),baseline.sha256);
 console.log(JSON.stringify({runtime:'Cloudflare workerd',ownerPinSetup:'PASS',authenticatedFullTower:'PASS',browserJsonDecode:'PASS',exactOutputHash:'PASS',bytes:raw.length,elapsedMs:Date.now()-start}));
}finally{await mf.dispose();}
