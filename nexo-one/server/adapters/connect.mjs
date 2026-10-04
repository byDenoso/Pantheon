import {ProviderError} from './http.mjs';

export const GOOGLE_READ_SCOPES=Object.freeze([
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
]);

export const GOOGLE_WRITE_SCOPES=Object.freeze({
  sheets:Object.freeze(['https://www.googleapis.com/auth/spreadsheets']),
  gmailDraft:Object.freeze(['https://www.googleapis.com/auth/gmail.compose']),
  calendarEvent:Object.freeze(['https://www.googleapis.com/auth/calendar.events'])
});

function connectorUrl(value){
  if(typeof value!=='string'||!value.trim())throw new ProviderError('AUTH_REQUIRED');
  const parts=value.trim().split('/');
  if(parts.some(part=>!part||!/^[A-Za-z0-9._-]+$/.test(part)))throw new ProviderError('AUTH_REQUIRED');
  return `https://api.vercel.com/v1/connect/token/${encodeURIComponent(value.trim())}`;
}

function boundedScopes(scopes){
  if(!Array.isArray(scopes)||!scopes.length||scopes.some(scope=>typeof scope!=='string'||!scope.startsWith('https://www.googleapis.com/auth/')))throw new ProviderError('AUTH_REQUIRED');
  return [...new Set(scopes)];
}

function googleSubject(env){
  // This is the existing single-user binding, never a request-controlled identity.
  const id=env.GOOGLE_CONNECT_SUBJECT_ID===undefined?'owner':env.GOOGLE_CONNECT_SUBJECT_ID;
  if(typeof id!=='string'||!id||id.length>256||/[\s\u0000-\u001f\u007f]/u.test(id))throw new ProviderError('AUTH_REQUIRED');
  return {type:'user',id};
}

export const GOOGLE_AUTH_DIAGNOSTICS=Object.freeze([
  'CONNECTOR_MISSING','CONNECTOR_INVALID','OIDC_MISSING','OIDC_INVALID',
  'CONNECT_UNAUTHORIZED','CONNECT_FORBIDDEN','CONNECT_NO_TOKEN',
  'CONNECT_USER_AUTHORIZATION_REQUIRED','CONNECT_INSTALLATION_REQUIRED',
  'CONNECT_RATE_LIMITED','CONNECT_UNAVAILABLE','CONNECT_INVALID_RESPONSE'
]);

export function googleRuntimeEnvironment(env,headers){
  // Match the official OIDC SDK: request identity precedes a build-time value.
  // The provider still verifies the token; this never creates an identity.
  const token=headers?.['x-vercel-oidc-token'];
  return typeof token==='string'&&token?{...env,VERCEL_OIDC_TOKEN:token}:env;
}

function authError(code,googleDiagnostic){
  return Object.assign(new ProviderError(code),{googleDiagnostic});
}

async function boundedJson(response){
  const reader=response.body?.getReader();
  if(!reader)throw new Error('empty_response');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let text='',size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>65536)throw new Error('response_limit');
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    return JSON.parse(text);
  }finally{await reader.cancel().catch(()=>{});}
}

export async function googleConnectToken(env,signal,{scopes=GOOGLE_READ_SCOPES}={}){
  if(!env.GOOGLE_CONNECTOR)throw authError('AUTH_REQUIRED','CONNECTOR_MISSING');
  let url;
  try{url=connectorUrl(env.GOOGLE_CONNECTOR);}
  catch{throw authError('AUTH_REQUIRED','CONNECTOR_INVALID');}
  if(!env.VERCEL_OIDC_TOKEN)throw authError('AUTH_REQUIRED','OIDC_MISSING');
  if(typeof env.VERCEL_OIDC_TOKEN!=='string'||env.VERCEL_OIDC_TOKEN.length>16384||/[\s\u0000-\u001f\u007f]/u.test(env.VERCEL_OIDC_TOKEN))
    throw authError('AUTH_REQUIRED','OIDC_INVALID');
  const body=JSON.stringify({subject:googleSubject(env),scopes:boundedScopes(scopes)});
  let response;
  try{
    response=await fetch(url,{
      method:'POST',redirect:'error',signal:signal??AbortSignal.timeout(10000),
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${env.VERCEL_OIDC_TOKEN}`},body
    });
  }catch{throw authError('UNAVAILABLE','CONNECT_UNAVAILABLE');}
  let data;
  try{data=await boundedJson(response);}
  catch{/* An unreadable provider body cannot hide its HTTP authorization failure. */}
  if(!response.ok){
    const limited=response.status===429||(response.status===403&&response.headers.get('x-ratelimit-remaining')==='0');
    const code=limited?'RATE_LIMITED':[401,403].includes(response.status)?'AUTH_REQUIRED':'UNAVAILABLE';
    const known={no_token:'CONNECT_NO_TOKEN',user_authorization_required:'CONNECT_USER_AUTHORIZATION_REQUIRED',
      client_installation_required:'CONNECT_INSTALLATION_REQUIRED',connector_installation_required:'CONNECT_INSTALLATION_REQUIRED'};
    const providerCode=data?.error?.code??data?.err?.code;
    const detail=typeof providerCode==='string'&&Object.hasOwn(known,providerCode)?known[providerCode]:null;
    const diagnostic=limited?'CONNECT_RATE_LIMITED':detail??(response.status===401?'CONNECT_UNAUTHORIZED':response.status===403?'CONNECT_FORBIDDEN':'CONNECT_UNAVAILABLE');
    throw authError(code,diagnostic);
  }
  if(typeof data?.token!=='string'||!data.token)throw authError('AUTH_REQUIRED','CONNECT_INVALID_RESPONSE');
  return data.token;
}
