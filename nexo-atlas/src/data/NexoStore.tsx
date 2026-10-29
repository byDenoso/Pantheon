import {createContext, useCallback, useContext, useRef, useState, type ReactNode} from 'react';
import {useSystem, type SystemStore} from './useSystem.ts';
import {fetchSharedJson} from './shared-json.ts';
import {
  AtlasObservationError,
  EMPTY_ATLAS_OBSERVATION,
  observeGalaxySnapshot,
  transitionAtlasObservation,
  type AtlasObservationAction,
  type AtlasObservationState,
} from './atlasObservation.ts';

export interface NexoPublishedContext<TTopology=unknown>{
  topology:TTopology;
  buildMeta:Record<string,unknown>|null;
  towerManifest:Record<string,unknown>|null;
}

interface NexoStoreValue{
  system:SystemStore;
  atlasObservation:AtlasObservationState;
  loadPublishedContext<TTopology>(manual?:boolean,signal?:AbortSignal):Promise<NexoPublishedContext<TTopology>>;
  loadAtlasSnapshot(endpoint:string,expectedFingerprint:string,signal?:AbortSignal):Promise<void>;
}

const StoreContext=createContext<NexoStoreValue|null>(null);

export function NexoStoreProvider({children}:{children:ReactNode}){
  const system=useSystem();
  const [atlasObservation,setAtlasObservation]=useState(EMPTY_ATLAS_OBSERVATION);
  const atlasObservationRef=useRef(atlasObservation);
  const requestIdRef=useRef(0);
  const publishAtlasAction=useCallback((action:AtlasObservationAction)=>{
    const next=transitionAtlasObservation(atlasObservationRef.current,action);
    atlasObservationRef.current=next;
    setAtlasObservation(next);
    return next;
  },[]);

  const loadPublishedContext=useCallback(async<TTopology,>(manual=false,signal?:AbortSignal)=>{
    const base=import.meta.env.BASE_URL;
    const revision=manual?`?readback=${Date.now()}`:'';
    const cache=manual?'no-store':'no-cache';
    const topologyUrl=new URL(`${base}mcp/topology.json${revision}`,window.location.origin).toString();
    const publicationUrl=new URL(`${base}tower-projection/publication.json${revision}`,window.location.origin).toString();
    const [topology,publication]=await Promise.all([
      fetchSharedJson<TTopology>(topologyUrl,{cache,signal}),
      fetchSharedJson<Record<string,unknown>>(publicationUrl,{cache,signal}),
    ]);
    if(publication.contract!=='NEXO_PUBLIC_PROJECTION_PUBLICATION_V1'){
      throw new Error('NEXO_PUBLICATION_CONTRACT_MISMATCH');
    }
    const buildMeta=(publication.build_meta&&typeof publication.build_meta==='object'
      ? publication.build_meta : null) as Record<string,unknown>|null;
    const towerManifest=(publication.manifest&&typeof publication.manifest==='object'
      ? publication.manifest : null) as Record<string,unknown>|null;
    const manifestFingerprint=String(towerManifest?.projection_fingerprint||'');
    const buildFingerprint=String(buildMeta?.projection_fingerprint||'');
    const topologySource=(topology as {source?:{projection_fingerprint?:unknown}})?.source;
    const topologyFingerprint=String(topologySource?.projection_fingerprint||'');
    if(!manifestFingerprint||buildFingerprint!==manifestFingerprint
      ||(topologyFingerprint&&topologyFingerprint!==manifestFingerprint)){
      throw new Error('NEXO_PUBLISHED_CONTEXT_FINGERPRINT_MISMATCH');
    }
    return {topology,buildMeta,towerManifest};
  },[]);

  const loadAtlasSnapshot=useCallback(async(endpoint:string,expectedFingerprint:string,signal?:AbortSignal)=>{
    const requestId=++requestIdRef.current;
    publishAtlasAction({type:'REQUEST',request_id:requestId,fingerprint:expectedFingerprint});
    const delays=[0,800,2400] as const;
    let lastError='UNAVAILABLE';

    for(let attempt=0;attempt<delays.length;attempt+=1){
      const delay=delays[attempt]||0;
      if(delay>0){
        await new Promise<void>((resolve,reject)=>{
          if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
          const timer=window.setTimeout(resolve,delay);
          signal?.addEventListener('abort',()=>{
            window.clearTimeout(timer);
            reject(new DOMException('Aborted','AbortError'));
          },{once:true});
        }).catch(error=>{
          if(signal?.aborted||(error as Error)?.name==='AbortError')return;
          throw error;
        });
      }
      if(signal?.aborted||requestId!==requestIdRef.current)return;

      try{
        const url=new URL(endpoint,window.location.href);
        url.searchParams.set('projection',expectedFingerprint);
        url.searchParams.set('readback',String(Date.now())+'-'+String(attempt));
        const response=await fetch(url,{signal,cache:'no-store',headers:{Accept:'application/json'}});
        if(!response.ok)throw new AtlasObservationError('HTTP_'+String(response.status));
        const snapshot=observeGalaxySnapshot(await response.json(),expectedFingerprint,new Date().toISOString());
        if(signal?.aborted||requestId!==requestIdRef.current)return;
        if(snapshot.coverage!=='COMPLETE')throw new AtlasObservationError('PARTIAL_COVERAGE');
        publishAtlasAction({type:'ACCEPT',request_id:requestId,snapshot});
        return;
      }catch(error){
        if(signal?.aborted||(error as Error)?.name==='AbortError')return;
        if(requestId!==requestIdRef.current)return;
        lastError=error instanceof AtlasObservationError?error.code:'UNAVAILABLE';
        if(attempt===delays.length-1){
          publishAtlasAction({type:'REJECT',request_id:requestId,code:lastError});
        }
      }
    }
  },[publishAtlasAction]);

  return <StoreContext.Provider value={{system,atlasObservation,loadPublishedContext,loadAtlasSnapshot}}>{children}</StoreContext.Provider>;
}

export function useNexoStore(){
  const store=useContext(StoreContext);
  if(!store)throw new Error('NEXO_STORE_PROVIDER_MISSING');
  return store;
}
