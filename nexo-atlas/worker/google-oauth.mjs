import {createHash, randomBytes} from 'node:crypto';
import {verifyGoogleOwner} from './google-identity.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const FLOW = '__Host-atlas_google_flow';
const IDENTITY = '__Host-atlas_google_identity';
const valueOf = (request, name) => {
  const found = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  const value = found.length === 1 ? found[0].slice(name.length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
};
const cookie = (name, value, age, sameSite='Strict') => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=${age}`;
const validOrigin = env => env.NEXO_ATLAS_ORIGIN === 'https://nexo-one-two.vercel.app';
const response = (status, body, headers={}) => Response.json(body, {status, headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});

// store is a server-side Redis command function; state is consumed atomically.
export async function startGoogleLogin(request, env, store) {
  if (request.method !== 'GET') return response(405,{error:'METHOD_NOT_ALLOWED'});
  if (!validOrigin(env) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.NEXO_ATLAS_OWNER_SUB) return response(503,{error:'AUTH_NOT_CONFIGURED'});
  const state=random(), nonce=random(), verifier=random(), flow=random();
  const saved=await store('SET', `atlas:google:flow:${digest(flow)}`, JSON.stringify({state,nonce,verifier}), 'EX', 300, 'NX');
  if (saved !== 'OK') throw new Error('AUTH_STORE_UNAVAILABLE');
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.NEXO_ATLAS_ORIGIN+'/api/auth/google/callback',response_type:'code',scope:'openid email',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'}).toString();
  return new Response(null,{status:302,headers:{Location:url.toString(),'Set-Cookie':cookie(FLOW,flow,300,'Lax'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}

export async function finishGoogleLogin(request, env, store, fetcher=fetch, now=Date.now()) {
  if (request.method !== 'GET') return response(405,{error:'METHOD_NOT_ALLOWED'});
  if (!validOrigin(env)) return response(503,{error:'AUTH_NOT_CONFIGURED'});
  const flow=valueOf(request,FLOW), url=new URL(request.url), state=url.searchParams.get('state'), code=url.searchParams.get('code');
  if (!flow || !state || !code || code.length>4096 || url.searchParams.getAll('state').length!==1 || url.searchParams.getAll('code').length!==1) return response(403,{error:'AUTH_REQUIRED'});
  const saved=await store('GETDEL',`atlas:google:flow:${digest(flow)}`);
  let pending; try {pending=JSON.parse(saved);} catch {return response(403,{error:'AUTH_REQUIRED'});}
  if (!pending || pending.state!==state || !pending.verifier || !pending.nonce) return response(403,{error:'AUTH_REQUIRED'});
  const result=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.NEXO_ATLAS_ORIGIN+'/api/auth/google/callback',grant_type:'authorization_code',code_verifier:pending.verifier}),signal:AbortSignal.timeout(10000)});
  if (!result.ok) return response(403,{error:'AUTH_REQUIRED'});
  const tokens=await result.json();
  const owner=await verifyGoogleOwner(tokens.id_token,env,fetcher,now,pending.nonce);
  if (!owner) return response(403,{error:'AUTH_REQUIRED'});
  const identity=random();
  const written=await store('SET',`atlas:google:identity:${digest(identity)}`,JSON.stringify({sub:owner.sub,exp:now+3600000}),'EX',3600,'NX');
  if (written!=='OK') throw new Error('AUTH_STORE_UNAVAILABLE');
  const headers=new Headers({Location:'/atlas-v67/#/privado','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  headers.append('Set-Cookie',cookie(FLOW,'',0,'Lax'));
  headers.append('Set-Cookie',cookie(IDENTITY,identity,3600));
  return new Response(null,{status:302,headers});
}

export async function readGoogleIdentity(request, env, store, now=Date.now()) {
  const identity=valueOf(request,IDENTITY); if (!identity) return null;
  const stored=await store('GET',`atlas:google:identity:${digest(identity)}`);
  try {const row=JSON.parse(stored); return row?.sub===env.NEXO_ATLAS_OWNER_SUB && Number.isSafeInteger(row.exp) && row.exp>now && row.exp<=now+3600000 ? {sub:row.sub} : null;} catch {return null;}
}

export async function revokeGoogleIdentity(request, store) {
  const identity=valueOf(request,IDENTITY); if (identity) await store('DEL',`atlas:google:identity:${digest(identity)}`);
  return cookie(IDENTITY,'',0);
}
