import {createContext, useCallback, useContext, type ReactNode} from 'react';
import {useSystem, type SystemStore} from './useSystem.ts';
import {fetchSharedJson} from './shared-json.ts';

export interface NexoPublishedContext<TTopology=unknown>{
  topology:TTopology;
  buildMeta:Record<string,unknown>|null;
  towerManifest:Record<string,unknown>|null;
}

interface NexoStoreValue{
  system:SystemStore;
  loadPublishedContext<TTopology>(manual?:boolean,signal?:AbortSignal):Promise<NexoPublishedContext<TTopology>>;
}

const StoreContext=createContext<NexoStoreValue|null>(null);

export function NexoStoreProvider({children}:{children:ReactNode}){
  const system=useSystem();
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
  return <StoreContext.Provider value={{system,loadPublishedContext}}>{children}</StoreContext.Provider>;
}

export function useNexoStore(){
  const store=useContext(StoreContext);
  if(!store)throw new Error('NEXO_STORE_PROVIDER_MISSING');
  return store;
}
