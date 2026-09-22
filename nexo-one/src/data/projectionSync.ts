import {DataSourceError} from './adapters/source.ts';

const configuredSyncEndpoint = String(import.meta.env?.VITE_NEXO_SYNC_ENDPOINT || '').trim();

export type ProjectionSyncReceipt = {
  outcome: 'DISPATCHED';
  request_id: string;
  deduplicated?: boolean;
};

type BuildMeta = {
  contract?: string;
  pantheon_commit?: string;
  projection_fingerprint?: string;
  sync_request_id?: string;
  built_at?: string;
};

function rootAsset(name:string):string{
  const base = typeof window === 'undefined'
    ? 'http://localhost/'
    : new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString();
  return new URL(name, base).toString();
}

function abortableDelay(ms:number,signal?:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){
      reject(new DOMException('Aborted','AbortError'));
      return;
    }
    const timer=window.setTimeout(resolve,ms);
    signal?.addEventListener('abort',()=>{
      window.clearTimeout(timer);
      reject(new DOMException('Aborted','AbortError'));
    },{once:true});
  });
}

export function projectionSyncAvailable():boolean{
  return Boolean(configuredSyncEndpoint);
}

export async function dispatchProjectionSync(currentFingerprint:string,signal?:AbortSignal):Promise<ProjectionSyncReceipt>{
  if(!configuredSyncEndpoint){
    throw new DataSourceError('NOT_CONNECTED','A ponte de sincronização real não está configurada neste build.');
  }
  const response=await fetch(configuredSyncEndpoint,{
    method:'POST',
    mode:'cors',
    cache:'no-store',
    signal,
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({current_fingerprint:currentFingerprint}),
  });
  if(!response.ok){
    let error='SYNC_DISPATCH_FAILED';
    try{error=String((await response.json())?.error||error);}catch{/* resposta sem JSON */}
    throw new DataSourceError('UNAVAILABLE','A sincronização não foi disparada: '+error+'.');
  }
  const receipt=await response.json() as ProjectionSyncReceipt;
  if(receipt.outcome!=='DISPATCHED'||!receipt.request_id){
    throw new DataSourceError('CONTRACT_MISMATCH','A ponte de sincronização não retornou um request_id válido.');
  }
  return receipt;
}

export async function waitForProjectionSync(
  requestId:string,
  signal?:AbortSignal,
  options:{timeoutMs?:number;pollMs?:number}={},
):Promise<BuildMeta>{
  const timeoutMs=options.timeoutMs??120_000;
  const pollMs=options.pollMs??2_000;
  const started=Date.now();
  const metaUrl=rootAsset('build-meta.json');

  while(Date.now()-started<timeoutMs){
    const url=new URL(metaUrl);
    url.searchParams.set('sync_readback',requestId);
    url.searchParams.set('t',String(Date.now()));
    try{
      const response=await fetch(url,{cache:'no-store',signal,headers:{'Cache-Control':'no-cache'}});
      if(response.ok){
        const meta=await response.json() as BuildMeta;
        if(meta.contract==='NEXO_ONE_BUILD_META_V1'&&meta.sync_request_id===requestId)return meta;
      }
    }catch(error){
      if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
      // Pages can briefly return a network/CDN miss while a deployment propagates.
      // Keep polling the exact request_id instead of converting propagation into failure.
    }
    await abortableDelay(pollMs,signal);
  }
  throw new DataSourceError('UNAVAILABLE','O dispatch foi aceito, mas o Pages não confirmou a publicação dentro do limite de readback.');
}
