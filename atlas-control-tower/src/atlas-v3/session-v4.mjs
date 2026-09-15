import {parseSemanticLocation,serializeSemanticLocation} from './semantic-v4.mjs';

export const ATLAS_SESSION_KEY='atlas-neural-v4:1';
export const ATLAS_VIEW_PARAM='atlas-view';

export function readAtlasSession(storage=globalThis?.sessionStorage,location=globalThis?.location){
  try{
    const search=String(location?.search||'');
    if(search){
      const linked=new URLSearchParams(search).get(ATLAS_VIEW_PARAM);
      const parsed=linked?parseSemanticLocation(linked):null;
      if(parsed)return parsed;
    }
    const raw=storage?.getItem?.(ATLAS_SESSION_KEY);
    if(!raw)return null;
    return parseSemanticLocation(raw);
  }catch{return null}
}

export function writeAtlasSession(storage,state,history=globalThis?.history,location=globalThis?.location){
  try{
    if(!storage?.setItem)return false;
    const serialized=serializeSemanticLocation(state);
    storage.setItem(ATLAS_SESSION_KEY,serialized);
    if(history?.replaceState&&location?.href){
      const url=new URL(location.href);
      url.searchParams.set(ATLAS_VIEW_PARAM,serialized);
      history.replaceState(null,'',url.toString());
    }
    return true;
  }catch{return false}
}
