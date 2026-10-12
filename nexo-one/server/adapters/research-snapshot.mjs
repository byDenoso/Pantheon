import {validateSanctionedProjection} from '../../scripts/build-pages-system.mjs';

const DEFAULT_URL='https://bydenoso.github.io/Pantheon/tower-projection/publication.json';
const inflight=new Map();
const MAX_PUBLICATION_BYTES=16*1024*1024;

async function readBoundedPublication(response){
  const reader=response.body?.getReader();
  if(!reader)throw new Error('PUBLICATION_UNAVAILABLE');
  const chunks=[];
  let size=0;
  try{
    if(Number(response.headers.get('content-length'))>MAX_PUBLICATION_BYTES)throw new Error('PUBLICATION_TOO_LARGE');
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_PUBLICATION_BYTES)throw new Error('PUBLICATION_TOO_LARGE');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export function researchSnapshotFromPublication(publication,now=Date.now()){
  if(publication?.contract!=='NEXO_PUBLIC_PROJECTION_PUBLICATION_V1')throw new Error('PUBLICATION_CONTRACT_INVALID');
  const manifest=validateSanctionedProjection(publication.projection,publication.manifest);
  if(publication.build_meta?.projection_fingerprint!==manifest.projection_fingerprint)throw new Error('PUBLICATION_FINGERPRINT_MISMATCH');
  return {
    authority:manifest.authority,projectionAuthority:'DERIVED_FROM_TOWER',projectionOnly:true,
    sourceVersion:manifest.tower_revision||manifest.tower_commit,
    sourceModifiedAt:manifest.generated_at||'',generatedAt:manifest.generated_at||'',
    lastReadAt:new Date(now).toISOString(),fingerprint:manifest.projection_fingerprint,
    projection:publication.projection,manifest
  };
}

function waitFor(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

// Only concurrent reads share a request. Every later read revalidates the actual
// publication, including failures; a consumer cannot abort another consumer.
export async function readResearchSnapshot({env=process.env,signal,now=Date.now()}={}){
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  const url=String(env.NEXO_PUBLIC_PUBLICATION_URL||DEFAULT_URL).trim();
  let parsedUrl;
  try{parsedUrl=new URL(url);}catch{throw new Error('PUBLICATION_URL_INVALID');}
  if(parsedUrl.protocol!=='https:'||parsedUrl.username||parsedUrl.password)throw new Error('PUBLICATION_URL_INVALID');
  let pending=inflight.get(url);
  if(!pending){
    pending=(async()=>{
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});
      if(!response.ok){
        const limited=response.status===429||(response.status===403&&response.headers.get('x-ratelimit-remaining')==='0');
        const code=limited?'RATE_LIMITED':[401,403].includes(response.status)?'AUTH_REQUIRED':'UNAVAILABLE';
        await response.body?.cancel().catch(()=>{});
        throw Object.assign(new Error('PUBLICATION_UNAVAILABLE'),{code});
      }
      return readBoundedPublication(response);
    })();
    inflight.set(url,pending);
    const release=()=>{if(inflight.get(url)===pending)inflight.delete(url);};
    void pending.then(release,release);
  }
  return researchSnapshotFromPublication(await waitFor(pending,signal),now);
}
