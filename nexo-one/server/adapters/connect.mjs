import {json,requireEnv,ProviderError} from './http.mjs';

export const GOOGLE_READ_SCOPES=Object.freeze([
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
]);

function connectorUrl(value){
  if(typeof value!=='string'||!value.trim())throw new ProviderError('AUTH_REQUIRED');
  const parts=value.trim().split('/');
  if(parts.some(part=>!part||!/^[A-Za-z0-9._-]+$/.test(part)))throw new ProviderError('AUTH_REQUIRED');
  return `https://api.vercel.com/v1/connect/token/${parts.map(encodeURIComponent).join('/')}`;
}

function scopes(readScopes,writeScopes){
  return [...new Set([...(readScopes||GOOGLE_READ_SCOPES),...(writeScopes||[])])];
}

export async function googleConnectToken(env,signal,{writeScopes=[],readScopes=GOOGLE_READ_SCOPES}={}){
  requireEnv(env,'GOOGLE_CONNECTOR','VERCEL_OIDC_TOKEN');
  const data=await json(connectorUrl(env.GOOGLE_CONNECTOR),{
    token:env.VERCEL_OIDC_TOKEN,
    signal,
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      subject:{type:'user',id:env.GOOGLE_CONNECT_SUBJECT_ID||'owner'},
      scopes:scopes(readScopes,writeScopes)
    })
  });
  if(typeof data.token!=='string'||!data.token)throw new ProviderError('AUTH_REQUIRED');
  return data.token;
}
