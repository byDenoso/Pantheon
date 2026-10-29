import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVercelPrivate} from '../worker/vercel-private.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';

const origin='https://nexo-one-two.vercel.app',env={NEXO_ATLAS_ORIGIN:origin,NEXO_ATLAS_OWNER_SUB:'owner'},sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){const db=new Map();const store=async(op,...a)=>{if(op==='GET')return db.get(a[0])||null;if(op==='SET'){if(a.includes('NX')&&db.has(a[0]))return null;db.set(a[0],a[1]);return 'OK';}if(op==='DEL')return db.delete(a[0])?1:0;if(op==='EVAL'){const key=a[2],n=Number(db.get(key)||0)+1;db.set(key,n);return n;}throw Error('unexpected');};return {db,store};}
test('private boundary rejects anonymous and binds PIN session to Google identity',async()=>{
 const {db,store}=fixture(),identity='a'.repeat(43),idCookie=`__Host-atlas_google_identity=${identity}`;
 db.set(`atlas:google:identity:${sha(identity)}`,JSON.stringify({sub:'owner',exp:Date.now()+3590000}));
 const raw=Buffer.from(JSON.stringify(makePrivateTowerFixture()));let reads=0;
 const handler=createVercelPrivate({store,asset:async name=>name==='index.html'?{bytes:Buffer.from('private'),type:'text/html'}:null,readBytes:async()=>{reads++;return {raw,transport:{revision_id:'rev',body_sha256:'b'.repeat(64),size:raw.length}};}});
 const req=(path,method='GET',cookie='',data)=>new Request(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 assert.equal((await handler(req('/api/atlas-private-ui'),env)).status,403);
 assert.equal((await handler(req('/api/atlas-private','POST','',{profile:'workspace-v1'}),env)).status,403);assert.equal(reads,0);
 const setup=await handler(req('/api/atlas-pin/setup','POST',idCookie,{pin:'synthetic-password'}),env);assert.equal(setup.status,200);
 const session=setup.headers.get('set-cookie').split(';')[0],cookies=idCookie+'; '+session;
 assert.equal((await handler(req('/api/atlas-private-ui','GET',cookies),env)).status,200);
 const result=await handler(req('/api/atlas-private','POST',cookies,{profile:'workspace-v1'}),env);assert.equal(result.status,200);
 const data=await result.json();assert.equal(data.data.transport.revision_id,'rev');assert.equal(data.data.transport.body_sha256,'b'.repeat(64));
 const lookup=await handler(req('/api/atlas-private/test','POST',cookies,{id:'TEST-01',expected_revision:makePrivateTowerFixture().revision}),env);assert.equal(lookup.status,200);
 const stale=await handler(req('/api/atlas-private/test','POST',cookies,{id:'TEST-01',expected_revision:'sha256:'+'a'.repeat(64)}),env);assert.equal(stale.status,409);
 assert.equal((await handler(req('/api/atlas-session','DELETE',cookies),env)).status,200);
 assert.equal((await handler(req('/api/atlas-private-ui','GET',cookies),env)).status,403);
});
test('revoking identity during source read withholds the result',async()=>{
 const {db,store}=fixture(),identity='a'.repeat(43),key=`atlas:google:identity:${sha(identity)}`,idCookie=`__Host-atlas_google_identity=${identity}`;
 db.set(key,JSON.stringify({sub:'owner',exp:Date.now()+3590000}));
 const handler=createVercelPrivate({store,asset:async()=>null,readBytes:async()=>{db.delete(key);const raw=Buffer.from(JSON.stringify(makePrivateTowerFixture()));return {raw,transport:{revision_id:'rev',body_sha256:'b'.repeat(64),size:raw.length}};}});
 const make=(path,method,cookie,data)=>new Request(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(data)});
 const setup=await handler(make('/api/atlas-pin/setup','POST',idCookie,{pin:'synthetic-password'}),env);
 const cookies=idCookie+'; '+setup.headers.get('set-cookie').split(';')[0];
 assert.equal((await handler(make('/api/atlas-private','POST',cookies,{}),env)).status,403);
});
