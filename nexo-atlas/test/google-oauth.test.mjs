import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {startGoogleLogin,finishGoogleLogin,readGoogleIdentity,revokeGoogleIdentity} from '../worker/google-oauth.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),kid:'k',alg:'RS256',use:'sig'};
const env={NEXO_ATLAS_ORIGIN:'https://nexo-one-two.vercel.app',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'synthetic',NEXO_ATLAS_OWNER_SUB:'owner'};
const now=1800000000000;
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function storeFixture(){const db=new Map();return async (op,key,value)=>{if(op==='SET'){if(db.has(key))return null;db.set(key,value);return 'OK';}if(op==='GET')return db.get(key)||null;if(op==='GETDEL'){const val=db.get(key)||null;db.delete(key);return val;}if(op==='DEL')return db.delete(key)?1:0;throw Error('unexpected');};}
test('OAuth state, PKCE, nonce, owner and revocation',async()=>{
  const store=storeFixture(),start=await startGoogleLogin(new Request(env.NEXO_ATLAS_ORIGIN+'/api/auth/google'),env,store);
  assert.equal(start.status,302);
  const auth=new URL(start.headers.get('location')), flow=start.headers.get('set-cookie').split(';')[0], state=auth.searchParams.get('state'),nonce=auth.searchParams.get('nonce');
  const fetcher=async(url,options)=>{
    if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
    assert.equal(url,'https://oauth2.googleapis.com/token');
    assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));
    const h=encode({alg:'RS256',kid:'k'}),p=encode({iss:'https://accounts.google.com',aud:'client',sub:'owner',iat:now/1000,exp:now/1000+3600,nonce});
    return Response.json({id_token:`${h}.${p}.${sign('RSA-SHA256',Buffer.from(`${h}.${p}`),keys.privateKey).toString('base64url')}`});
  };
  const req=new Request(`${env.NEXO_ATLAS_ORIGIN}/api/auth/google/callback?state=${state}&code=synthetic`,{headers:{cookie:flow}});
  const done=await finishGoogleLogin(req,env,store,fetcher,now);assert.equal(done.status,302);
  const identity=done.headers.getSetCookie().find(x=>x.startsWith('__Host-atlas_google_identity=')).split(';')[0];
  const privateReq=new Request(env.NEXO_ATLAS_ORIGIN+'/api/atlas-access',{headers:{cookie:identity}});
  assert.deepEqual(await readGoogleIdentity(privateReq,env,store,now),{sub:'owner'});
  assert.equal((await finishGoogleLogin(req,env,store,fetcher,now)).status,403);
  await revokeGoogleIdentity(privateReq,store);assert.equal(await readGoogleIdentity(privateReq,env,store,now),null);
});
test('missing state and browser-supplied identity cannot authenticate',async()=>{
  const store=storeFixture();
  const req=new Request(env.NEXO_ATLAS_ORIGIN+'/api/auth/google/callback?code=x&state=x',{headers:{'oai-authenticated-user-id':'owner'}});
  assert.equal((await finishGoogleLogin(req,env,store)).status,403);
  assert.equal(await readGoogleIdentity(req,env,store),null);
});
