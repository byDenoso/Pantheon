import {validateSanctionedProjection} from '../../scripts/build-pages-system.mjs';

const DEFAULT_URL='https://bydenoso.github.io/Pantheon/tower-projection/publication.json';
const inflight=new Map();

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
  const url=String(env.NEXO_PUBLIC_PUBLICATION_URL||DEFAULT_URL).trim();
  if(new URL(url).protocol!=='https:')throw new Error('PUBLICATION_URL_INVALID');
  let pending=inflight.get(url);
  if(!pending){
    pending=(async()=>{
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});
      if(!response.ok)throw new Error('PUBLICATION_UNAVAILABLE');
      const raw=await response.text();
      if(Buffer.byteLength(raw)>16*1024*1024)throw new Error('PUBLICATION_TOO_LARGE');
      return JSON.parse(raw);
    })();
    inflight.set(url,pending);
    const release=()=>{if(inflight.get(url)===pending)inflight.delete(url);};
    void pending.then(release,release);
  }
  return researchSnapshotFromPublication(await waitFor(pending,signal),now);
}
