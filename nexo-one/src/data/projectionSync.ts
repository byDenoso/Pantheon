import {DataSourceError} from './adapters/source.ts';

const configuredSyncEndpoint = String(import.meta.env?.VITE_NEXO_SYNC_ENDPOINT || '').trim();
const PUBLISHED_PROJECTION_ASSET = 'tower-projection/projection.json';
const PUBLISHED_MANIFEST_ASSET = 'tower-projection/manifest.json';
const PUBLISHED_BUILD_META_ASSET = 'build-meta.json';
const PUBLISHED_RETRY_DELAYS_MS = [0, 350, 900] as const;

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
      origin_channel: 'GITHUB_PAGES_VALIDATED';
    };

type BuildMeta = {
  contract?: string;
  pantheon_commit?: string;
  projection_fingerprint?: string;
  sync_request_id?: string;
  built_at?: string;
};

type PublicManifest = {
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

type PublicProjection = {
  contract?: string;
  counts?: {active_work?:number;needs_dener?:number};
  manifest?: PublicManifest;
};

function rootAsset(name:string):string{
  const base = typeof window === 'undefined'
    ? 'http://localhost/'
    : new URL(import.meta.env?.BASE_URL || '/', window.location.origin).toString();
  return new URL(name, base).toString();
}

function abortableDelay(ms:number,signal?:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){
      reject(new DOMException('Aborted','AbortError'));
      return;
    }
    const timer=(typeof window === 'undefined' ? globalThis.setTimeout : window.setTimeout)(resolve,ms);
    signal?.addEventListener('abort',()=>{
      (typeof window === 'undefined' ? globalThis.clearTimeout : window.clearTimeout)(timer);
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

async function fetchPublishedJson<T>(
  asset:string,
  label:string,
  signal?:AbortSignal,
):Promise<T>{
  let lastMessage=label+' não respondeu.';
  let lastStatus:number|undefined;

  for(let attempt=0;attempt<PUBLISHED_RETRY_DELAYS_MS.length;attempt+=1){
    const delay=PUBLISHED_RETRY_DELAYS_MS[attempt]||0;
    if(delay>0)await abortableDelay(delay,signal);

    const url=new URL(rootAsset(asset));
    url.searchParams.set('sync_readback',String(Date.now())+'-'+String(attempt));

    try{
      const response=await fetch(url,{
        cache:'no-store',
        signal,
        headers:{Accept:'application/json'},
      });

      if(!response.ok){
        lastStatus=response.status;
        lastMessage=label+' retornou HTTP '+String(response.status)
          +(response.statusText?' '+response.statusText:'')+'.';
        if(!retryableStatus(response.status))break;
        continue;
      }

      try{
        return await response.json() as T;
      }catch{
        lastStatus=response.status;
        lastMessage=label+' respondeu HTTP '+String(response.status)+', mas sem JSON válido.';
        break;
      }
    }catch(error){
      if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
      lastStatus=undefined;
      lastMessage=label+' não respondeu.';
    }
  }

  throw new ProjectionOriginError(lastMessage,lastStatus);
}

function validSha256(value:string):boolean{
  return /^sha256:[0-9a-f]{64}$/i.test(value);
}

function sameManifest(a:PublicManifest,b:PublicManifest):boolean{
  return String(a.projection_fingerprint||'')===String(b.projection_fingerprint||'')
    &&String(a.source_snapshot_id||'')===String(b.source_snapshot_id||'')
    &&String(a.source_state_fingerprint||'')===String(b.source_state_fingerprint||'');
}

function projectionReceipt(
  projection:PublicProjection,
  publishedManifest:PublicManifest,
  buildMeta:BuildMeta,
):ProjectionSyncReceipt{
  const manifest=projection.manifest||{};
  const fingerprint=String(manifest.projection_fingerprint||'');
  const stateFingerprint=String(manifest.source_state_fingerprint||'');
  const snapshotId=String(manifest.source_snapshot_id||'');
  const generatedAt=String(manifest.generated_at||'');
  const activeWork=Number(projection.counts?.active_work);
  const needsDener=Number(projection.counts?.needs_dener);

  const validContract=projection.contract==='NEXO_PUBLIC_PROJECTION_V1'
    &&manifest.authority==='TOWER_V06'
    &&manifest.projection_only===true
    &&manifest.writeback==='FORBIDDEN'
    &&manifest.source_storage==='GOOGLE_DRIVE_PRIVATE'
    &&manifest.truth_owner==='TOWER_V06@GOOGLE_DRIVE_PRIVATE'
    &&Boolean(snapshotId)
    &&validSha256(fingerprint)
    &&validSha256(stateFingerprint)
    &&Number.isFinite(Date.parse(generatedAt))
    &&Number.isInteger(activeWork)
    &&activeWork>=0
    &&Number.isInteger(needsDener)
    &&needsDener>=0;

  const validPublishedPair=sameManifest(manifest,publishedManifest)
    &&publishedManifest.authority==='TOWER_V06'
    &&publishedManifest.projection_only===true
    &&publishedManifest.writeback==='FORBIDDEN'
    &&publishedManifest.source_storage==='GOOGLE_DRIVE_PRIVATE'
    &&publishedManifest.truth_owner==='TOWER_V06@GOOGLE_DRIVE_PRIVATE';

  const validBuildMeta=buildMeta.contract==='NEXO_ONE_BUILD_META_V1'
    &&String(buildMeta.projection_fingerprint||'')===fingerprint
    &&/^[0-9a-f]{40}$/i.test(String(buildMeta.pantheon_commit||''))
    &&Number.isFinite(Date.parse(String(buildMeta.built_at||'')));

  if(!validContract||!validPublishedPair||!validBuildMeta){
    throw new DataSourceError(
      'CONTRACT_MISMATCH',
      'O snapshot publicado respondeu, mas projeção, manifesto e build-meta não fecharam o mesmo fingerprint validado.',
    );
  }

  return {
    outcome:'PUBLIC_PROJECTION_REFRESHED',
    projection_fingerprint:fingerprint,
    source_snapshot_id:snapshotId,
    source_state_fingerprint:stateFingerprint,
    generated_at:generatedAt,
    active_work:activeWork,
    needs_dener:needsDener,
    origin_channel:'GITHUB_PAGES_VALIDATED',
  };
}

async function fetchFreshPublicProjection(signal?:AbortSignal):Promise<ProjectionSyncReceipt>{
  try{
    const [projection,manifest,buildMeta]=await Promise.all([
      fetchPublishedJson<PublicProjection>(PUBLISHED_PROJECTION_ASSET,'Snapshot publicado',signal),
      fetchPublishedJson<PublicManifest>(PUBLISHED_MANIFEST_ASSET,'Manifesto publicado',signal),
      fetchPublishedJson<BuildMeta>(PUBLISHED_BUILD_META_ASSET,'Build-meta publicado',signal),
    ]);
    return projectionReceipt(projection,manifest,buildMeta);
  }catch(error){
    if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
    if(error instanceof DataSourceError)throw error;
    const failure=error instanceof ProjectionOriginError
      ? error.message
      : 'Falha não classificada na leitura do snapshot publicado.';
    throw new DataSourceError(
      'UNAVAILABLE',
      'O snapshot validado do Atlas está indisponível. '+failure
        +' O último snapshot válido foi preservado; a interface não regride para uma origem privada ou não validada.',
    );
  }
}

export function projectionSyncAvailable():boolean{
  return Boolean(configuredSyncEndpoint||PUBLISHED_PROJECTION_ASSET);
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
      throw new DataSourceError(
        'UNAVAILABLE',
        'SYNC_BRIDGE_NOT_CONFIGURED: a ponte de sincronização real está sem a credencial GITHUB_TOKEN no runtime Vercel; nenhum dispatch foi executado.',
      );
    }
    throw new DataSourceError('UNAVAILABLE','A sincronização real não foi disparada: '+error+'.');
  }catch(error){
    if(signal?.aborted||(error as Error)?.name==='AbortError')throw error;
    if(error instanceof DataSourceError)throw error;
    throw new DataSourceError(
      'UNAVAILABLE',
      'A ponte de sincronização real não respondeu. Nenhum dispatch foi confirmado; o último snapshot publicado foi preservado.',
    );
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
  const metaUrl=rootAsset(PUBLISHED_BUILD_META_ASSET);

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
