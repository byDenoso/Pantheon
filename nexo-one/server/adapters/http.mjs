export class ProviderError extends Error {
  constructor(code,{status=null,attempts=1}={}) {
    super(code);this.code=code;this.status=status;this.attempts=attempts;
  }
}

const GITHUB_RETRY_DELAYS_MS=[0,750,2500,6000];
const githubHost=hostname=>hostname==='api.github.com'||hostname==='raw.githubusercontent.com';
const retryableGithubStatus=status=>[404,408,425,429,500,502,503,504].includes(status);

function wait(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(Object.assign(new Error('AbortError'),{name:'AbortError'}));
    const timer=setTimeout(resolve,ms);
    signal?.addEventListener('abort',()=>{
      clearTimeout(timer);
      reject(Object.assign(new Error('AbortError'),{name:'AbortError'}));
    },{once:true});
  });
}

function providerCode(response){
  if(response.status===401)return'AUTH_REQUIRED';
  if(response.status===403&&response.headers.get('x-ratelimit-remaining')!=='0')return'AUTH_REQUIRED';
  if(response.status===429||response.status===403)return'RATE_LIMITED';
  return'UNAVAILABLE';
}

export async function json(url,{token,signal,method='GET',body,headers={}}={}) {
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password) throw new ProviderError('UNAVAILABLE');
  const canRetry=method==='GET'&&githubHost(u.hostname);
  const delays=canRetry?GITHUB_RETRY_DELAYS_MS:[0];
  let lastResponse=null;

  for(let attempt=0;attempt<delays.length;attempt+=1){
    const delay=delays[attempt];
    if(delay)await wait(delay,signal);
    let response;
    try{
      response=await fetch(u,{method,redirect:'error',signal,headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},body});
    }catch(error){
      if(signal?.aborted||error?.name==='AbortError')throw error;
      if(canRetry&&attempt<delays.length-1)continue;
      throw new ProviderError('UNAVAILABLE',{attempts:attempt+1});
    }
    lastResponse=response;
    if(response.ok)return response.json();

    if(canRetry&&retryableGithubStatus(response.status)&&attempt<delays.length-1)continue;
    throw new ProviderError(providerCode(response),{status:response.status,attempts:attempt+1});
  }
  throw new ProviderError(lastResponse?providerCode(lastResponse):'UNAVAILABLE',{
    status:lastResponse?.status??null,
    attempts:delays.length,
  });
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
