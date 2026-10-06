import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {atlasAuthenticated,atlasSessionRoute,SESSION_SECONDS,atlasStore} from '../server/auth/atlas-session.mjs';
import {atlasBoundary,publicAtlas} from '../server/atlas/boundary.mjs';
import {readAtlasPrivatePublication} from '../server/atlas/private-source.mjs';
const salt='a'.repeat(32),pin='synthetic-only-passphrase',now=1700000000000;
const env={NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync(pin,salt,64).toString('hex')}`,NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_REDIS_URL:'https://store.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic-test-token'};
const request=(method='GET',cookie='',extra={})=>({method,headers:{origin:env.NEXO_ATLAS_ORIGIN,'content-type':'application/json',cookie,...extra}});
function memory(){const values=new Map();return async(cmd,key,...args)=>{if(cmd==='GET')return values.get(key)||null;if(cmd==='DEL')return Number(values.delete(key));if(cmd==='SET'){values.set(key,args[0]);return 'OK';}if(cmd==='EVAL'){const k=args[1];const n=(values.get(k)||0)+1;values.set(k,n);return n;}throw Error(cmd);};}
async function login(store,req=request('POST')){return atlasSessionRoute(req,env,now,{pin},store);}
const extract=result=>result.setCookie.split(';')[0];
test('public allowlist returns no source fields or data regardless of inputs',()=>{assert.deepEqual(publicAtlas({secret:'SYNTHETIC_PRIVATE'}),{contract:'ATLAS_PUBLIC_V1',items:[],links:[]});});
test('missing configuration fails closed',async()=>{assert.equal(await atlasAuthenticated(request(),{},now,memory()),false);assert.equal((await atlasSessionRoute(request('POST'),{},now,{pin},memory())).status,503);});
test('valid login creates secure opaque cookie, then expires',async()=>{const store=memory(),out=await login(store);assert.equal(out.status,200);assert.match(out.setCookie,/^__Host-atlas_session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600$/);assert.equal(await atlasAuthenticated(request('GET',extract(out)),env,now,store),true);assert.equal(await atlasAuthenticated(request('GET',extract(out)),env,now+SESSION_SECONDS*1000,store),false);});
test('logout revokes copied token server-side and clears cookie',async()=>{const store=memory(),old=extract(await login(store));const out=await atlasSessionRoute(request('DELETE',old),env,now,{},store);assert.equal(out.status,200);assert.match(out.setCookie,/Max-Age=0$/);assert.equal(await atlasAuthenticated(request('GET',old),env,now,store),false);});
test('rotation and changing PIN hash invalidate previous sessions',async()=>{const store=memory(),old=extract(await login(store)),fresh=extract(await login(store,request('POST',old)));assert.equal(await atlasAuthenticated(request('GET',old),env,now,store),false);assert.equal(await atlasAuthenticated(request('GET',fresh),{...env,NEXO_ATLAS_PIN_HASH:env.NEXO_ATLAS_PIN_HASH.replace(salt,'b'.repeat(32))},now,store),false);});
test('incorrect PIN and short PIN fail; global atomic attempts resist spoofed IPs',async()=>{const store=memory();for(let n=0;n<5;n++)assert.equal((await atlasSessionRoute(request('POST','',{'x-forwarded-for':`synthetic-${n}`}),env,now,{pin:n?'1234':'incorrect-value'},store)).status,401);assert.equal((await login(store)).status,429);});
test('mutations require exact configured origin and JSON login',async()=>{for(const origin of ['', 'http://atlas.example','https://evil.example']){assert.equal((await atlasSessionRoute(request('POST','',{origin}),env,now,{pin},memory())).status,403);assert.equal((await atlasSessionRoute(request('DELETE','',{origin}),env,now,{},memory())).status,403);}assert.equal((await atlasSessionRoute(request('POST','',{'content-type':'text/plain'}),env,now,{pin},memory())).status,415);});
test('forged or duplicate cookies fail and old legacy cookie is not authority',async()=>{for(const cookie of ['nexo_session=legacy','__Host-atlas_session=forged','__Host-atlas_session='+ 'a'.repeat(64)+'; __Host-atlas_session='+ 'b'.repeat(64)])assert.equal(await atlasAuthenticated(request('GET',cookie),env,now,memory()),false);});
test('anonymous paths deny before any upstream data read, including route aliases',async()=>{for(const route of ['world','system','atlas-private','atlas-public-ssot','mcp','mcp/status','projection-sync','observatory-tests','lab-evidence','unknown','inbox-drop'])assert.deepEqual(await atlasBoundary(request(),env,{route,now,store:memory()}),{status:401,body:{error:'AUTH_REQUIRED'}});assert.equal((await atlasBoundary(request(),env,{route:'atlas-public',now,store:memory()})).status,200);});
test('store failure never falls back to memory or authenticated success',async()=>{const store=async()=>{throw Error('offline');};await assert.rejects(login(store));const req=request('GET','__Host-atlas_session='+'a'.repeat(64));await assert.rejects(atlasAuthenticated(req,env,now,store));});
test('private source is absent by default and never falls back to public URLs',async()=>{let calls=0;await assert.rejects(readAtlasPrivatePublication({},()=>{calls++;}));assert.equal(calls,0);});
test('private source is bounded, authenticated, no-store, and validates envelope',async()=>{const {data}=makePrivateRuntimeFixture();const result=await readAtlasPrivatePublication({NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://private.example/snapshot',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'test'},async(url,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test');return new Response(JSON.stringify({contract:'ATLAS_PRIVATE_V1',data,extra:'discard'}));});assert.deepEqual(result,{contract:'ATLAS_PRIVATE_V1',data});});
test('Redis store sends atomic command and propagates errors',async()=>{const store=atlasStore(env,async(url,options)=>{assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),['GET','synthetic']);return new Response(JSON.stringify({result:null}));});assert.equal(await store('GET','synthetic'),null);await assert.rejects(atlasStore(env,async()=>new Response('{"error":"denied"}'))('GET','x'));});
test('malformed limiter reservations fail closed before PIN derivation',async()=>{for(const value of [undefined,null,false,0,-1,{},'1','not-a-number'])await assert.rejects(login(async()=>value),/AUTH_STORE_UNAVAILABLE/);});

test('session read returns original expiry instead of extending near-expired display',async()=>{
  const store=memory(),out=await login(store),session=extract(out);
  const read=await atlasSessionRoute(request('GET',session),env,now+SESSION_SECONDS*1000-1000,{},store);
  assert.equal(read.body.expiresAt,out.body.expiresAt);
  assert.equal(read.body.authenticated,true);
  const expired=await atlasSessionRoute(request('GET',session),env,now+SESSION_SECONDS*1000,{},store);
  assert.equal(expired.body.authenticated,false);
  assert.equal(expired.body.expiresAt,undefined);
});
