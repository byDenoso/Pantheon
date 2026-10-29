import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt), sha=value=>createHash('sha256').update(value).digest('hex');
const COOKIE='__Host-atlas_v67_session', TTL=3600;
const pinPattern=/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
const cookie=value=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${value?TTL:0}`;
const sessionToken=request=>{const rows=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));const v=rows.length===1?rows[0].slice(COOKIE.length+1):'';return /^[a-f0-9]{64}$/.test(v)?v:'';};
const sameOrigin=(request,env)=>new URL(request.url).origin===env.NEXO_ATLAS_ORIGIN&&request.headers.get('origin')===env.NEXO_ATLAS_ORIGIN&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');
const ownerKey='atlas:v67:owner';
const RESERVE="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";

export async function readOwner(identity, store) {
  if (!identity?.sub) return null;
  const raw=await store('GET',ownerKey); if (!raw) return {setupRequired:true};
  let row; try {row=JSON.parse(raw);} catch {throw Error('AUTH_STORE_INVALID');}
  if (row.sub!==identity.sub || !pinPattern.test(row.pinHash)) throw Error('AUTH_STORE_INVALID');
  return {setupRequired:false,pinHash:row.pinHash};
}
export async function readOwnerSession(request, identity, store, now=Date.now()) {
  const owner=await readOwner(identity,store), token=sessionToken(request);
  if (!owner || owner.setupRequired || !token) return null;
  const raw=await store('GET',`atlas:v67:session:${sha(token)}`);
  try {const row=JSON.parse(raw);return row?.sub===identity.sub&&row.credential===sha(owner.pinHash)&&Number.isSafeInteger(row.exp)&&row.exp>now&&row.exp<=now+TTL*1000?{expiresAt:new Date(row.exp).toISOString()}:null;} catch {return null;}
}
export async function ownerSessionRoute(request, env, identity, store, body={}, now=Date.now(), setup=false) {
  const result=(status,body,setCookie)=>({status,body,setCookie});
  if (!identity?.sub || identity.sub!==env.NEXO_ATLAS_OWNER_SUB) return result(403,{error:'OWNER_REQUIRED'});
  const owner=await readOwner(identity,store);
  if (request.method==='GET'&&!setup) {const session=await readOwnerSession(request,identity,store,now);return result(200,{configured:!owner.setupRequired,authenticated:Boolean(session),...(session||{})});}
  if (!['POST','DELETE'].includes(request.method) || setup&&request.method!=='POST') return result(405,{error:'METHOD_NOT_ALLOWED'});
  if (!sameOrigin(request,env)) return result(403,{error:'ORIGIN_NOT_ALLOWED'});
  const previous=sessionToken(request);
  if (request.method==='DELETE') {if(previous) await store('DEL',`atlas:v67:session:${sha(previous)}`);return result(200,{authenticated:false},cookie(''));}
  if ((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json') return result(415,{error:'JSON_REQUIRED'});
  if (setup!==owner.setupRequired) return result(409,{error:setup?'PIN_ALREADY_CONFIGURED':'PIN_SETUP_REQUIRED'});
  const attempts=await store('EVAL',RESERVE,1,'atlas:v67:login:global',900);
  if (!Number.isSafeInteger(attempts)||attempts<1) throw Error('AUTH_STORE_UNAVAILABLE');
  if (attempts>5) return result(429,{error:'RATE_LIMITED',retryAfter:900});
  if (typeof body.pin!=='string'||body.pin.length<8||body.pin.length>128) return result(401,{error:'AUTH_REQUIRED'});
  let pinHash=owner.pinHash;
  if (setup) {
    const salt=randomBytes(16).toString('hex'),key=await derive(body.pin,salt,64);
    pinHash=`scrypt$${salt}$${key.toString('hex')}`;
    if (await store('SET',ownerKey,JSON.stringify({sub:identity.sub,pinHash}),'NX')!=='OK') return result(409,{error:'PIN_ALREADY_CONFIGURED'});
  } else {
    const [,salt,expected]=pinHash.split('$'),key=await derive(body.pin,salt,64);
    if (!timingSafeEqual(key,Buffer.from(expected,'hex'))) return result(401,{error:'AUTH_REQUIRED'});
  }
  const token=randomBytes(32).toString('hex'),exp=now+TTL*1000;
  if(await store('SET',`atlas:v67:session:${sha(token)}`,JSON.stringify({sub:identity.sub,credential:sha(pinHash),exp}),'EX',TTL,'NX')!=='OK') throw Error('AUTH_STORE_UNAVAILABLE');
  if(previous)await store('DEL',`atlas:v67:session:${sha(previous)}`);
  return result(200,{authenticated:true,expiresAt:new Date(exp).toISOString()},cookie(token));
}
