import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {atlasSessionRoute} from '../server/auth/atlas-session.mjs';
import {googleDriveConsentRoute} from '../server/auth/google-drive-consent.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {makeSession} from '../server/auth/session.mjs';

const now=Date.now(),salt='7'.repeat(32),pin='synthetic-cockpit-pass';
const env={NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync(pin,salt,64).toString('hex')}`,
  NEXO_ATLAS_ORIGIN:'https://nexo-one-two.vercel.app',NEXO_ATLAS_REDIS_URL:'https://store.invalid',NEXO_ATLAS_REDIS_TOKEN:'synthetic',
  NEXO_SESSION_SECRET:'synthetic-signing-secret-at-least-32-characters',
  GOOGLE_CONNECTOR:'google/alizarin-saddle',VERCEL_ENV:'production',VERCEL_OIDC_TOKEN:'synthetic-oidc'};
const headers={host:'nexo-one-two.vercel.app',origin:env.NEXO_ATLAS_ORIGIN,'content-type':'application/json'};

test('Google connection accepts the current cockpit login without a legacy password and rejects revoked sessions',async()=>{
  const records=new Map();
  const store=async(op,key,...args)=>{
    if(op==='EVAL')return 1;
    if(op==='SET'){records.set(key,args[0]);return 'OK';}
    if(op==='GET')return records.get(key)||null;
    if(op==='DEL')return Number(records.delete(key));
    throw new Error('unexpected storage operation');
  };
  const logged=await atlasSessionRoute({method:'POST',headers},env,now,{pin},store);
  assert.equal(logged.status,200);
  const req={method:'GET',headers:{...headers,cookie:logged.setCookie.split(';')[0]}};
  const prepared=await googleDriveConsentRoute(req,env,now,{store});
  assert.equal(prepared.status,200);
  assert.ok(prepared.body.csrfToken);
  assert.equal((await googleDriveConsentRoute(req,env,now+3600001,{store})).status,401);
  assert.equal((await googleDriveConsentRoute(req,{...env,NEXO_ATLAS_PIN_HASH:env.NEXO_ATLAS_PIN_HASH.replace(/7/g,'8')},now,{store})).status,401);
  const duplicate={...req,headers:{...req.headers,cookie:req.headers.cookie+'; '+req.headers.cookie}};
  assert.equal((await googleDriveConsentRoute(duplicate,env,now,{store})).status,401);
  const legacyEnv={...env,NEXO_PASSWORD_HASH:'configured'};
  const legacy={...req,headers:{...headers,cookie:'nexo_session='+makeSession(legacyEnv,now)}};
  assert.equal((await googleDriveConsentRoute(legacy,legacyEnv,now,{store})).status,401);
  const denied=await googleDriveConsentRoute({...req,headers},env,now,{store});
  assert.equal(denied.status,401);
  await atlasSessionRoute({...req,method:'DELETE'},env,now,{},store);
  assert.equal((await googleDriveConsentRoute(req,env,now,{store})).status,401);
});

test('connection page restores the cockpit session, shows an expired login, and submits the cockpit PIN',async()=>{
  const source=await readFile(new URL('../public/google-drive-connect.js',import.meta.url),'utf8');
  const nodes=new Map(),calls=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,value:'',checked:false,textContent:'',
      addEventListener(event,fn){this[event]=fn;},removeAttribute(name){delete this[name];},querySelector(){return element(id+'-button');}});
    return nodes.get(id);
  };
  let phase='restore';
  const fetcher=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/api/atlas-session')return Response.json({authenticated:true});
    if(path==='/api/google-drive-consent'){
      if(phase==='expired')return Response.json({error:'AUTH_REQUIRED'},{status:401});
      return Response.json({csrfToken:'synthetic',csrfTokens:{},canVerify:false});
    }
    throw new Error('Unexpected endpoint '+path);
  };
  vm.runInNewContext(source,{document:{getElementById:element},fetch:fetcher,URL,setTimeout,clearTimeout});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  await settle();await settle();
  assert.equal(element('login-section').hidden,true);
  assert.equal(element('consent-section').hidden,false);
  element('authorization').hidden=false;element('authorization').href='https://connect.vercel.com/authorize/old-session';
  phase='expired';element('approve').checked=true;
  await element('consent-form').submit({preventDefault(){}});
  assert.equal(element('login-section').hidden,false);
  assert.equal(element('consent-section').hidden,true);
  assert.equal(element('sheets-section').hidden,true);
  assert.equal(element('authorization').hidden,true);
  assert.equal(element('authorization').href,undefined);
  assert.equal(element('approve').checked,false);
  phase='restore';element('password').value='synthetic-cockpit-pass';
  await element('login-form').submit({preventDefault(){}});
  const login=calls.find(c=>c.path==='/api/atlas-session'&&c.options.method==='POST');
  assert.deepEqual(JSON.parse(login.options.body),{pin:'synthetic-cockpit-pass'});
  assert.equal(element('password').value,'');
  assert.equal(element('consent-section').hidden,false);
  assert.ok(calls.every(c=>c.path!=='/api/session'));
});
