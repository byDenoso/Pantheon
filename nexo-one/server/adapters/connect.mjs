import {json,requireEnv,ProviderError} from './http.mjs';

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

export async function googleConnectToken(env,signal,{scopes=GOOGLE_READ_SCOPES}={}){
  requireEnv(env,'GOOGLE_CONNECTOR','VERCEL_OIDC_TOKEN');
  const data=await json(connectorUrl(env.GOOGLE_CONNECTOR),{
    token:env.VERCEL_OIDC_TOKEN,
    signal,
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({subject:googleSubject(env),scopes:boundedScopes(scopes)})
  });
  if(typeof data.token!=='string'||!data.token)throw new ProviderError('AUTH_REQUIRED');
  return data.token;
}
