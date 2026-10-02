import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeSession,authenticated,verifyPassword,sameOrigin,cookie,configured} from '../server/auth/session.mjs';
import handler from '../server/handler.mjs';
import {readFile,readdir} from 'node:fs/promises';
const now=Date.parse('2026-09-09T12:00:00Z'),salt='1'.repeat(32),password='test-only-long-password';
const env={NEXO_SESSION_SECRET:'test-only-secret-at-least-32-characters',NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`};

test('valid session authenticates, tampering and expiry are rejected',()=>{
  const token=makeSession(env,now),req={headers:{cookie:`nexo_session=${token}`}};assert.equal(authenticated(req,env,now),true);assert.equal(authenticated({headers:{cookie:`nexo_session=${token}x`}},env,now),false);assert.equal(authenticated(req,env,now+9*3600000),false);assert.equal(authenticated(req,{},now),false);
});
test('password verification is hashed; malformed hashes fail closed',()=>{assert.equal(verifyPassword(password,env.NEXO_PASSWORD_HASH),true);assert.equal(verifyPassword('wrong',env.NEXO_PASSWORD_HASH),false);assert.equal(verifyPassword(password,'scrypt$bad$bad'),false);assert.equal(configured({...env,NEXO_SESSION_SECRET:'short'}),false);});
test('cross-origin login/logout is denied; cookies are httpOnly sameSite secure in deployment',()=>{assert.equal(sameOrigin({headers:{host:'nexo-one.vercel.app',origin:'https://evil.com'}}),false);assert.equal(sameOrigin({headers:{host:'nexo-one.vercel.app',origin:'https://nexo-one.vercel.app'}}),true);assert.match(cookie('x',{headers:{host:'nexo-one.vercel.app'}}),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/);});

async function callHandler({method='GET',url='/api/session',headers={},body=null}={}){
  const responseHeaders={};let text='';
  const req={
    method,url,headers:{host:'nexo-one.vercel.app',...headers},signal:undefined,
    async *[Symbol.asyncIterator](){if(body!==null)yield Buffer.from(JSON.stringify(body));}
  };
  const res={
    statusCode:200,destroyed:false,
    setHeader(name,value){responseHeaders[String(name).toLowerCase()]=value;},
    write(chunk){text+=String(chunk);},
    end(chunk=''){text+=String(chunk);}
  };
  await handler(req,res);
  return {status:res.statusCode,headers:responseHeaders,body:text?JSON.parse(text):null};
}

test('handler restores private session binding instead of hardcoding PUBLIC mode',async()=>{
  const previous={secret:process.env.NEXO_SESSION_SECRET,hash:process.env.NEXO_PASSWORD_HASH};
  process.env.NEXO_SESSION_SECRET=env.NEXO_SESSION_SECRET;
  process.env.NEXO_PASSWORD_HASH=env.NEXO_PASSWORD_HASH;
  try{
    const token=makeSession(env,Date.now());
    const result=await callHandler({headers:{cookie:`nexo_session=${token}`}});
    assert.equal(result.status,200);
    assert.equal(result.body.configured,true);
    assert.equal(result.body.authenticated,true);
    assert.equal(result.body.access,'PRIVATE');
  }finally{
    if(previous.secret===undefined)delete process.env.NEXO_SESSION_SECRET;else process.env.NEXO_SESSION_SECRET=previous.secret;
    if(previous.hash===undefined)delete process.env.NEXO_PASSWORD_HASH;else process.env.NEXO_PASSWORD_HASH=previous.hash;
  }
});

test('handler login creates a signed session only for same-origin valid password',async()=>{
  const previous={secret:process.env.NEXO_SESSION_SECRET,hash:process.env.NEXO_PASSWORD_HASH};
  process.env.NEXO_SESSION_SECRET=env.NEXO_SESSION_SECRET;
  process.env.NEXO_PASSWORD_HASH=env.NEXO_PASSWORD_HASH;
  try{
    const result=await callHandler({method:'POST',headers:{origin:'https://nexo-one.vercel.app'},body:{password}});
    assert.equal(result.status,200);
    assert.equal(result.body.authenticated,true);
    assert.equal(result.body.access,'PRIVATE');
    assert.match(String(result.headers['set-cookie']||''),/^nexo_session=.*HttpOnly/);
  }finally{
    if(previous.secret===undefined)delete process.env.NEXO_SESSION_SECRET;else process.env.NEXO_SESSION_SECRET=previous.secret;
    if(previous.hash===undefined)delete process.env.NEXO_PASSWORD_HASH;else process.env.NEXO_PASSWORD_HASH=previous.hash;
  }
});

test('frontend never imports server implementations or references secret env keys',async()=>{
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(path);else if(/\.(tsx?|mjs)$/.test(path)){const text=await readFile(path,'utf8');assert.doesNotMatch(text,/from ['"][^'"]*server\//);assert.doesNotMatch(text,/GOOGLE_REFRESH_TOKEN|GOOGLE_CLIENT_SECRET|VERCEL_READ_TOKEN|GITHUB_TOKEN|NEXO_SESSION_SECRET/);}}}await walk(fileURLToPath(new URL('../src/',import.meta.url)));
});
