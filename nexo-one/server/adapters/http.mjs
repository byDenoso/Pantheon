export class ProviderError extends Error { constructor(code) {super(code);this.code=code;} }
export async function json(url,{token,signal,method='GET',body,headers={}}={}) {
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password) throw new ProviderError('UNAVAILABLE');
  const response=await fetch(u,{method,redirect:'error',signal,headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},body});
  if(!response.ok) throw new ProviderError(response.status===401||response.status===403&&response.headers.get('x-ratelimit-remaining')!=='0'?'AUTH_REQUIRED':response.status===429||response.status===403?'RATE_LIMITED':'UNAVAILABLE');
  return response.json();
}
export function requireEnv(env,...keys) {if(keys.some(k=>!env[k])) throw new ProviderError('AUTH_REQUIRED');}
export function item(provider,id,title,sourceRef,now,extra={}) {
  const observedAt=new Date(now).toISOString();
  return {id:`${provider}:${id}`,kind:'ENTITY',title,source:provider,sourceRef,authority:'PROVIDER',freshness:{state:'LIVE',observedAt,expiresAt:new Date(now+300000).toISOString()},attention:'NOTICE',observedAt,actions:[{id:'open',kind:'OPEN_SOURCE',label:'Abrir na fonte',url:sourceRef}],...extra};
}
export function inferContext(text,fallback='PERSONAL') {
  if(/olympus|check.?in|miqu[eé]ias|renilde/i.test(text))return'OLYMPUS';
  if(/camb|cosmolog|dark energy|dark matter|peer5|hubble/i.test(text))return'COSMOLOGY';
  if(/nexo|ssot|action_register/i.test(text))return'NEXO';
  return fallback;
}
