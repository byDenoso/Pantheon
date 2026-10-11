import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {encodePrivateResponse} from '../server/atlas/private-response.mjs';
import handler from '../server/handler.mjs';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
test('large private response stays complete with negotiated gzip instead of field truncation',async()=>{const value={synthetic:'x'.repeat(5*1024*1024)};const result=await encodePrivateResponse(value,'br, gzip');assert.equal(result.encoding,'gzip');assert.deepEqual(JSON.parse(gunzipSync(result.bytes)),value);assert.ok(result.bytes.length<4*1024*1024);});
test('identity and forbidden gzip never silently exceed platform response bound',async()=>{const small={value:'synthetic'};assert.deepEqual(JSON.parse((await encodePrivateResponse(small)).bytes),small);for(const header of ['', 'br','gzip;q=0'])await assert.rejects(encodePrivateResponse({value:'x'.repeat(5*1024*1024)},header),/PRIVATE_RESPONSE_TOO_LARGE/);});
test('wildcards allow gzip while specific exclusions and invalid quality values fail closed',async()=>{
 const value={synthetic:'x'.repeat(5*1024*1024)};
 for(const header of ['*','br;q=1, *;q=0.5','gzip;q=0.5, *;q=0']){
  const result=await encodePrivateResponse(value,header);
  assert.equal(result.encoding,'gzip',header);
  assert.deepEqual(JSON.parse(gunzipSync(result.bytes)),value);
 }
 for(const header of ['gzip;q=0, *;q=1','gzip;q=2','gzip;q=NaN','gzip;q=1;q=0','gzip;q=0, gzip;q=1','gzip;q=bogus, *'])
  await assert.rejects(encodePrivateResponse(value,header),/PRIVATE_RESPONSE_TOO_LARGE/,header);
});
test('large compression allows unrelated event-loop work before completion',async()=>{
 const value={synthetic:'abcdefgh01234567'.repeat(1024*1024)};
 let finished=false;
 const pending=encodePrivateResponse(value,'gzip').then(result=>{finished=true;return result;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(finished,false);
 const result=await pending;
 assert.deepEqual(JSON.parse(gunzipSync(result.bytes)),value);
});
test('authenticated private handler awaits compression and returns the complete generation',async t=>{
 const env={NEXO_ATLAS_PIN_HASH:`scrypt$${'e'.repeat(32)}$${'a'.repeat(128)}`,
  NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_REDIS_URL:'https://store.example',
  NEXO_ATLAS_REDIS_TOKEN:'synthetic-store-token',NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://private.example/snapshot',
  NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic-source-token'};
 const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 Object.assign(process.env,env);
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const publication=makePrivateRuntimeFixture();
 publication.data.system.synthetic_response_fixture='x'.repeat(1024*1024);
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url)===env.NEXO_ATLAS_REDIS_URL)return Response.json({result:JSON.stringify({exp:Date.now()+30000,
   credential:createHash('sha256').update(env.NEXO_ATLAS_PIN_HASH).digest('hex')})});
  assert.equal(String(url),env.NEXO_ATLAS_PRIVATE_SOURCE_URL);
  return Response.json(publication);
 });
 const res={headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.bytes=value;}};
 await handler({url:'/api/atlas-private',method:'GET',headers:{cookie:'__Host-atlas_session='+'a'.repeat(64),'accept-encoding':'gzip'}},res);
 assert.equal(res.statusCode,200);
 assert.equal(res.headers['Content-Encoding'],'gzip');
 assert.equal(res.headers['Cache-Control'],'private, no-store');
 assert.match(res.headers.Vary,/Accept-Encoding/);
 assert.deepEqual(JSON.parse(gunzipSync(res.bytes)),publication);
});
