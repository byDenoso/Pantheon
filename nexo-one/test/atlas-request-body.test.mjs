import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import handler from '../server/handler.mjs';

const pin='synthetic-açãο-🧪-passphrase';
const salt='d'.repeat(32);
const env={NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync(pin,salt,64).toString('hex')}`,
 NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_REDIS_URL:'https://store.example',
 NEXO_ATLAS_REDIS_TOKEN:'synthetic-store-token'};
function setup(t){
 const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
 Object.assign(process.env,env);
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 let stores=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(String(url),env.NEXO_ATLAS_REDIS_URL);stores++;
  const command=JSON.parse(options.body)[0];
  assert.ok(['EVAL','SET'].includes(command));
  return Response.json({result:command==='EVAL'?1:'OK'});
 });
 return ()=>stores;
}
function request(body,chunks){
 return {url:'/api/atlas-session',method:'POST',headers:{host:'atlas.example',origin:env.NEXO_ATLAS_ORIGIN,'content-type':'application/json'},
  ...(body===undefined?{}:{body}),
  ...(chunks?{async *[Symbol.asyncIterator](){yield* chunks;}}:{})};
}
async function call(req){
 const res={headers:{},setHeader(key,value){this.headers[key]=value;},end(value){this.body=JSON.parse(value);}};
 await handler(req,res);return res;
}
test('Unicode passphrases survive every byte boundary in streamed JSON',async t=>{
 setup(t);
 const bytes=Buffer.from(JSON.stringify({pin}));
 const res=await call(request(undefined,[...bytes].map(byte=>Buffer.from([byte]))));
 assert.equal(res.statusCode,200);
 assert.equal(res.body.authenticated,true);
});
test('serialized, buffered and pre-parsed JSON all produce the same login',async t=>{
 setup(t);
 for(const body of [JSON.stringify({pin}),Buffer.from(JSON.stringify({pin})),{pin}]){
  const res=await call(request(body));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.authenticated,true);
 }
});
test('malformed JSON returns a client error before reserving login attempts',async t=>{
 const stores=setup(t);
 for(const body of ['{broken',Buffer.from('{broken')]){
  const res=await call(request(body));assert.equal(res.statusCode,400);assert.deepEqual(res.body,{error:'INVALID_JSON'});
 }
 const streamed=await call(request(undefined,[Buffer.from('{broken')]));
 assert.equal(streamed.statusCode,400);assert.deepEqual(streamed.body,{error:'INVALID_JSON'});
 assert.equal(stores(),0);
});
test('every body representation enforces the 64 KiB byte cap before store access',async t=>{
 const stores=setup(t);
 const body={pin,padding:'é'.repeat(40000)},serialized=JSON.stringify(body);
 assert.ok(serialized.length<65536&&Buffer.byteLength(serialized)>65536);
 for(const req of [request(serialized),request(Buffer.from(serialized)),request(body),
  request(undefined,[Buffer.from(serialized)])]){
  const res=await call(req);assert.equal(res.statusCode,413);assert.deepEqual(res.body,{error:'REQUEST_BODY_TOO_LARGE'});
 }
 assert.equal(stores(),0);
});
