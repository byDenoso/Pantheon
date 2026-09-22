import {DataSourceError} from './adapters/source.ts';

const configuredSyncEndpoint = String(import.meta.env?.VITE_NEXO_SYNC_ENDPOINT || '').trim();
const PUBLIC_PROJECTION_ENDPOINT =
  'https://raw.githubusercontent.com/byDenoso/NEXO-Obsidian-Vault/main/TOWER_V06/projections/public/projection.json';

export type ProjectionSyncReceipt =
  | {
      outcome: 'DISPATCHED';
      request_id: string;
      deduplicated?: boolean;
    }
  | {
      outcome: 'PUBLIC_PROJECTION_REFRESHED';
      projection_fingerprint: string;
      source_snapshot_id: string;
      source_state_fingerprint: string;
      generated_at: string;
      active_work: number;
      needs_dener: number;
    };

type BuildMeta = {
  contract?: string;
  pantheon_commit?: string;
  projection_fingerprint?: string;
  sync_request_id?: string;
  built_at?: string;
};

type PublicProjection = {
  contract?: string;
  counts?: {active_work?:number;needs_dener?:number};
  manifest?: {
    authority?: string;
    projection_only?: boolean;
    writeback?: string;
    projection_fingerprint?: string;
    generated_at?: string;
    source_storage?: string;
    source_snapshot_id?: string;
    source_state_fingerprint?: string;
    truth_owner?: string;
  };
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

async function fetchFreshPublicProjection(signal?:AbortSignal):Promise<ProjectionSyncReceipt>{
  const url=new URL(PUBLIC_PROJECTION_ENDPOINT);
  url.searchParams.set('sync_readback',String(Date.now()));
  const response=await fetch(url,{
    cache:'no-store',
    signal,
    headers:{Accept:'application/json','Cache-Control':'no-cache'},
  });
  if(!response.ok){
    throw new DataSourceError('UNAVAILABLE','A projeção pública sancionada não pôde ser consultada na origem.');
  }
  const projection=await response.json() as PublicProjection;
  const manifest=projection.manifest||{};
  const fingerprint=String(manifest.projection_fingerprint||'');
  const stateFingerprint=String(manifest.source_state_fingerprint||'');
  const snapshotId=String(manifest.source_snapshot_id||'');

  if(projection.contract!=='NEXO_PUBLIC_PROJECTION_V1'
    ||manifest.authority!=='TOWER_V06'
    ||manifest.projection_only!==true
    ||manifest.writeback!=='FORBIDDEN'
    ||manifest.source_storage!=='GOOGLE_DRIVE_PRIVATE'
    ||manifest.truth_owner!=='TOWER_V06@GOOGLE_DRIVE_PRIVATE'
    ||!snapshotId
    ||!/^sha256:[0-9a-f]{64}$/i.test(fingerprint)
    ||!/^sha256:[0-9a-f]{64}$/i.test(stateFingerprint)){
    throw new DataSourceError('CONTRACT_MISMATCH','A origem pública respondeu, mas não passou o contrato Drive-primary da Tower.');
  }

  return {
    outcome:'PUBLIC_PROJECTION_REFRESHED',
    projection_fingerprint:fingerprint,
    source_snapshot_id:snapshotId,
    source_state_fingerprint:stateFingerprint,
    generated_at:String(manifest.generated_at||''),
    active_work:Number(projection.counts?.active_work||0),
    needs_dener:Number(projection.counts?.needs_dener||0),
  };
}

export function projectionSyncAvailable():boolean{
  // Mesmo sem bridge autenticado, a projeção pública sancionada continua sendo
  // uma fonte real e no-cache de verificação da cadeia Drive -> export mirror.
  return Boolean(configuredSyncEndpoint||PUBLIC_PROJECTION_ENDPOINT);
}

export async function dispatchProjectionSync(currentFingerprint:string,signal?:AbortSignal):Promise<ProjectionSyncReceipt>{
  if(!configuredSyncEndpoint)return fetchFreshPublicProjection(signal);

  try{
    const response=await fetch(configuredSyncEndpoint,{
      method:'POST',
      mode:'cors',
      cache:'no-store',
      signal,
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({current_fingerprint:currentFingerprint}),
    });

    if(response.ok){
      const receipt=await response.json() as ProjectionSyncReceipt;
      if(receipt.outcome!=='DISPATCHED'||!('request_id' in receipt)||!receipt.request_id){
        throw new DataSourceError('CONTRACT_MISMATCH','A ponte de sincronização não retornou um request_id válido.');
      }
      return receipt;
    }

    let error='SYNC_DISPATCH_FAILED';
    try{error=String((await response.json())?.error||error);}catch{/* resposta sem JSON */}
    if(response.status===503&&error==='SYNC_BRIDGE_NOT_CONFIGURED'){
      return fetchFreshPublicProjection(signal);
    }
    throw new DataSourceError('UNAVAILABLE','A sincronização não foi disparada: '+error+'.');
  }catch(error){
    if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
    if(error instanceof DataSourceError)throw error;
    // Falha de rede no bridge não deve rebaixar o botão a um refresh local.
    // Faz uma consulta real e no-cache à projeção pública sancionada.
    return fetchFreshPublicProjection(signal);
  }
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
    }
    await abortableDelay(pollMs,signal);
  }
  throw new DataSourceError('UNAVAILABLE','O dispatch foi aceito, mas o Pages não confirmou a publicação dentro do limite de readback.');
}
