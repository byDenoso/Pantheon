import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const SESSION_SECONDS=3600;
const COOKIE='__Host-atlas_session';
const sha=value=>createHash('sha256').update(value).digest('hex');
const HASH=/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
const cookie=value=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${value?SESSION_SECONDS:0}`;
export function atlasConfigured(env){
  try{return HASH.test(env.NEXO_ATLAS_PIN_HASH||'')&&new URL(env.NEXO_ATLAS_ORIGIN).origin===env.NEXO_ATLAS_ORIGIN&&new URL(env.NEXO_ATLAS_ORIGIN).protocol==='https:'&&new URL(env.NEXO_ATLAS_REDIS_URL).protocol==='https:'&&Boolean(env.NEXO_ATLAS_REDIS_TOKEN);}catch{return false;}
}
export function atlasSameOrigin(req,env){return req.headers?.origin===env.NEXO_ATLAS_ORIGIN&&(!req.headers?.['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin');}
function sessionToken(req){
  const entries=String(req.headers?.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(`${COOKIE}=`));
  if(entries.length!==1)return '';
  const token=entries[0].slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(token)?token:'';
}
// Shared Redis-compatible REST storage: no in-process fallback. Atomic Lua
// reservation counts every attempt (including successes) across all instances.
export function atlasStore(env,fetcher=fetch){
  return async (...command)=>{
    const response=await fetcher(env.NEXO_ATLAS_REDIS_URL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${env.NEXO_ATLAS_REDIS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(command)});
    if(!response.ok)throw new Error('AUTH_STORE_UNAVAILABLE');
    const result=await response.json();
    if(!result||typeof result!=='object'||result.error||!Object.hasOwn(result,'result'))throw new Error('AUTH_STORE_UNAVAILABLE');
    return result.result;
  };
}
async function revoke(store,token){
  const deleted=await store('DEL',`atlas:session:${sha(token)}`);
  if(deleted!==0&&deleted!==1)throw new Error('AUTH_STORE_UNAVAILABLE');
}
const RESERVE="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
export async function readAtlasSession(req,env,now=Date.now(),store=atlasStore(env)){
  if(!atlasConfigured(env))return null;
  const token=sessionToken(req);if(!token)return null;
  const stored=await store('GET',`atlas:session:${sha(token)}`);
  if(!stored)return null;
  try{
    const session=JSON.parse(stored);
    return Number.isSafeInteger(session.exp)&&session.exp>now&&session.exp<=now+SESSION_SECONDS*1000&&session.credential===sha(env.NEXO_ATLAS_PIN_HASH)?{expiresAt:new Date(session.exp).toISOString()}:null;
  }catch{return null;}
}
export async function atlasAuthenticated(req,env,now=Date.now(),store=atlasStore(env)){
  return Boolean(await readAtlasSession(req,env,now,store));
}
export async function atlasSessionRoute(req,env,now=Date.now(),body={},store=atlasStore(env)){
  const result=(status,body,setCookie)=>({status,body,setCookie});
  const configured=atlasConfigured(env);
  if(req.method==='GET'){
    const session=configured?await readAtlasSession(req,env,now,store):null;
    return result(200,{configured,authenticated:Boolean(session),...(session||{})});
  }
  if(!['POST','DELETE'].includes(req.method))return result(405,{error:'METHOD_NOT_ALLOWED'});
  if(!configured)return result(503,{error:'AUTH_NOT_CONFIGURED'});
  if(!atlasSameOrigin(req,env))return result(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(req.method==='DELETE'){
    const token=sessionToken(req);
    if(token)await revoke(store,token);
    return result(200,{authenticated:false},cookie(''));
  }
  if(!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))return result(415,{error:'JSON_REQUIRED'});
  // A global budget cannot be bypassed with spoofed proxy headers. It deliberately
  // trades login availability for brute-force protection for this single user.
  const attempts=await store('EVAL',RESERVE,1,'atlas:login:global',900);
  if(!Number.isSafeInteger(attempts)||attempts<1)throw new Error('AUTH_STORE_UNAVAILABLE');
  if(attempts>5)return result(429,{error:'RATE_LIMITED',retryAfter:900});
  const pin=body?.pin;
  if(typeof pin!=='string'||pin.length<8||pin.length>128)return result(401,{error:'AUTH_REQUIRED'});
  const [,salt,expected]=env.NEXO_ATLAS_PIN_HASH.split('$');
  const actual=await derive(pin,salt,64);
  if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))return result(401,{error:'AUTH_REQUIRED'});
  const token=randomBytes(32).toString('hex');
  const saved=await store('SET',`atlas:session:${sha(token)}`,JSON.stringify({exp:now+SESSION_SECONDS*1000,credential:sha(env.NEXO_ATLAS_PIN_HASH)}),'EX',SESSION_SECONDS,'NX');
  if(saved!=='OK')throw new Error('AUTH_STORE_UNAVAILABLE');
  // Rotation revokes the previous browser session rather than merely replacing it.
  const previous=sessionToken(req);if(previous)await revoke(store,previous);
  return result(200,{authenticated:true,expiresAt:new Date(now+SESSION_SECONDS*1000).toISOString()},cookie(token));
}
