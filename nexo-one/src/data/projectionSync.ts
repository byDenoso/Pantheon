import {DataSourceError} from './adapters/source.ts';

const configuredSyncEndpoint = String(import.meta.env?.VITE_NEXO_SYNC_ENDPOINT || '').trim();
const PUBLIC_PROJECTION_RAW_ENDPOINT =
  'https://raw.githubusercontent.com/byDenoso/NEXO-Obsidian-Vault/main/TOWER_V06/projections/public/projection.json';
const PUBLIC_PROJECTION_API_ENDPOINT =
  'https://api.github.com/repos/byDenoso/NEXO-Obsidian-Vault/contents/TOWER_V06/projections/public/projection.json?ref=main';
const RAW_RETRY_DELAYS_MS = [0, 350, 900] as const;
const API_RETRY_DELAYS_MS = [0, 450] as const;

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
      origin_channel: 'GITHUB_RAW' | 'GITHUB_API_FALLBACK';
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

class ProjectionOriginError extends Error {
  status?: number;
  constructor(message:string,status?:number){
    super(message);
    this.name='ProjectionOriginError';
    this.status=status;
  }
}

function retryableStatus(status:number):boolean{
  return status===408||status===425||status===429||status===500||status===502||status===503||status===504;
}

async function fetchProjectionJson(
  endpoint:string,
  originLabel:string,
  accept:string,
  retryDelays:readonly number[],
  signal?:AbortSignal,
):Promise<PublicProjection>{
  let lastMessage=originLabel+' não respondeu.';
  let lastStatus:number|undefined;

  for(let attempt=0;attempt<retryDelays.length;attempt+=1){
    const delay=retryDelays[attempt]||0;
    if(delay>0)await abortableDelay(delay,signal);

    const url=new URL(endpoint);
    if(originLabel==='GitHub Raw'){
      url.searchParams.set('sync_readback',String(Date.now())+'-'+String(attempt));
    }

    try{
      const response=await fetch(url,{
        cache:'no-store',
        signal,
        headers:{Accept:accept},
      });

      if(!response.ok){
        lastStatus=response.status;
        lastMessage=originLabel+' retornou HTTP '+String(response.status)
          +(response.statusText?' '+response.statusText:'')+'.';
        if(!retryableStatus(response.status))break;
        continue;
      }

      try{
        return await response.json() as PublicProjection;
      }catch{
        lastStatus=response.status;
        lastMessage=originLabel+' respondeu HTTP '+String(response.status)+', mas sem JSON válido.';
        break;
      }
    }catch(error){
      if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
      lastStatus=undefined;
      lastMessage=originLabel+' não respondeu ao JavaScript. Em respostas HTTP 5xx sem headers CORS, '
        +'o navegador pode mascarar a indisponibilidade upstream como erro de CORS; o DevTools mostra o HTTP real.';
    }
  }

  throw new ProjectionOriginError(lastMessage,lastStatus);
}

function projectionReceipt(
  projection:PublicProjection,
  originChannel:'GITHUB_RAW'|'GITHUB_API_FALLBACK',
):ProjectionSyncReceipt{
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
    origin_channel:originChannel,
  };
}

async function fetchFreshPublicProjection(signal?:AbortSignal):Promise<ProjectionSyncReceipt>{
  let rawFailure:ProjectionOriginError;

  try{
    const projection=await fetchProjectionJson(
      PUBLIC_PROJECTION_RAW_ENDPOINT,
      'GitHub Raw',
      'application/json',
      RAW_RETRY_DELAYS_MS,
      signal,
    );
    return projectionReceipt(projection,'GITHUB_RAW');
  }catch(error){
    if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
    if(error instanceof DataSourceError)throw error;
    rawFailure=error instanceof ProjectionOriginError
      ? error
      : new ProjectionOriginError('GitHub Raw falhou por uma causa não classificada.');
  }

  try{
    const projection=await fetchProjectionJson(
      PUBLIC_PROJECTION_API_ENDPOINT,
      'Fallback GitHub API',
      'application/vnd.github.raw+json',
      API_RETRY_DELAYS_MS,
      signal,
    );
    return projectionReceipt(projection,'GITHUB_API_FALLBACK');
  }catch(error){
    if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
    if(error instanceof DataSourceError)throw error;
    const apiFailure=error instanceof ProjectionOriginError
      ? error
      : new ProjectionOriginError('Fallback GitHub API falhou por uma causa não classificada.');
    throw new DataSourceError(
      'UNAVAILABLE',
      'A origem GitHub da projeção está indisponível. '+rawFailure.message+' '+apiFailure.message
        +' O último snapshot válido foi preservado; tente sincronizar novamente quando a origem estabilizar.',
    );
  }
}

export function projectionSyncAvailable():boolean{
  // Mesmo sem bridge autenticado, a projeção pública sancionada continua sendo
  // uma fonte real e no-cache de verificação da cadeia Drive -> export mirror.
  return Boolean(configuredSyncEndpoint||PUBLIC_PROJECTION_RAW_ENDPOINT||PUBLIC_PROJECTION_API_ENDPOINT);
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
