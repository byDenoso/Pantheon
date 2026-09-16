import { withGoogleAuth, originAllowed, send } from '../private/_middleware.mjs';
import { clearPinSessionCookie, createPinSession, isPinAuthConfigured, pinSessionCookie, readPinSession, verifyAccessPin } from '../../lib/pin-auth.mjs';

const attempts = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const verifiedSession=withGoogleAuth((req,res)=>{
  send(res,{authenticated:true,method:req.session?.auth||'google',email:req.session?.email||null,expiresAt:req.session?.expiresAt||null});
});

function bearer(req){return /^Bearer\s+.+/i.test(String(req.headers?.authorization||''));}
function remoteKey(req){return String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||'unknown').split(',')[0].trim();}
function rateState(req,now=Date.now()){
  const key=remoteKey(req);const current=attempts.get(key);
  if(!current||now-current.startedAt>ATTEMPT_WINDOW_MS){const fresh={startedAt:now,count:0};attempts.set(key,fresh);return {key,state:fresh};}
  return {key,state:current};
}
function failedAttempt(req){const {key,state}=rateState(req);state.count+=1;attempts.set(key,state);return state.count;}
function clearAttempts(req){attempts.delete(remoteKey(req));}
function readBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  if(typeof req.body==='string'){try{return JSON.parse(req.body)}catch{return {}}}
  return {};
}
function secureRequest(req){return String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()!=='http';}

export default async function authSession(req,res){
  const origin=req.headers?.origin||null;
  if(origin&&!originAllowed(req,origin))return send(res,{error:'CORS_ORIGIN_NOT_ALLOWED'},403);
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');

  const method=String(req.method||'GET').toUpperCase();
  if(method==='OPTIONS'){res.statusCode=204;return res.end?.('');}

  if(method==='GET'){
    const pinSession=readPinSession(req);
    if(pinSession.ok)return send(res,{authenticated:true,method:'pin',expiresAt:pinSession.expiresAt,authConfigured:true});
    if(bearer(req))return verifiedSession(req,res);
    const googleConfigured=Boolean(String(process.env.GOOGLE_CLIENT_ID||'').trim()&&String(process.env.NEXO_ALLOWED_EMAILS||'').trim());
    return send(res,{authenticated:false,authConfigured:isPinAuthConfigured()||googleConfigured,pinConfigured:isPinAuthConfigured(),googleConfigured});
  }

  if(method==='POST'){
    if(!isPinAuthConfigured())return send(res,{error:'AUTH_SETUP_REQUIRED',missing:['NEXO_ACCESS_PIN']},503);
    const {state}=rateState(req);
    if(state.count>=MAX_ATTEMPTS)return send(res,{error:'TOO_MANY_ATTEMPTS'},429);
    const outcome=verifyAccessPin(readBody(req).pin);
    if(!outcome.ok){failedAttempt(req);return send(res,{error:'UNAUTHORIZED',reason:'INVALID_PIN'},401);}
    clearAttempts(req);
    const token=createPinSession();
    res.setHeader('Set-Cookie',pinSessionCookie(token,{secure:secureRequest(req)}));
    return send(res,{authenticated:true,method:'pin'});
  }

  if(method==='DELETE'){
    clearAttempts(req);
    res.setHeader('Set-Cookie',clearPinSessionCookie({secure:secureRequest(req)}));
    return send(res,{authenticated:false});
  }

  return send(res,{error:'METHOD_NOT_ALLOWED'},405);
}
