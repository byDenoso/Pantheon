import type { AtlasSession } from './auth';

const TOKEN_KEY='nexo_google_id_token';

type Claims={email?:string;exp?:number};

function decodePart(value:string):string{
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return decodeURIComponent(Array.from(atob(padded)).map(char=>`%${char.charCodeAt(0).toString(16).padStart(2,'0')}`).join(''));
}

function claimsFromToken(token:string):Claims|null{
  try{
    const parts=token.split('.');
    if(parts.length<2)return null;
    const claims=JSON.parse(decodePart(parts[1])) as Claims;
    return claims&&typeof claims==='object'?claims:null;
  }catch{return null;}
}

export function storeGoogleCredential(token:string):AtlasSession|null{
  const value=String(token||'').trim();
  const claims=claimsFromToken(value);
  if(!value||!claims?.email||!Number.isFinite(claims.exp))return null;
  sessionStorage.setItem(TOKEN_KEY,value);
  return {email:claims.email,expiresAt:Number(claims.exp)*1000};
}

export function clearStoredGoogleSession(){
  try{sessionStorage.removeItem(TOKEN_KEY);}catch{/* best effort */}
}

export function getStoredGoogleCredential():string|null{
  try{return sessionStorage.getItem(TOKEN_KEY);}catch{return null;}
}

export function readStoredGoogleSession(now=Date.now()):AtlasSession|null{
  const token=getStoredGoogleCredential();
  if(!token)return null;
  const claims=claimsFromToken(token);
  const expiresAt=Number(claims?.exp||0)*1000;
  if(!claims?.email||!expiresAt||expiresAt<=now){clearStoredGoogleSession();return null;}
  return {email:claims.email,expiresAt};
}

export async function authenticatedFetch(input:RequestInfo|URL,init:RequestInit={}):Promise<Response>{
  const token=getStoredGoogleCredential();
  if(!token)throw new Error('AUTH_REQUIRED');
  return fetch(input,{...init,headers:{Accept:'application/json',...init.headers,Authorization:`Bearer ${token}`}});
}

export async function semanticCommand(command:string,args:Record<string,unknown>={}):Promise<unknown>{
  const response=await authenticatedFetch('/api/private/semantic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,args})});
  const payload=await response.json().catch(()=>({error:`HTTP_${response.status}`}));
  if(!response.ok)throw new Error(String(payload?.error||`HTTP_${response.status}`));
  return payload;
}
