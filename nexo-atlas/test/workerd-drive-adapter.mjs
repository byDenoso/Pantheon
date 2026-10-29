import {Miniflare} from 'miniflare';
import {build} from 'vite';
import assert from 'node:assert/strict';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
await build({configFile:false,publicDir:false,logLevel:'warn',build:{ssr:'test/drive-adapter-worker.mjs',outDir:'.sites-runtime/adapter-test',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'index.js',format:'es'},external:[/^node:/]}}});
for (const date of ['2024-09-23','2026-05-15']) for (const redirect of [false,true]) {
 let calls=0;
 const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/adapter-test/index.js',compatibilityDate:date,compatibilityFlags:['nodejs_compat'],outboundService:request=>{calls++;assert.equal(request.headers.get('Cache-Control'),'no-store');return redirect?new Response(null,{status:307,headers:{Location:'https://attacker.invalid'}}):Response.json(makePrivateTowerFixture());}});
 try {const result=await mf.dispatchFetch('https://test.invalid');const body=await result.json();assert.equal(result.status,redirect?503:200,JSON.stringify(body));assert.equal(calls,1);if(redirect)assert.equal(body.error,'DRIVE_DOWNLOAD_HTTP_307');else assert.equal(body.access,'PRIVATE');console.log(JSON.stringify({compatibilityDate:date,mode:redirect?'redirect refused':'full connector download + compiler',result:'PASS'}));}
 finally{await mf.dispose();}
}
