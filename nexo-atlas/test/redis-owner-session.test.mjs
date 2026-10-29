import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerSessionRoute,readOwner,readOwnerSession} from '../worker/redis-owner-session.mjs';
const origin='https://nexo-one-two.vercel.app',env={NEXO_ATLAS_ORIGIN:origin,NEXO_ATLAS_OWNER_SUB:'owner'},identity={sub:'owner'},now=1800000000000;
function fixture(){const db=new Map();return async(op,...a)=>{if(op==='GET')return db.get(a[0])||null;if(op==='SET'){if(a.includes('NX')&&db.has(a[0]))return null;db.set(a[0],a[1]);return 'OK';}if(op==='DEL')return db.delete(a[0])?1:0;if(op==='EVAL'){const key=a[2],n=Number(db.get(key)||0)+1;db.set(key,n);return n;}throw Error('unexpected');};}
function request(method='POST',cookie='',requestOrigin=origin){return new Request(origin+'/api/atlas-session',{method,headers:{origin:requestOrigin,'content-type':'application/json',cookie}});}
test('owner setup, PIN, session and revocation',async()=>{
 const store=fixture();assert.equal((await readOwner(identity,store)).setupRequired,true);
 const setup=await ownerSessionRoute(request(),env,identity,store,{pin:'synthetic-password'},now,true);assert.equal(setup.status,200);
 const session=setup.setCookie.split(';')[0];assert.ok(await readOwnerSession(request('GET',session),identity,store,now));
 assert.equal(await readOwnerSession(request('GET',session),identity,store,now+3600000),null);
 assert.equal((await ownerSessionRoute(request(),env,identity,store,{pin:'incorrect'},now)).status,401);
 assert.equal((await ownerSessionRoute(request(),env,{sub:'other'},store,{pin:'synthetic-password'},now)).status,403);
 assert.equal((await ownerSessionRoute(request('POST','', 'https://evil.invalid'),env,identity,store,{pin:'synthetic-password'},now)).status,403);
 assert.equal((await ownerSessionRoute(request('DELETE',session),env,identity,store,{},now)).status,200);
 assert.equal(await readOwnerSession(request('GET',session),identity,store,now),null);
});
