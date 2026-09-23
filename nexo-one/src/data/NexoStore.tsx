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
    const cache=manual?'no-store':'default';
    const topologyUrl=new URL(`${base}mcp/topology.json${revision}`,window.location.origin).toString();
    const metaUrl=new URL(`${base}build-meta.json${revision}`,window.location.origin).toString();
    const manifestUrl=new URL(`${base}tower-projection/manifest.json${revision}`,window.location.origin).toString();
    const [topology,buildMeta,towerManifest]=await Promise.all([
      fetchSharedJson<TTopology>(topologyUrl,{cache,signal}),
      fetchSharedJson<Record<string,unknown>>(metaUrl,{cache,signal}).catch(()=>null),
      fetchSharedJson<Record<string,unknown>>(manifestUrl,{cache,signal}).catch(()=>null),
    ]);
    return {topology,buildMeta,towerManifest};
  },[]);
  return <StoreContext.Provider value={{system,loadPublishedContext}}>{children}</StoreContext.Provider>;
}

export function useNexoStore(){
  const store=useContext(StoreContext);
  if(!store)throw new Error('NEXO_STORE_PROVIDER_MISSING');
  return store;
}
