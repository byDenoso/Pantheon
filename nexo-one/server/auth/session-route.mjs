import {authenticated,configured,cookie,makeSession,sameOrigin,verifyPassword} from './session.mjs';
import {checkLoginAttempt,clearLoginFailures,loginRateLimitKey,recordLoginFailure} from './login-rate-limit.mjs';

const publicState=configuredValue=>({configured:configuredValue,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'});
const privateState=()=>({configured:true,authenticated:true,access:'PRIVATE',mode:'PRIVATE'});

export function sessionAccess(req,env,now=Date.now()){
  return configured(env)&&authenticated(req,env,now);
}

export function sessionRoute(req,env=process.env,now=Date.now(),body={}){
  const isConfigured=configured(env),method=String(req?.method||'GET').toUpperCase();
  if(method==='GET')return {status:200,body:sessionAccess(req,env,now)?privateState():publicState(isConfigured),setCookie:null};
  if(method!=='POST'&&method!=='DELETE')return {status:405,body:{error:'METHOD_NOT_ALLOWED'},setCookie:null};
  if(!sameOrigin(req))return {status:403,body:{error:'ORIGIN_NOT_ALLOWED'},setCookie:null};
  if(method==='DELETE')return {status:200,body:publicState(isConfigured),setCookie:cookie('',req,true)};
  if(!isConfigured)return {status:503,body:{error:'AUTH_NOT_CONFIGURED'},setCookie:null};
  const key=loginRateLimitKey(req),limit=checkLoginAttempt(key,now);
  if(!limit.allowed)return {status:429,body:{error:'RATE_LIMITED'},setCookie:null};
  if(!verifyPassword(String(body?.password||''),env.NEXO_PASSWORD_HASH)){
    recordLoginFailure(key,now);
    return {status:401,body:{error:'AUTH_REQUIRED'},setCookie:null};
  }
  clearLoginFailures(key);
  return {status:200,body:privateState(),setCookie:cookie(makeSession(env,now),req,false)};
}
