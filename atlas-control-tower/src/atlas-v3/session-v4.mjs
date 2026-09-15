import {parseSemanticLocation,serializeSemanticLocation} from './semantic-v4.mjs';

export const ATLAS_SESSION_KEY='atlas-neural-v4:1';

export function readAtlasSession(storage=globalThis?.sessionStorage){
  try{
    const raw=storage?.getItem?.(ATLAS_SESSION_KEY);
    if(!raw)return null;
    return parseSemanticLocation(raw);
  }catch{return null}
}

export function writeAtlasSession(storage,state){
  try{
    if(!storage?.setItem)return false;
    storage.setItem(ATLAS_SESSION_KEY,serializeSemanticLocation(state));
    return true;
  }catch{return false}
}
